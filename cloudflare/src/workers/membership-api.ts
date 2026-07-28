import { authenticateUser } from "../shared/auth";
import {
  getAccessContext,
  getActiveEntitlement,
  getContentItem,
  getRegisteredDevice,
  getUserProfile,
  isoNow,
  touchRegisteredDevice,
} from "../shared/db";
import {
  ApiError,
  allowedOrigins,
  corsHeaders,
  enforceAllowedOrigin,
  enforceRateLimit,
  errorResponse,
  jsonResponse,
  logEvent,
  parsePositiveInt,
  preflight,
  readJsonBody,
  readRawBody,
  requestId,
  requireIdempotencyKey,
} from "../shared/http";
import { authorizeProtectedContent } from "../shared/policy";
import {
  sendTransactionalEmail,
  updateAppwriteUserStatus,
  updateAppwriteUserPassword,
  verifyAppwriteUserEmail,
} from "../shared/identity-service";
import { sha256Hex, validateDeviceToken } from "../shared/security";
import type {
  AgeEvidenceKind,
  EntitlementRow,
  MembershipEnv,
  UserProfileRow,
} from "../shared/types";

const AGE_INSTRUCTIONS_VERSION = "manual-age-v3";
const PRIVACY_NOTICE_VERSION = "PRIVACY-2026-07-27";
const ISO_COUNTRIES = new Set(`
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR
PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN
SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW
TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/));
const EEA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO",
  "PL", "PT", "RO", "SE", "SI", "SK",
]);
const US_REGIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY", "AS", "GU", "MP", "PR", "VI",
]);
const PRIVACY_REQUEST_TYPES = new Set([
  "RESTRICT_PROCESSING",
  "OBJECT_PROCESSING",
  "APPEAL",
]);

function normalizeCountry(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "COUNTRY_REQUIRED");
  const country = value.trim().toUpperCase();
  if (!ISO_COUNTRIES.has(country)) throw new ApiError(400, "INVALID_COUNTRY");
  return country;
}

function normalizeRegion(country: string, value: unknown): string | null {
  if (country !== "US") return null;
  if (typeof value !== "string") throw new ApiError(400, "US_STATE_REQUIRED");
  const region = value.trim().toUpperCase();
  if (!US_REGIONS.has(region)) throw new ApiError(400, "INVALID_US_STATE");
  return region;
}

function privacyRegime(country: string, region: string | null): {
  regime: "EU_GDPR" | "US_STATE_PRIVACY" | "GLOBAL_BASELINE";
  jurisdiction: string;
} {
  if (EEA_COUNTRIES.has(country)) {
    return { regime: "EU_GDPR", jurisdiction: `EU-EEA-${country}` };
  }
  if (country === "US" && region) {
    return { regime: "US_STATE_PRIVACY", jurisdiction: `US-${region}` };
  }
  return { regime: "GLOBAL_BASELINE", jurisdiction: country };
}

function privacyDeadline(regime: string, now = Date.now()): string {
  const days = regime === "US_STATE_PRIVACY" ? 45 : 30;
  return new Date(now + days * 86_400_000).toISOString();
}

function livenessChallenge(): string[] {
  const movements = ["TURN_HEAD_LEFT", "TURN_HEAD_RIGHT", "LOOK_UP", "BLINK_TWICE"];
  const selected: string[] = [];
  while (selected.length < 2) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const [movement] = movements.splice(random % movements.length, 1);
    selected.push(movement!);
  }
  return [
    "FACE_CAMERA",
    "HOLD_ID_NEXT_TO_FACE",
    "SHOW_DOCUMENT_FRONT",
    "SHOW_DOCUMENT_BACK",
    "TILT_DOCUMENT",
    ...selected,
  ];
}

function parseChallenge(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((step) => typeof step === "string")) return parsed;
  } catch {
    // Stored challenge corruption fails closed to an empty, unusable challenge.
  }
  return [];
}

function exactObjectKeys(
  value: unknown,
  allowed: readonly string[],
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_REQUEST");
  }
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new ApiError(400, "UNSUPPORTED_REQUEST_FIELD");
  }
}

async function statusResponse(env: MembershipEnv, userId: string): Promise<Record<string, unknown>> {
  const now = isoNow();
  const row = await env.DB.prepare(`
    WITH active_entitlement AS (
      SELECT tier, expires_at
      FROM entitlements
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
        AND starts_at <= ? AND expires_at > ?
      ORDER BY CASE tier
        WHEN 'EXCLUSIVE_VIP' THEN 3
        WHEN 'EXCLUSIVE_PREMIUM' THEN 2
        ELSE 1
      END DESC, expires_at DESC
      LIMIT 1
    ),
    latest_age_case AS (
      SELECT id, manual_review_status, upload_expires_at,
        instructions_version, liveness_challenge_json
      FROM age_verification_cases
      WHERE appwrite_user_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 1
    )
    SELECT
      p.account_status, p.email_verified, p.age_status, p.country_code,
      p.region_code, p.privacy_regime, p.privacy_notice_acknowledged_at,
      e.tier AS entitlement_tier, e.expires_at AS entitlement_expires_at,
      (SELECT COUNT(*) FROM registered_devices d
        WHERE d.appwrite_user_id = p.appwrite_user_id AND d.status = 'ACTIVE') AS active_device_count,
      a.id AS age_case_id, a.manual_review_status, a.upload_expires_at,
      a.instructions_version, a.liveness_challenge_json,
      (SELECT GROUP_CONCAT(u.evidence_kind, ',')
        FROM age_verification_uploads u
        WHERE u.age_case_id = a.id AND u.deleted_at IS NULL) AS evidence_kinds
    FROM user_profiles p
    LEFT JOIN active_entitlement e ON 1 = 1
    LEFT JOIN latest_age_case a ON 1 = 1
    WHERE p.appwrite_user_id = ?
  `).bind(userId, now, now, userId, userId).first<{
    account_status: string;
    email_verified: number;
    age_status: string;
    country_code: string | null;
    region_code: string | null;
    privacy_regime: string | null;
    privacy_notice_acknowledged_at: string | null;
    entitlement_tier: string | null;
    entitlement_expires_at: string | null;
    active_device_count: number;
    age_case_id: string | null;
    manual_review_status: string | null;
    upload_expires_at: string | null;
    instructions_version: string | null;
    liveness_challenge_json: string | null;
    evidence_kinds: string | null;
  }>();
  if (!row) throw new ApiError(503, "PROFILE_PROJECTION_UNAVAILABLE");
  const evidenceKinds = (row.evidence_kinds ?? "")
    .split(",")
    .filter((value): value is AgeEvidenceKind =>
      value === "DOCUMENT_FRONT" || value === "DOCUMENT_BACK" || value === "VIDEO");
  return {
    account: {
      status: row.account_status,
      emailVerified: row.email_verified === 1,
      restricted: row.account_status === "RESTRICTED",
      deletionPending: row.account_status === "DELETION_PENDING",
      countryCode: row.country_code,
      regionCode: row.region_code,
      privacyRegime: row.privacy_regime,
      privacyProfileComplete: Boolean(
        row.country_code && row.privacy_regime && row.privacy_notice_acknowledged_at,
      ),
    },
    ageVerification: {
      status: row.age_status,
      caseId: row.age_case_id,
      reviewStatus: row.manual_review_status,
      uploadExpiresAt: row.upload_expires_at,
      instructionsVersion: row.instructions_version,
      livenessChallenge: row.liveness_challenge_json
        ? parseChallenge(row.liveness_challenge_json)
        : [],
      evidenceKinds,
    },
    entitlement: row.entitlement_tier && row.entitlement_expires_at
      ? { active: true, tier: row.entitlement_tier, expiresAt: row.entitlement_expires_at }
      : { active: false, tier: null, expiresAt: null },
    devices: {
      active: Number(row.active_device_count),
      limit: parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
    },
  };
}

async function createAgeCase(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  if (env.AGE_REVIEW_MODE !== "manual-r2-v1") {
    throw new ApiError(503, "AGE_VERIFICATION_NOT_CONFIGURED");
  }
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["consent", "instructionsVersion"]);
  if (body.consent !== true || body.instructionsVersion !== AGE_INSTRUCTIONS_VERSION) {
    throw new ApiError(400, "AGE_REVIEW_CONSENT_REQUIRED");
  }
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, status, manual_review_status, upload_expires_at,
      instructions_version, liveness_challenge_json
    FROM age_verification_cases
    WHERE appwrite_user_id = ? AND idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{
    id: string;
    status: string;
    manual_review_status: string;
    upload_expires_at: string;
    instructions_version: string;
    liveness_challenge_json: string;
  }>();
  if (replay) {
    return {
      caseId: replay.id,
      status: replay.status,
      reviewStatus: replay.manual_review_status,
      uploadExpiresAt: replay.upload_expires_at,
      instructionsVersion: replay.instructions_version,
      livenessChallenge: parseChallenge(replay.liveness_challenge_json),
      requiredEvidence: ["DOCUMENT_FRONT", "DOCUMENT_BACK", "VIDEO"],
      optionalEvidence: [],
    };
  }
  const profile = await getUserProfile(env.DB, userId);
  if (!profile || profile.account_status !== "ACTIVE") throw new ApiError(403, "ACCOUNT_NOT_ACTIVE");
  if (profile.age_status === "APPROVED") throw new ApiError(409, "AGE_ALREADY_APPROVED");
  const openCase = await env.DB.prepare(`
    SELECT id FROM age_verification_cases
    WHERE appwrite_user_id = ? AND status = 'PENDING' LIMIT 1
  `).bind(userId).first<{ id: string }>();
  if (openCase) throw new ApiError(409, "AGE_CASE_ALREADY_OPEN");
  const now = isoNow();
  const caseId = crypto.randomUUID();
  const challenge = livenessChallenge();
  const uploadExpiresAt = new Date(
    Date.now() + parsePositiveInt(env.AGE_UPLOAD_WINDOW_MINUTES, 60, 1_440) * 60_000,
  ).toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO age_verification_cases (
          id, appwrite_user_id, status, review_method, manual_review_status,
          instructions_version, consented_at, liveness_challenge_json,
          upload_expires_at, retention_until, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, 'PENDING', 'MANUAL_R2', 'UPLOADING', ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        caseId,
        userId,
        AGE_INSTRUCTIONS_VERSION,
        now,
        JSON.stringify(challenge),
        uploadExpiresAt,
        uploadExpiresAt,
        idempotencyKey,
        now,
        now,
      ),
      env.DB.prepare(`
        UPDATE user_profiles
        SET age_status = 'PENDING', version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ? AND age_status <> 'APPROVED'
      `).bind(now, userId),
    ]);
  } catch {
    throw new ApiError(503, "MEMBERSHIP_DATABASE_UNAVAILABLE");
  }
  return {
    caseId,
    status: "PENDING",
    reviewStatus: "UPLOADING",
    uploadExpiresAt,
    instructionsVersion: AGE_INSTRUCTIONS_VERSION,
    livenessChallenge: challenge,
    requiredEvidence: ["DOCUMENT_FRONT", "DOCUMENT_BACK", "VIDEO"],
    optionalEvidence: [],
  };
}

function evidenceKind(value: string): AgeEvidenceKind {
  const normalized = value.toUpperCase();
  if (
    normalized === "DOCUMENT_FRONT" ||
    normalized === "DOCUMENT_BACK" ||
    normalized === "VIDEO"
  ) {
    return normalized;
  }
  throw new ApiError(400, "INVALID_EVIDENCE_KIND");
}

async function uploadAgeEvidence(
  request: Request,
  env: MembershipEnv,
  userId: string,
  caseId: string,
  rawKind: string,
): Promise<Record<string, unknown>> {
  if (env.AGE_REVIEW_MODE !== "manual-r2-v1") {
    throw new ApiError(503, "AGE_VERIFICATION_NOT_CONFIGURED");
  }
  const kind = evidenceKind(rawKind);
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, evidence_kind, content_type, size_bytes
    FROM age_verification_uploads
    WHERE appwrite_user_id = ? AND idempotency_key = ? AND deleted_at IS NULL
  `).bind(userId, idempotencyKey).first<{
    id: string;
    evidence_kind: AgeEvidenceKind;
    content_type: string;
    size_bytes: number;
  }>();
  if (replay) {
    return {
      evidenceId: replay.id,
      kind: replay.evidence_kind,
      contentType: replay.content_type,
      sizeBytes: replay.size_bytes,
      existing: true,
    };
  }
  const ageCase = await env.DB.prepare(`
    SELECT id, status, manual_review_status, upload_expires_at
    FROM age_verification_cases
    WHERE id = ? AND appwrite_user_id = ?
  `).bind(caseId, userId).first<{
    id: string;
    status: string;
    manual_review_status: string;
    upload_expires_at: string;
  }>();
  if (!ageCase) throw new ApiError(404, "AGE_CASE_NOT_FOUND");
  if (ageCase.status !== "PENDING" || ageCase.manual_review_status !== "UPLOADING") {
    throw new ApiError(409, "AGE_CASE_NOT_ACCEPTING_UPLOADS");
  }
  if (Date.parse(ageCase.upload_expires_at) <= Date.now()) {
    throw new ApiError(409, "AGE_UPLOAD_WINDOW_EXPIRED");
  }
  const existing = await env.DB.prepare(`
    SELECT id FROM age_verification_uploads
    WHERE age_case_id = ? AND evidence_kind = ? AND deleted_at IS NULL
  `).bind(caseId, kind).first<{ id: string }>();
  if (existing) throw new ApiError(409, "EVIDENCE_KIND_ALREADY_UPLOADED");

  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const videoTypes = new Set(["video/mp4", "video/webm"]);
  if (!contentType || (kind === "VIDEO" ? !videoTypes.has(contentType) : !imageTypes.has(contentType))) {
    throw new ApiError(415, "UNSUPPORTED_EVIDENCE_MEDIA_TYPE");
  }
  const maxBytes = kind === "VIDEO"
    ? parsePositiveInt(env.AGE_VIDEO_MAX_BYTES, 25_000_000, 100_000_000)
    : parsePositiveInt(env.AGE_IMAGE_MAX_BYTES, 10_000_000, 25_000_000);
  const bytes = await readRawBody(request, maxBytes);
  if (bytes.byteLength < 1) throw new ApiError(400, "EVIDENCE_BODY_REQUIRED");
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && Number(declaredLength) !== bytes.byteLength) {
    throw new ApiError(400, "EVIDENCE_SIZE_MISMATCH");
  }
  const contentLength = bytes.byteLength;

  const evidenceId = crypto.randomUUID();
  const objectKey = `age-cases/${caseId}/${kind.toLowerCase()}/${evidenceId}`;
  let uploaded: R2Object | null;
  try {
    uploaded = await env.VERIFICATION_UPLOADS.put(objectKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { caseId, evidenceId, kind },
    });
  } catch {
    throw new ApiError(503, "EVIDENCE_STORAGE_UNAVAILABLE");
  }
  if (!uploaded || uploaded.size !== contentLength) {
    await env.VERIFICATION_UPLOADS.delete(objectKey).catch(() => undefined);
    throw new ApiError(400, "EVIDENCE_SIZE_MISMATCH");
  }
  const now = isoNow();
  try {
    await env.DB.prepare(`
      INSERT INTO age_verification_uploads (
        id, age_case_id, appwrite_user_id, evidence_kind, r2_object_key,
        content_type, size_bytes, object_etag, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      evidenceId,
      caseId,
      userId,
      kind,
      objectKey,
      contentType,
      contentLength,
      uploaded.etag,
      idempotencyKey,
      now,
      now,
    ).run();
  } catch {
    await env.VERIFICATION_UPLOADS.delete(objectKey).catch(() => undefined);
    throw new ApiError(503, "MEMBERSHIP_DATABASE_UNAVAILABLE");
  }
  return { evidenceId, kind, contentType, sizeBytes: contentLength, existing: false };
}

async function submitAgeCase(
  request: Request,
  env: MembershipEnv,
  userId: string,
  caseId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, []);
  const idempotencyKey = requireIdempotencyKey(request);
  const ageCase = await env.DB.prepare(`
    SELECT id, status, manual_review_status, submission_idempotency_key
    FROM age_verification_cases WHERE id = ? AND appwrite_user_id = ?
  `).bind(caseId, userId).first<{
    id: string;
    status: string;
    manual_review_status: string;
    submission_idempotency_key: string | null;
  }>();
  if (!ageCase) throw new ApiError(404, "AGE_CASE_NOT_FOUND");
  if (
    ageCase.manual_review_status === "READY_FOR_REVIEW" &&
    ageCase.submission_idempotency_key === idempotencyKey
  ) return { caseId, status: "PENDING", reviewStatus: "READY_FOR_REVIEW" };
  if (ageCase.status !== "PENDING" || ageCase.manual_review_status !== "UPLOADING") {
    throw new ApiError(409, "AGE_CASE_NOT_SUBMITTABLE");
  }
  const evidence = await env.DB.prepare(`
    SELECT evidence_kind FROM age_verification_uploads
    WHERE age_case_id = ? AND deleted_at IS NULL
  `).bind(caseId).all<{ evidence_kind: AgeEvidenceKind }>();
  const kinds = new Set(evidence.results.map((row) => row.evidence_kind));
  if (
    !kinds.has("DOCUMENT_FRONT") ||
    !kinds.has("DOCUMENT_BACK") ||
    !kinds.has("VIDEO")
  ) {
    throw new ApiError(409, "REQUIRED_EVIDENCE_MISSING");
  }
  const now = isoNow();
  const updated = await env.DB.prepare(`
    UPDATE age_verification_cases SET manual_review_status = 'READY_FOR_REVIEW',
      submitted_at = ?, submission_idempotency_key = ?, retention_until = NULL,
      version = version + 1, updated_at = ?
    WHERE id = ? AND appwrite_user_id = ? AND status = 'PENDING'
      AND manual_review_status = 'UPLOADING' AND submission_idempotency_key IS NULL
  `).bind(now, idempotencyKey, now, caseId, userId).run();
  if ((updated.meta.changes ?? 0) !== 1) throw new ApiError(409, "AGE_CASE_CONCURRENTLY_UPDATED");
  return { caseId, status: "PENDING", reviewStatus: "READY_FOR_REVIEW" };
}

export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" && character <= "Z"
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export interface SepaInstructions {
  beneficiary: string;
  iban: string;
  bic: string | null;
}

interface BillingDetails {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
}

function normalizedBillingText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return null;
  }
  return normalized;
}

function billingDetails(value: unknown): BillingDetails | null {
  if (value == null) return null;
  exactObjectKeys(value, ["name", "street", "postalCode", "city", "countryCode"]);
  const name = normalizedBillingText(value.name, 128);
  const street = normalizedBillingText(value.street, 160);
  const postalCode = normalizedBillingText(value.postalCode, 24);
  const city = normalizedBillingText(value.city, 100);
  const countryCode = typeof value.countryCode === "string"
    ? value.countryCode.trim().toUpperCase()
    : "";
  if (!name || !street || !postalCode || !city || !/^[A-Z]{2}$/.test(countryCode)) {
    throw new ApiError(400, "INVALID_BILLING_DETAILS");
  }
  return { name, street, postalCode, city, countryCode };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function authLocale(value: unknown): "de" | "en" {
  return value === "en" ? "en" : "de";
}

function randomUrlToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function authEmailHtml(input: {
  locale: "de" | "en";
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD";
  displayName: string;
  actionUrl: string;
  expiresAt: string;
}): string {
  const isGerman = input.locale === "de";
  const verification = input.purpose === "VERIFY_EMAIL";
  const title = verification
    ? (isGerman ? "Dein exklusiver Zugang beginnt hier" : "Your exclusive access starts here")
    : (isGerman ? "Sicher zurück in deinen Account" : "Securely return to your account");
  const intro = verification
    ? (isGerman
      ? "Bestätige deine E-Mail und öffne die Tür zu deinem persönlichen Member-Bereich."
      : "Confirm your email and open the door to your personal member experience.")
    : (isGerman
      ? "Mit diesem einmaligen Link legst du ein neues Passwort fest und erhältst wieder Zugriff."
      : "Use this single-use link to choose a new password and restore your access.");
  const action = verification
    ? (isGerman ? "Zugang jetzt bestätigen" : "Confirm my access")
    : (isGerman ? "Neues Passwort festlegen" : "Choose a new password");
  const preheader = verification
    ? (isGerman
      ? "Nur noch ein Klick bis zu deinem persönlichen Shadow's Temptation Account."
      : "One click remains before your personal Shadow's Temptation account is ready.")
    : (isGerman
      ? "Dein sicherer Link zum Zurücksetzen des Passworts."
      : "Your secure password reset link.");
  const expiry = new Intl.DateTimeFormat(isGerman ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(input.expiresAt));
  const security = isGerman
    ? `Dieser Link ist nur einmal nutzbar und bis ${expiry} gültig. Falls du die Nachricht nicht angefordert hast, ignoriere sie bitte; dein bestehendes Passwort bleibt unverändert.`
    : `This link can be used once and is valid until ${expiry}. If you did not request it, please ignore this message; your existing password remains unchanged.`;
  const nextStep = verification
    ? (isGerman
      ? "Nach der Bestätigung kannst du dich direkt anmelden und deine persönliche 18+-Verifikation starten."
      : "After confirmation, you can sign in immediately and begin your personal 18+ verification.")
    : (isGerman
      ? "Danach kannst du dich sofort wieder anmelden und dort weitermachen, wo du aufgehört hast."
      : "You can then sign in immediately and continue exactly where you left off.");
  return `<!doctype html><html lang="${isGerman ? "de" : "en"}"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>@media only screen and (max-width:620px){.mail-shell{width:100%!important}.mail-pad{padding:24px 20px!important}.mail-title{font-size:30px!important}.mail-button{display:block!important;text-align:center!important}}</style>
  </head><body style="margin:0;padding:0;background:#100205;color:#f8eee7;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#100205">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" class="mail-shell" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#21070d;border:1px solid #6d2432;border-radius:24px;overflow:hidden">
        <tr><td><img src="cid:shadow-brand-banner" width="680" alt="Shadow's Temptation" style="display:block;width:100%;height:auto;border:0"></td></tr>
        <tr><td class="mail-pad" style="padding:34px 38px 20px">
          <div style="color:#e6c77c;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:bold">Shadow's Temptation · Private Membership</div>
          <h1 class="mail-title" style="margin:12px 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.08;color:#fff6e8;font-weight:normal">${escapeHtml(title)}</h1>
          <p style="margin:0;color:#d8c4bd;font-size:17px;line-height:1.65">${escapeHtml(intro)}</p>
        </td></tr>
        <tr><td class="mail-pad" style="padding:18px 38px 34px">
          <p style="margin:0 0 20px;color:#f8eee7;font-size:16px;line-height:1.65">${isGerman ? "Hallo" : "Hello"} ${escapeHtml(input.displayName || (isGerman ? "Member" : "member"))},</p>
          <p style="margin:0 0 26px;color:#d8c4bd;font-size:15px;line-height:1.7">${escapeHtml(nextStep)}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px"><tr><td style="border-radius:999px;background:#c83a22">
            <a class="mail-button" href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:16px 28px;border-radius:999px;background:#c83a22;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:.2px">${escapeHtml(action)} →</a>
          </td></tr></table>
          <div style="padding:17px 18px;border:1px solid #4a1822;border-radius:14px;background:#120306;color:#bca7a0;font-size:13px;line-height:1.65">
            <strong style="color:#e6c77c">${isGerman ? "Sicherheitsinformation" : "Security notice"}</strong><br>${escapeHtml(security)}
          </div>
          <p style="margin:22px 0 0;color:#9f8e89;font-size:12px;line-height:1.6">${isGerman ? "Button nicht sichtbar? Öffne den folgenden sicheren Link:" : "Button not visible? Open this secure link:"}<br><a href="${escapeHtml(input.actionUrl)}" style="color:#e6c77c;word-break:break-all">${escapeHtml(input.actionUrl)}</a></p>
        </td></tr>
        <tr><td style="padding:22px 38px;background:#0d0204;color:#968681;font-size:12px;line-height:1.7">
          <strong style="color:#d7bbb2">Shadow's Temptation</strong> · Desire lives in the shadows.<br>
          Jason Shadow · Inhaber Jason Winckler · Rheine, Deutschland<br>
          <a href="https://exclusive.jason-shadow.com/" style="color:#e6c77c;text-decoration:none">Website</a> ·
          <a href="https://exclusive.jason-shadow.com/legal/" style="color:#e6c77c;text-decoration:none">${isGerman ? "Rechtliches & Datenschutz" : "Legal & Privacy"}</a> ·
          <a href="mailto:info@exclusive.jason-shadow.com" style="color:#e6c77c;text-decoration:none">Support</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function issueAuthEmailToken(
  env: MembershipEnv,
  input: {
    userId: string;
    displayName: string;
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD";
    locale: "de" | "en";
    idempotencyKey: string;
  },
): Promise<Record<string, unknown>> {
  const replay = await env.DB.prepare(`
    SELECT id, expires_at, email_status FROM auth_email_tokens
    WHERE idempotency_key = ? AND appwrite_user_id = ? AND purpose = ?
  `).bind(input.idempotencyKey, input.userId, input.purpose).first<{
    id: string;
    expires_at: string;
    email_status: string;
  }>();
  if (replay) {
    return {
      accepted: true,
      expiresAt: replay.expires_at,
      emailStatus: replay.email_status,
      existing: true,
    };
  }
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const throttle = await env.DB.prepare(`
    SELECT COUNT(*) AS sent_count, MAX(created_at) AS latest_created_at
    FROM auth_email_tokens
    WHERE appwrite_user_id = ? AND purpose = ? AND created_at >= ?
  `).bind(input.userId, input.purpose, oneHourAgo).first<{
    sent_count: number;
    latest_created_at: string | null;
  }>();
  if (
    Number(throttle?.sent_count ?? 0) >= 5 ||
    (throttle?.latest_created_at &&
      Date.parse(throttle.latest_created_at) > Date.now() - 60_000)
  ) throw new ApiError(429, "AUTH_EMAIL_RATE_LIMITED");

  const token = randomUrlToken();
  const tokenHash = await sha256Hex(token);
  const tokenId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const now = isoNow();
  const lifetimeMinutes = input.purpose === "VERIFY_EMAIL" ? 1_440 : 60;
  const expiresAt = new Date(Date.parse(now) + lifetimeMinutes * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE auth_email_tokens SET status = 'REVOKED', updated_at = ?
      WHERE appwrite_user_id = ? AND purpose = ? AND status = 'PENDING'
    `).bind(now, input.userId, input.purpose),
    env.DB.prepare(`
      INSERT INTO auth_email_tokens (
        id, appwrite_user_id, purpose, token_sha256, status, expires_at,
        email_message_id, email_status, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, 'PENDING', ?, ?, ?)
    `).bind(
      tokenId,
      input.userId,
      input.purpose,
      tokenHash,
      expiresAt,
      messageId,
      input.idempotencyKey,
      now,
      now,
    ),
  ]);
  const action = input.purpose === "VERIFY_EMAIL" ? "verify-email" : "recover";
  const actionUrl = `https://exclusive.jason-shadow.com/?action=${action}&token=${encodeURIComponent(token)}`;
  const subject = input.purpose === "VERIFY_EMAIL"
    ? (input.locale === "de" ? "Bestätige deinen Zugang · Shadow's Temptation" : "Confirm your access · Shadow's Temptation")
    : (input.locale === "de" ? "Passwort sicher zurücksetzen · Shadow's Temptation" : "Secure password reset · Shadow's Temptation");
  try {
    await sendTransactionalEmail(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
      userId: input.userId,
      messageId,
      subject,
      html: authEmailHtml({
        locale: input.locale,
        purpose: input.purpose,
        displayName: input.displayName,
        actionUrl,
        expiresAt,
      }),
    });
    await env.DB.prepare(`
      UPDATE auth_email_tokens SET email_status = 'SENT', updated_at = ? WHERE id = ?
    `).bind(isoNow(), tokenId).run();
    return { accepted: true, expiresAt, emailStatus: "SENT", existing: false };
  } catch {
    await env.DB.prepare(`
      UPDATE auth_email_tokens SET email_status = 'FAILED', updated_at = ? WHERE id = ?
    `).bind(isoNow(), tokenId).run();
    throw new ApiError(503, "AUTH_EMAIL_DELIVERY_FAILED");
  }
}

async function requestEmailVerification(
  request: Request,
  env: MembershipEnv,
  identity: { userId: string; displayName: string; emailVerified: boolean },
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["locale"]);
  if (identity.emailVerified) return { accepted: true, alreadyVerified: true };
  return issueAuthEmailToken(env, {
    userId: identity.userId,
    displayName: identity.displayName,
    purpose: "VERIFY_EMAIL",
    locale: authLocale(body.locale),
    idempotencyKey: requireIdempotencyKey(request),
  });
}

async function requestPasswordResetEmail(
  request: Request,
  env: MembershipEnv,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["email", "locale"]);
  if (
    typeof body.email !== "string" ||
    body.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  ) throw new ApiError(400, "INVALID_EMAIL");
  const idempotencyKey = requireIdempotencyKey(request);
  const profile = await env.DB.prepare(`
    SELECT appwrite_user_id, display_name FROM user_profiles
    WHERE email = ? COLLATE NOCASE AND account_status <> 'DELETED'
    LIMIT 1
  `).bind(body.email.trim()).first<{
    appwrite_user_id: string;
    display_name: string;
  }>();
  if (!profile) {
    await sha256Hex(`unknown-reset:${body.email.trim().toLowerCase()}`);
    return { accepted: true };
  }
  try {
    await issueAuthEmailToken(env, {
      userId: profile.appwrite_user_id,
      displayName: profile.display_name,
      purpose: "RESET_PASSWORD",
      locale: authLocale(body.locale),
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) throw error;
    logEvent("error", "password_reset_email_failed", {
      requestId: requestId(request),
      code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
    });
  }
  return { accepted: true };
}

async function claimAuthEmailToken(
  env: MembershipEnv,
  token: string,
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
): Promise<{ id: string; userId: string; alreadyCompleted: boolean }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(400, "INVALID_AUTH_EMAIL_TOKEN");
  const tokenHash = await sha256Hex(token);
  const now = isoNow();
  const result = await env.DB.prepare(`
    UPDATE auth_email_tokens
    SET status = 'PROCESSING', updated_at = ?
    WHERE token_sha256 = ? AND purpose = ? AND status = 'PENDING' AND expires_at > ?
  `).bind(now, tokenHash, purpose, now).run();
  if ((result.meta.changes ?? 0) !== 1) {
    if (purpose === "VERIFY_EMAIL") {
      const used = await env.DB.prepare(`
        SELECT t.id, t.appwrite_user_id
        FROM auth_email_tokens t
        INNER JOIN user_profiles p ON p.appwrite_user_id = t.appwrite_user_id
        WHERE t.token_sha256 = ? AND t.purpose = 'VERIFY_EMAIL'
          AND t.status = 'USED' AND p.email_verified = 1
      `).bind(tokenHash).first<{ id: string; appwrite_user_id: string }>();
      if (used) {
        return { id: used.id, userId: used.appwrite_user_id, alreadyCompleted: true };
      }
    }
    throw new ApiError(400, "AUTH_EMAIL_TOKEN_EXPIRED_OR_USED");
  }
  const row = await env.DB.prepare(`
    SELECT id, appwrite_user_id FROM auth_email_tokens
    WHERE token_sha256 = ? AND purpose = ? AND status = 'PROCESSING'
  `).bind(tokenHash, purpose).first<{ id: string; appwrite_user_id: string }>();
  if (!row) throw new ApiError(409, "AUTH_EMAIL_TOKEN_STATE_CONFLICT");
  return { id: row.id, userId: row.appwrite_user_id, alreadyCompleted: false };
}

async function completeAuthEmailToken(
  request: Request,
  env: MembershipEnv,
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
): Promise<Record<string, unknown>> {
  requireIdempotencyKey(request);
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, purpose === "VERIFY_EMAIL" ? ["token"] : ["token", "password"]);
  if (typeof body.token !== "string") throw new ApiError(400, "INVALID_AUTH_EMAIL_TOKEN");
  if (
    purpose === "RESET_PASSWORD" &&
    (
      typeof body.password !== "string" ||
      body.password.length < 8 ||
      body.password.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(body.password)
    )
  ) throw new ApiError(400, "INVALID_PASSWORD");
  const claimed = await claimAuthEmailToken(env, body.token, purpose);
  if (claimed.alreadyCompleted) return { status: "EMAIL_VERIFIED", alreadyVerified: true };
  try {
    if (purpose === "VERIFY_EMAIL") {
      await verifyAppwriteUserEmail(
        env.IDENTITY_PROJECTION,
        env.LABEL_SYNC_SERVICE_SECRET,
        claimed.userId,
      );
    } else {
      await updateAppwriteUserPassword(
        env.IDENTITY_PROJECTION,
        env.LABEL_SYNC_SERVICE_SECRET,
        claimed.userId,
        body.password as string,
      );
    }
  } catch (error) {
    const now = isoNow();
    await env.DB.prepare(`
      UPDATE auth_email_tokens
      SET status = CASE WHEN expires_at > ? THEN 'PENDING' ELSE 'EXPIRED' END,
        updated_at = ? WHERE id = ? AND status = 'PROCESSING'
    `).bind(now, now, claimed.id).run();
    throw error;
  }
  const completedAt = isoNow();
  const statements = [
    env.DB.prepare(`
      UPDATE auth_email_tokens SET status = 'USED', used_at = ?, updated_at = ?
      WHERE id = ? AND status = 'PROCESSING'
    `).bind(completedAt, completedAt, claimed.id),
    env.DB.prepare(`
      UPDATE auth_email_tokens SET status = 'REVOKED', updated_at = ?
      WHERE appwrite_user_id = ? AND purpose = ? AND status = 'PENDING'
    `).bind(completedAt, claimed.userId, purpose),
  ];
  if (purpose === "VERIFY_EMAIL") {
    statements.push(env.DB.prepare(`
      UPDATE user_profiles SET email_verified = 1,
        account_status = CASE WHEN account_status = 'EMAIL_PENDING' THEN 'ACTIVE' ELSE account_status END,
        version = version + 1, updated_at = ?
      WHERE appwrite_user_id = ?
    `).bind(completedAt, claimed.userId));
  }
  await env.DB.batch(statements);
  return { status: purpose === "VERIFY_EMAIL" ? "EMAIL_VERIFIED" : "PASSWORD_UPDATED" };
}

function invoiceNumber(orderId: string, issuedAt: string): string {
  return `ST-${issuedAt.slice(0, 4)}-${orderId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function invoiceEmailHtml(input: {
  locale: "de" | "en";
  invoiceNumber: string;
  customerName: string;
  customerStreet: string;
  customerPostalCode: string;
  customerCity: string;
  customerCountryCode: string;
  productName: string;
  amountMinor: number;
  currency: string;
  issuedAt: string;
  dueAt: string;
  reference: string;
  beneficiary: string;
  iban: string;
  bic: string | null;
  sellerName: string;
  sellerAddress: string;
  sellerEmail: string;
  taxIdentifier: string;
  taxNote: string | null;
}): string {
  const isGerman = input.locale === "de";
  const amount = new Intl.NumberFormat(isGerman ? "de-DE" : "en-IE", {
    style: "currency",
    currency: input.currency,
  }).format(input.amountMinor / 100);
  const dateFormatter = new Intl.DateTimeFormat(isGerman ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  const issued = dateFormatter.format(new Date(input.issuedAt));
  const due = dateFormatter.format(new Date(input.dueAt));
  const title = isGerman ? "Dein Zugang ist reserviert" : "Your access is reserved";
  const intro = isGerman
    ? "Danke für deine Bestellung. Schließe jetzt die SEPA-Überweisung ab und sichere dir deinen Platz bei Shadow's Temptation."
    : "Thank you for your order. Complete your SEPA transfer now and secure your place at Shadow's Temptation.";
  const labels = isGerman
    ? { invoice: "Rechnungsnummer", issued: "Rechnungsdatum", product: "Mitgliedschaft", total: "Gesamtbetrag", due: "Zahlbar bis", billTo: "Rechnung an", seller: "Leistungserbringer", beneficiary: "Empfänger", reference: "Verwendungszweck", note: "Wichtig" }
    : { invoice: "Invoice number", issued: "Invoice date", product: "Membership", total: "Total", due: "Pay by", billTo: "Bill to", seller: "Supplier", beneficiary: "Beneficiary", reference: "Remittance information", note: "Important" };
  const legalBase = input.customerCountryCode === "US"
    ? "https://exclusive.jason-shadow.com/legal/us/"
    : "https://exclusive.jason-shadow.com/legal/eu/";
  const preheader = isGerman
    ? `${input.productName} ist für 48 Stunden reserviert. Zahlungsdaten und Rechnung ${input.invoiceNumber}.`
    : `${input.productName} is reserved for 48 hours. Payment details and invoice ${input.invoiceNumber}.`;
  return `<!doctype html><html lang="${isGerman ? "de" : "en"}"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.invoiceNumber)} · Shadow's Temptation</title>
  <style>@media only screen and (max-width:620px){.mail-shell{width:100%!important}.mail-pad{padding:24px 20px!important}.mail-title{font-size:30px!important}.mail-button{display:block!important;text-align:center!important}.stack-cell{display:block!important;width:100%!important;padding:8px 0!important;text-align:left!important}}</style>
  </head><body style="margin:0;padding:0;background:#100205;color:#f8eee7;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#100205">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" class="mail-shell" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#21070d;border:1px solid #6d2432;border-radius:24px;overflow:hidden">
        <tr><td><img src="cid:shadow-brand-banner" width="680" alt="Shadow's Temptation" style="display:block;width:100%;height:auto;border:0"></td></tr>
        <tr><td class="mail-pad" style="padding:32px 38px 20px">
          <div style="color:#e6c77c;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:bold">Shadow's Temptation · Exclusive Membership</div>
          <h1 class="mail-title" style="margin:12px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.08;color:#fff6e8;font-weight:normal">${escapeHtml(title)}</h1>
          <p style="margin:0;color:#d8c4bd;font-size:16px;line-height:1.65">${escapeHtml(intro)}</p>
        </td></tr>
        <tr><td class="mail-pad" style="padding:18px 38px 34px">
          <p style="margin:0 0 22px;color:#f8eee7;font-size:16px;line-height:1.65">${isGerman ? "Hallo" : "Hello"} ${escapeHtml(input.customerName)},</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;color:#f8eee7">
            <tr><td style="padding:10px 0;color:#bdaaa4;border-bottom:1px solid #41202a">${labels.invoice}</td><td style="padding:10px 0;text-align:right;font-weight:bold;border-bottom:1px solid #41202a">${escapeHtml(input.invoiceNumber)}</td></tr>
            <tr><td style="padding:10px 0;color:#bdaaa4;border-bottom:1px solid #41202a">${labels.issued}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #41202a">${escapeHtml(issued)}</td></tr>
            <tr><td style="padding:10px 0;color:#bdaaa4;border-bottom:1px solid #41202a">${labels.product}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #41202a">${escapeHtml(input.productName)}</td></tr>
            <tr><td style="padding:13px 0;color:#bdaaa4">${labels.total}</td><td style="padding:13px 0;text-align:right;font-size:24px;color:#e7c47d;font-weight:bold">${escapeHtml(amount)}</td></tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 22px;border-collapse:separate;border-spacing:0">
            <tr>
              <td class="stack-cell" width="50%" valign="top" style="padding:16px 18px;background:#16050a;border:1px solid #4a1822;border-radius:14px 0 0 14px;color:#bdaaa4;font-size:13px;line-height:1.65">
                <strong style="color:#e6c77c">${labels.billTo}</strong><br>
                ${escapeHtml(input.customerName)}<br>${escapeHtml(input.customerStreet)}<br>
                ${escapeHtml(input.customerPostalCode)} ${escapeHtml(input.customerCity)} · ${escapeHtml(input.customerCountryCode)}
              </td>
              <td class="stack-cell" width="50%" valign="top" style="padding:16px 18px;background:#16050a;border:1px solid #4a1822;border-left:0;border-radius:0 14px 14px 0;color:#bdaaa4;font-size:13px;line-height:1.65">
                <strong style="color:#e6c77c">${labels.seller}</strong><br>
                ${escapeHtml(input.sellerName)}<br>${escapeHtml(input.sellerAddress)}<br>
                ${isGerman ? "Steuernummer" : "Tax number"}: ${escapeHtml(input.taxIdentifier)}<br>
                <a href="mailto:${escapeHtml(input.sellerEmail)}" style="color:#e6c77c">${escapeHtml(input.sellerEmail)}</a>
              </td>
            </tr>
          </table>
          <div style="padding:22px;background:#0c0204;border-radius:16px;border:1px solid #5a1b2a">
            <div style="color:#e6c77c;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:14px">SEPA Credit Transfer</div>
            <p style="margin:0 0 9px;line-height:1.55"><strong>${labels.beneficiary}:</strong> ${escapeHtml(input.beneficiary)}</p>
            <p style="margin:0 0 9px;line-height:1.55"><strong>IBAN:</strong> <span style="font-family:Consolas,'Courier New',monospace">${escapeHtml(input.iban)}</span></p>
            ${input.bic ? `<p style="margin:0 0 9px;line-height:1.55"><strong>BIC:</strong> <span style="font-family:Consolas,'Courier New',monospace">${escapeHtml(input.bic)}</span></p>` : ""}
            <p style="margin:0 0 9px;line-height:1.55"><strong>${labels.reference}:</strong><br><span style="display:inline-block;margin-top:5px;color:#e7c47d;font-family:Consolas,'Courier New',monospace;font-size:15px;font-weight:bold">${escapeHtml(input.reference)}</span></p>
            <p style="margin:14px 0 0;color:#bdaaa4;font-size:13px"><strong>${labels.due}:</strong> ${escapeHtml(due)}</p>
          </div>
          <p style="margin:18px 0 24px;padding:15px 17px;background:#39101a;border-left:3px solid #e6c77c;border-radius:8px;color:#eadbd5;font-size:13px;line-height:1.6"><strong>${labels.note}:</strong> ${isGerman ? "Bitte übernimm den Verwendungszweck exakt. Nur so kann die Zahlung automatisch deiner Bestellung zugeordnet werden. Ohne bestätigten Zahlungseingang wird der Auftrag nach 48 Stunden automatisch storniert." : "Use the remittance information exactly as shown so the payment can be matched automatically. Without confirmed payment, the order is cancelled automatically after 48 hours."}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 26px"><tr><td style="border-radius:999px;background:#c83a22">
            <a class="mail-button" href="https://exclusive.jason-shadow.com/?action=orders" style="display:inline-block;padding:16px 28px;border-radius:999px;background:#c83a22;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold">${isGerman ? "Zahlungsdetails im Dashboard öffnen" : "Open payment details in dashboard"} →</a>
          </td></tr></table>
          ${input.taxNote ? `<p style="margin:0 0 14px;padding:13px 15px;border:1px solid #4a1822;border-radius:10px;background:#16050a;color:#cbb9b2;font-size:12px;line-height:1.6"><strong>${isGerman ? "Steuerlicher Hinweis" : "Tax notice"}:</strong> ${escapeHtml(input.taxNote)}</p>` : ""}
          <p style="margin:0;color:#9f8e89;font-size:12px;line-height:1.7">${isGerman ? "Du hast den Beginn der digitalen Bereitstellung nach bestätigtem Zahlungseingang verlangt und den Verlust des Widerrufsrechts mit Beginn der Bereitstellung bestätigt." : "You requested digital supply to begin after confirmed payment and acknowledged the loss of the withdrawal right when supply begins."}<br>
            <a href="${legalBase}" style="color:#e6c77c;text-decoration:none">${isGerman ? "Legal Center" : "Legal Center"}</a> ·
            <a href="${legalBase}#terms" style="color:#e6c77c;text-decoration:none">${isGerman ? "AGB" : "Terms"}</a> ·
            <a href="${legalBase}#withdrawal" style="color:#e6c77c;text-decoration:none">${isGerman ? "Widerruf" : "Withdrawal"}</a> ·
            <a href="${legalBase}#privacy" style="color:#e6c77c;text-decoration:none">${isGerman ? "Datenschutz" : "Privacy"}</a>
          </p>
        </td></tr>
        <tr><td style="padding:22px 38px;background:#0d0204;color:#968681;font-size:12px;line-height:1.7">
          <strong style="color:#d7bbb2">Shadow's Temptation</strong> · Desire lives in the shadows.<br>
          ${escapeHtml(input.sellerName)} · ${escapeHtml(input.sellerAddress)}<br>
          <a href="https://exclusive.jason-shadow.com/" style="color:#e6c77c;text-decoration:none">Website</a> ·
          <a href="${legalBase}" style="color:#e6c77c;text-decoration:none">${isGerman ? "Rechtliches" : "Legal"}</a> ·
          <a href="mailto:${escapeHtml(input.sellerEmail)}" style="color:#e6c77c;text-decoration:none">Support</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function sepaInstructions(env: MembershipEnv): SepaInstructions {
  const beneficiary = env.SEPA_BENEFICIARY_NAME?.trim();
  const iban = env.SEPA_IBAN?.replace(/\s+/g, "").toUpperCase();
  const bic = env.SEPA_BIC?.replace(/\s+/g, "").toUpperCase() || null;
  if (
    !beneficiary || beneficiary.length > 70 || /[\u0000-\u001f\u007f]/.test(beneficiary) ||
    !iban || !isValidIban(iban)
  ) {
    throw new ApiError(503, "SEPA_TRANSFER_NOT_CONFIGURED");
  }
  if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    throw new ApiError(503, "SEPA_TRANSFER_NOT_CONFIGURED");
  }
  return { beneficiary, iban, bic };
}

export function createSepaTransferPurpose(randomPart: string): string {
  const identifier = randomPart.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12);
  if (identifier.length < 8) throw new ApiError(500, "REFERENCE_GENERATION_FAILED");
  return `Exclusive Content - ID #${identifier}`;
}

export function epcQrPayload(
  instructions: SepaInstructions,
  amountMinor: number,
  transferPurpose: string,
): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 99_999_999_999) {
    throw new ApiError(500, "INVALID_SEPA_AMOUNT");
  }
  const amount = (amountMinor / 100).toFixed(2);
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    instructions.bic ?? "",
    instructions.beneficiary,
    instructions.iban,
    `EUR${amount}`,
    "",
    "",
    transferPurpose,
    "",
  ].join("\n");
}

function sepaOrderResponse(
  env: MembershipEnv,
  order: {
    id: string;
    status: string;
    transferReference: string;
    amountMinor: number;
    currency: string;
    paymentDueAt: string;
    productName?: string;
    productSku?: string;
    durationUnit?: string;
    durationValue?: number;
    createdAt?: string;
    cancelledAt?: string | null;
    cancellationSource?: string | null;
    invoiceNumber?: string | null;
    invoiceStatus?: string | null;
    invoiceEmailStatus?: string | null;
  },
): Record<string, unknown> {
  const instructions = sepaInstructions(env);
  return {
    orderId: order.id,
    method: "sepa-credit-transfer",
    status: order.status,
    amountMinor: order.amountMinor,
    currency: order.currency,
    paymentDueAt: order.paymentDueAt,
    reference: order.transferReference,
    productName: order.productName ?? null,
    productSku: order.productSku ?? null,
    durationUnit: order.durationUnit ?? null,
    durationValue: order.durationValue ?? null,
    createdAt: order.createdAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    cancellationSource: order.cancellationSource ?? null,
    invoice: order.invoiceNumber ? {
      number: order.invoiceNumber,
      status: order.invoiceStatus ?? "OPEN",
      emailStatus: order.invoiceEmailStatus ?? "PENDING",
    } : null,
    beneficiary: instructions.beneficiary,
    iban: instructions.iban,
    bic: instructions.bic,
    qr: {
      format: "EPC069-12",
      version: "002",
      payload: epcQrPayload(instructions, order.amountMinor, order.transferReference),
    },
  };
}

async function createSepaOrder(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  if (env.SEPA_TRANSFER_MODE !== "epc-qr-credit-transfer-v1") {
    throw new ApiError(503, "SEPA_TRANSFER_NOT_CONFIGURED");
  }
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, [
    "productSku",
    "billing",
    "locale",
    "termsVersion",
    "digitalContentConsent",
    "withdrawalAcknowledgement",
  ]);
  if (typeof body.productSku !== "string" || !/^[a-z0-9-]{1,64}$/.test(body.productSku)) {
    throw new ApiError(400, "INVALID_PRODUCT");
  }
  const locale: "de" | "en" = body.locale === "en" ? "en" : "de";
  if (
    typeof body.termsVersion !== "string" ||
    !/^[A-Z0-9-]{8,48}$/.test(body.termsVersion) ||
    body.digitalContentConsent !== true ||
    body.withdrawalAcknowledgement !== true
  ) {
    throw new ApiError(400, "CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED");
  }
  const billing = billingDetails(body.billing);
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT s.id, s.transfer_reference, s.status, s.amount_minor, s.currency,
      s.payment_due_at, s.created_at, p.display_name AS product_name, p.sku,
      p.duration_unit, p.duration_value, i.invoice_number, i.status AS invoice_status,
      i.email_status AS invoice_email_status
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN invoices i ON i.subscription_id = s.id
    WHERE s.appwrite_user_id = ? AND s.idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{
    id: string;
    transfer_reference: string;
    status: string;
    amount_minor: number;
    currency: string;
    payment_due_at: string;
    created_at: string;
    product_name: string;
    sku: string;
    duration_unit: string;
    duration_value: number;
    invoice_number: string | null;
    invoice_status: string | null;
    invoice_email_status: string | null;
  }>();
  if (replay) {
    return sepaOrderResponse(env, {
      id: replay.id,
      status: replay.status,
      transferReference: replay.transfer_reference,
      amountMinor: replay.amount_minor,
      currency: replay.currency,
      paymentDueAt: replay.payment_due_at,
      productName: replay.product_name,
      productSku: replay.sku,
      durationUnit: replay.duration_unit,
      durationValue: replay.duration_value,
      createdAt: replay.created_at,
      invoiceNumber: replay.invoice_number,
      invoiceStatus: replay.invoice_status,
      invoiceEmailStatus: replay.invoice_email_status,
    });
  }

  const [profile, product] = await Promise.all([
    getUserProfile(env.DB, userId),
    env.DB.prepare(`
      SELECT id, sku, display_name, tier, currency, amount_minor,
        duration_unit, duration_value, purchase_limit_per_user
      FROM products WHERE sku = ? AND active = 1
    `).bind(body.productSku).first<{
      id: string;
      sku: string;
      display_name: string;
      tier: string;
      currency: string;
      amount_minor: number;
      duration_unit: "DAYS" | "MONTHS";
      duration_value: number;
      purchase_limit_per_user: number | null;
    }>(),
  ]);
  if (!profile || profile.account_status !== "ACTIVE") throw new ApiError(403, "ACCOUNT_NOT_ACTIVE");
  if (profile.age_status !== "APPROVED") throw new ApiError(403, "AGE_NOT_APPROVED");
  if (!product || product.amount_minor <= 0 || product.currency !== "EUR") {
    throw new ApiError(404, "PRODUCT_NOT_AVAILABLE");
  }
  if (product.purchase_limit_per_user) {
    const purchases = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM subscriptions
      WHERE appwrite_user_id = ? AND product_id = ?
        AND status NOT IN ('FAILED', 'CANCELLED', 'EXPIRED')
    `).bind(userId, product.id).first<{ count: number }>();
    if (Number(purchases?.count ?? 0) >= product.purchase_limit_per_user) {
      throw new ApiError(409, "PRODUCT_PURCHASE_LIMIT_REACHED");
    }
  }

  const orderId = crypto.randomUUID();
  const now = isoNow();
  const paymentDueAt = new Date(
    Date.now() + parsePositiveInt(env.SEPA_ORDER_EXPIRY_HOURS, 48, 168) * 3_600_000,
  ).toISOString();
  const reference = createSepaTransferPurpose(crypto.randomUUID().replace(/-/g, ""));
  const invoiceId = billing ? crypto.randomUUID() : null;
  const number = billing ? invoiceNumber(orderId, now) : null;
  const sellerName = env.INVOICE_SELLER_NAME?.trim() || "Jason Shadow · Inhaber Jason Winckler";
  const sellerAddress = env.INVOICE_SELLER_ADDRESS?.trim() || "Kleiberweg 24, 48432 Rheine, Deutschland";
  const sellerEmail = env.INVOICE_SELLER_EMAIL?.trim() || "info@exclusive.jason-shadow.com";
  const taxIdentifier = env.INVOICE_TAX_IDENTIFIER?.trim();
  if (
    billing &&
    (
      !taxIdentifier ||
      taxIdentifier.length > 32 ||
      !/^[A-Z0-9 ./-]+$/i.test(taxIdentifier)
    )
  ) throw new ApiError(503, "INVOICE_TAX_IDENTIFIER_NOT_CONFIGURED");
  const taxNote = env.INVOICE_TAX_NOTE?.trim() ||
    "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";
  const statements = [
    env.DB.prepare(`
      INSERT INTO subscriptions (
        id, appwrite_user_id, product_id, payment_method, transfer_reference,
        amount_minor, currency, status, payment_due_at, idempotency_key,
        billing_name, billing_street, billing_postal_code, billing_city,
        billing_country_code, customer_locale, terms_version, terms_accepted_at,
        digital_content_consent_at, withdrawal_acknowledged_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      userId,
      product.id,
      "SEPA_CREDIT_TRANSFER",
      reference,
      product.amount_minor,
      product.currency,
      "PENDING",
      paymentDueAt,
      idempotencyKey,
      billing?.name ?? null,
      billing?.street ?? null,
      billing?.postalCode ?? null,
      billing?.city ?? null,
      billing?.countryCode ?? null,
      locale,
      body.termsVersion,
      now,
      now,
      now,
      now,
      now,
    ),
  ];
  if (billing && invoiceId && number) {
    statements.push(env.DB.prepare(`
      INSERT INTO invoices (
        id, subscription_id, invoice_number, status, billing_name, billing_street,
        billing_postal_code, billing_city, billing_country_code, seller_name,
        seller_address, seller_email, seller_tax_identifier, amount_minor, tax_amount_minor, currency,
        tax_note, issued_at, due_at, email_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(
      invoiceId,
      orderId,
      number,
      billing.name,
      billing.street,
      billing.postalCode,
      billing.city,
      billing.countryCode,
      sellerName,
      sellerAddress,
      sellerEmail,
      taxIdentifier,
      product.amount_minor,
      product.currency,
      taxNote,
      now,
      paymentDueAt,
      now,
      now,
    ));
  }
  const writeResults = await env.DB.batch(statements);
  if (writeResults.some((result) => (result.meta.changes ?? 0) !== 1)) {
    throw new ApiError(503, "ORDER_CREATION_INCOMPLETE");
  }

  let invoiceEmailStatus: string | null = null;
  if (billing && invoiceId && number) {
    const instructions = sepaInstructions(env);
    const messageId = `inv-${orderId.replace(/-/g, "").slice(0, 32)}`;
    try {
      await sendTransactionalEmail(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
        userId,
        messageId,
        subject: locale === "de"
          ? `Dein Zugang ist reserviert · Rechnung ${number}`
          : `Your access is reserved · Invoice ${number}`,
        html: invoiceEmailHtml({
          locale,
          invoiceNumber: number,
          customerName: billing.name,
          customerStreet: billing.street,
          customerPostalCode: billing.postalCode,
          customerCity: billing.city,
          customerCountryCode: billing.countryCode,
          productName: product.display_name,
          amountMinor: product.amount_minor,
          currency: product.currency,
          issuedAt: now,
          dueAt: paymentDueAt,
          reference,
          beneficiary: instructions.beneficiary,
          iban: instructions.iban,
          bic: instructions.bic,
          sellerName,
          sellerAddress,
          sellerEmail,
          taxIdentifier: taxIdentifier!,
          taxNote,
        }),
      });
      invoiceEmailStatus = "SENT";
      await env.DB.prepare(`
        UPDATE invoices SET email_status = 'SENT', email_message_id = ?,
          email_last_error_code = NULL, emailed_at = ?, updated_at = ? WHERE id = ?
      `).bind(messageId, isoNow(), isoNow(), invoiceId).run();
    } catch {
      invoiceEmailStatus = "FAILED";
      await env.DB.prepare(`
        UPDATE invoices SET email_status = 'FAILED',
          email_last_error_code = 'TRANSACTIONAL_EMAIL_FAILED', updated_at = ? WHERE id = ?
      `).bind(isoNow(), invoiceId).run();
    }
  }

  return sepaOrderResponse(env, {
    id: orderId,
    status: "PENDING",
    transferReference: reference,
    amountMinor: product.amount_minor,
    currency: product.currency,
    paymentDueAt,
    productName: product.display_name,
    productSku: product.sku,
    durationUnit: product.duration_unit,
    durationValue: product.duration_value,
    createdAt: now,
    invoiceNumber: number,
    invoiceStatus: number ? "OPEN" : null,
    invoiceEmailStatus,
  });
}

async function listUserPaymentOrders(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const orders = await env.DB.prepare(`
    SELECT s.id, s.transfer_reference, s.amount_minor, s.currency, s.status,
      s.payment_due_at, s.created_at, s.cancelled_at, s.cancellation_source,
      p.display_name AS product_name, p.sku, p.duration_unit, p.duration_value,
      i.invoice_number, i.status AS invoice_status, i.email_status AS invoice_email_status
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN invoices i ON i.subscription_id = s.id
    WHERE s.appwrite_user_id = ? AND s.archived_at IS NULL
    ORDER BY s.created_at DESC LIMIT 100
  `).bind(userId).all<{
    id: string;
    transfer_reference: string;
    amount_minor: number;
    currency: string;
    status: string;
    payment_due_at: string;
    created_at: string;
    cancelled_at: string | null;
    cancellation_source: string | null;
    product_name: string;
    sku: string;
    duration_unit: string;
    duration_value: number;
    invoice_number: string | null;
    invoice_status: string | null;
    invoice_email_status: string | null;
  }>();
  return {
    orders: orders.results.map((order) => sepaOrderResponse(env, {
      id: order.id,
      status: order.status,
      transferReference: order.transfer_reference,
      amountMinor: order.amount_minor,
      currency: order.currency,
      paymentDueAt: order.payment_due_at,
      productName: order.product_name,
      productSku: order.sku,
      durationUnit: order.duration_unit,
      durationValue: order.duration_value,
      createdAt: order.created_at,
      cancelledAt: order.cancelled_at,
      cancellationSource: order.cancellation_source,
      invoiceNumber: order.invoice_number,
      invoiceStatus: order.invoice_status,
      invoiceEmailStatus: order.invoice_email_status,
    })),
  };
}

async function cancelUserPaymentOrder(
  request: Request,
  env: MembershipEnv,
  userId: string,
  orderId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ApiError(400, "INVALID_PAYMENT_ORDER_ID");
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["reason"]);
  const reason = typeof body.reason === "string"
    ? body.reason.trim().slice(0, 500)
    : "Cancelled by customer";
  requireIdempotencyKey(request);
  const now = isoNow();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = ?,
        cancellation_source = 'CUSTOMER', cancellation_reason = ?,
        version = version + 1, updated_at = ?
      WHERE id = ? AND appwrite_user_id = ? AND status = 'PENDING'
    `).bind(now, reason || "Cancelled by customer", now, orderId, userId),
    env.DB.prepare(`
      UPDATE invoices SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
      WHERE subscription_id = ? AND status = 'OPEN' AND EXISTS (
        SELECT 1 FROM subscriptions WHERE id = ? AND appwrite_user_id = ?
          AND status = 'CANCELLED' AND cancelled_at = ?
      )
    `).bind(now, now, orderId, orderId, userId, now),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare(`
      SELECT status FROM subscriptions WHERE id = ? AND appwrite_user_id = ?
    `).bind(orderId, userId).first<{ status: string }>();
    if (!existing) throw new ApiError(404, "PAYMENT_ORDER_NOT_FOUND");
    if (existing.status === "CANCELLED") return { orderId, status: "CANCELLED", existing: true };
    throw new ApiError(409, "PAYMENT_ORDER_NOT_CANCELLABLE");
  }
  return { orderId, status: "CANCELLED", existing: false };
}

async function premiumTelegramPerk(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const now = isoNow();
  const access = await env.DB.prepare(`
    SELECT p.account_status, p.age_status, e.expires_at
    FROM user_profiles p
    LEFT JOIN entitlements e
      ON e.appwrite_user_id = p.appwrite_user_id
      AND e.tier = 'EXCLUSIVE_PREMIUM'
      AND e.status = 'ACTIVE'
      AND e.starts_at <= ?
      AND e.expires_at > ?
    WHERE p.appwrite_user_id = ?
    ORDER BY e.expires_at DESC
    LIMIT 1
  `).bind(now, now, userId).first<{
    account_status: string;
    age_status: string;
    expires_at: string | null;
  }>();
  if (!access || access.account_status !== "ACTIVE" || access.age_status !== "APPROVED") {
    throw new ApiError(403, "PREMIUM_PERK_NOT_AVAILABLE");
  }
  if (!access.expires_at) throw new ApiError(403, "ACTIVE_PREMIUM_REQUIRED");
  if (!env.PREMIUM_TELEGRAM_INVITE_URL) {
    throw new ApiError(503, "PREMIUM_TELEGRAM_NOT_CONFIGURED");
  }
  let inviteUrl: URL;
  try {
    inviteUrl = new URL(env.PREMIUM_TELEGRAM_INVITE_URL);
  } catch {
    throw new ApiError(503, "PREMIUM_TELEGRAM_NOT_CONFIGURED");
  }
  if (inviteUrl.protocol !== "https:" || inviteUrl.hostname !== "t.me") {
    throw new ApiError(503, "PREMIUM_TELEGRAM_NOT_CONFIGURED");
  }
  return {
    available: true,
    inviteUrl: inviteUrl.toString(),
    entitlementExpiresAt: access.expires_at,
  };
}

async function vipWhatsappPerk(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const now = isoNow();
  const access = await env.DB.prepare(`
    SELECT p.account_status, p.age_status, e.expires_at
    FROM user_profiles p
    LEFT JOIN entitlements e
      ON e.appwrite_user_id = p.appwrite_user_id
      AND e.tier = 'EXCLUSIVE_VIP'
      AND e.status = 'ACTIVE'
      AND e.starts_at <= ?
      AND e.expires_at > ?
    WHERE p.appwrite_user_id = ?
    ORDER BY e.expires_at DESC
    LIMIT 1
  `).bind(now, now, userId).first<{
    account_status: string;
    age_status: string;
    expires_at: string | null;
  }>();
  if (!access || access.account_status !== "ACTIVE" || access.age_status !== "APPROVED") {
    throw new ApiError(403, "VIP_WHATSAPP_PERK_NOT_AVAILABLE");
  }
  if (!access.expires_at) throw new ApiError(403, "ACTIVE_VIP_REQUIRED");
  if (!env.VIP_WHATSAPP_NUMBER) throw new ApiError(503, "VIP_WHATSAPP_NOT_CONFIGURED");
  const digits = env.VIP_WHATSAPP_NUMBER.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new ApiError(503, "VIP_WHATSAPP_NOT_CONFIGURED");
  return {
    available: true,
    phoneNumber: env.VIP_WHATSAPP_NUMBER,
    whatsappUrl: `https://wa.me/${digits}`,
    entitlementExpiresAt: access.expires_at,
  };
}

async function listProducts(env: MembershipEnv): Promise<Record<string, unknown>> {
  const rows = await env.DB.prepare(`
    SELECT * FROM (
      SELECT
        1 AS record_group,
        p.id AS record_id,
        p.sku,
        p.display_name,
        p.tier,
        p.currency,
        p.amount_minor,
        p.duration_unit,
        p.duration_value,
        p.purchase_limit_per_user,
        NULL AS perk_title,
        NULL AS perk_description,
        NULL AS perk_sort_order
      FROM products p
      WHERE p.active = 1

      UNION ALL

      SELECT
        2 AS record_group,
        k.id AS record_id,
        NULL AS sku,
        NULL AS display_name,
        k.tier,
        NULL AS currency,
        NULL AS amount_minor,
        NULL AS duration_unit,
        NULL AS duration_value,
        NULL AS purchase_limit_per_user,
        k.title AS perk_title,
        k.description AS perk_description,
        k.sort_order AS perk_sort_order
      FROM tier_perks k
      WHERE k.active = 1
    ) catalog
    ORDER BY
      record_group,
      CASE tier
        WHEN 'EXCLUSIVE_BASIC' THEN 1
        WHEN 'EXCLUSIVE_PREMIUM' THEN 2
        WHEN 'EXCLUSIVE_VIP' THEN 3
      END,
      CASE duration_unit WHEN 'DAYS' THEN 1 WHEN 'MONTHS' THEN 2 ELSE 3 END,
      COALESCE(duration_value, 0),
      COALESCE(perk_sort_order, 0),
      record_id
  `).all<{
    record_group: 1 | 2;
    record_id: string;
    sku: string | null;
    display_name: string | null;
    tier: string;
    currency: string | null;
    amount_minor: number | null;
    duration_unit: "DAYS" | "MONTHS" | null;
    duration_value: number | null;
    purchase_limit_per_user: number | null;
    perk_title: string | null;
    perk_description: string | null;
    perk_sort_order: number | null;
  }>();

  const products: Record<string, unknown>[] = [];
  const tierPerks: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows.results) {
    if (row.record_group === 1) {
      products.push({
        sku: row.sku,
        displayName: row.display_name,
        tier: row.tier,
        currency: row.currency,
        amountMinor: row.amount_minor,
        durationUnit: row.duration_unit,
        durationValue: row.duration_value,
        purchaseLimitPerUser: row.purchase_limit_per_user,
      });
      continue;
    }
    if (!row.perk_title) continue;
    const perks = tierPerks[row.tier] ?? [];
    perks.push({
      id: row.record_id,
      title: row.perk_title,
      description: row.perk_description,
      sortOrder: row.perk_sort_order,
    });
    tierPerks[row.tier] = perks;
  }
  return { products, tierPerks };
}

function jurisdictionAllowed(policy: string | null, jurisdictionCode: string | null): boolean {
  if (!policy) return true;
  if (!jurisdictionCode) return false;
  try {
    const parsed = JSON.parse(policy) as { allowed?: unknown };
    return Array.isArray(parsed.allowed) &&
      parsed.allowed.every((value) => typeof value === "string") &&
      parsed.allowed.includes(jurisdictionCode);
  } catch {
    return false;
  }
}

async function registerDevice(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["deviceToken", "displayName"]);
  const deviceToken = validateDeviceToken(
    typeof body.deviceToken === "string" ? body.deviceToken : null,
  );
  const displayName = body.displayName == null ? null : body.displayName;
  if (displayName !== null && (
    typeof displayName !== "string" ||
    displayName.trim().length < 1 ||
    displayName.length > 80
  )) throw new ApiError(400, "INVALID_DEVICE_NAME");
  const profile = await getUserProfile(env.DB, userId);
  if (!profile || profile.account_status !== "ACTIVE") {
    throw new ApiError(403, "ACCOUNT_NOT_ACTIVE");
  }
  const tokenHash = await sha256Hex(deviceToken);
  const existing = await getRegisteredDevice(env.DB, userId, tokenHash);
  const now = isoNow();
  if (existing?.status === "ACTIVE") {
    await touchRegisteredDevice(env.DB, existing.id, existing.last_seen_at, now);
    return { status: "ACTIVE", deviceId: existing.id, existing: true };
  }
  if (existing?.status === "REVOKED") throw new ApiError(409, "DEVICE_CREDENTIAL_REVOKED");

  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, status FROM registered_devices
    WHERE appwrite_user_id = ? AND registration_idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{ id: string; status: string }>();
  if (replay) return { status: replay.status, deviceId: replay.id, existing: true };

  const deviceId = crypto.randomUUID();
  const result = await env.DB.prepare(`
    INSERT INTO registered_devices (
      id, appwrite_user_id, device_token_hash, registration_idempotency_key,
      display_name, status, first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM registered_devices
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
    ) < ?
  `).bind(
    deviceId,
    userId,
    tokenHash,
    idempotencyKey,
    typeof displayName === "string" ? displayName.trim() : null,
    now,
    now,
    now,
    now,
    userId,
    parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new ApiError(409, "DEVICE_LIMIT_EXCEEDED");
  return { status: "ACTIVE", deviceId, existing: false };
}

async function revokeCurrentDevice(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const token = validateDeviceToken(request.headers.get("X-Device-Token"));
  const tokenHash = await sha256Hex(token);
  const device = await getRegisteredDevice(env.DB, userId, tokenHash);
  if (!device) throw new ApiError(404, "DEVICE_NOT_FOUND");
  if (device.status === "ACTIVE") {
    const now = isoNow();
    await env.DB.prepare(`
      UPDATE registered_devices SET status = 'REVOKED', revoked_at = ?,
        version = version + 1, updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
    `).bind(now, now, device.id).run();
  }
  return { status: "REVOKED", deviceId: device.id };
}

async function listContent(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const deviceToken = validateDeviceToken(request.headers.get("X-Device-Token"));
  const tokenHash = await sha256Hex(deviceToken);
  const [access, content] = await Promise.all([
    getAccessContext(env.DB, userId, tokenHash),
    env.DB.prepare(`
      SELECT c.slug, c.title, c.body_text, c.allow_comments, c.published_at,
        c.required_tier, c.jurisdiction_policy, u.content_type, u.size_bytes,
        (SELECT COUNT(*) FROM content_comments comments
          WHERE comments.content_item_id = c.id AND comments.status = 'ACTIVE') AS comment_count
      FROM content_items c
      JOIN content_uploads u ON u.content_item_id = c.id AND u.status = 'ACTIVE'
      WHERE c.content_status = 'ACTIVE'
      ORDER BY c.published_at DESC, c.created_at DESC
      LIMIT 200
    `).all<{
      slug: string;
      title: string;
      body_text: string;
      allow_comments: number;
      published_at: string | null;
      required_tier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
      jurisdiction_policy: string | null;
      content_type: string;
      size_bytes: number;
      comment_count: number;
    }>(),
  ]);
  const { profile, entitlement, device, activeDeviceCount } = access;
  const baseDecision = authorizeProtectedContent({
    profile,
    entitlement,
    requiredTier: "FREE",
    contentStatus: "ACTIVE",
    activeDeviceCount,
    deviceLimit: parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
    currentDeviceActive: device?.status === "ACTIVE",
    jurisdictionAllowed: true,
  });
  if (!baseDecision.allowed) throw new ApiError(403, baseDecision.code);
  await touchRegisteredDevice(env.DB, device!.id, device!.last_seen_at);
  return {
    items: content.results.map((item) => {
      const decision = authorizeProtectedContent({
        profile,
        entitlement,
        requiredTier: item.required_tier,
        contentStatus: "ACTIVE",
        activeDeviceCount,
        deviceLimit: parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
        currentDeviceActive: true,
        jurisdictionAllowed: jurisdictionAllowed(
          item.jurisdiction_policy,
          profile?.jurisdiction_code ?? null,
        ),
      });
      return {
        slug: item.slug,
        title: item.title,
        bodyText: item.body_text,
        publishedAt: item.published_at,
        tier: item.required_tier,
        contentType: item.content_type,
        sizeBytes: item.size_bytes,
        allowComments: item.allow_comments === 1,
        commentCount: item.comment_count,
        accessible: decision.allowed,
        denialCode: decision.allowed ? null : decision.code,
      };
    }),
  };
}

interface CommentContext {
  contentId: string;
  allowComments: boolean;
  entitlementActive: boolean;
}

async function commentContext(
  request: Request,
  env: MembershipEnv,
  userId: string,
  slug: string,
): Promise<CommentContext> {
  if (!/^[a-z0-9-]{1,128}$/.test(slug)) throw new ApiError(400, "INVALID_CONTENT_SLUG");
  const deviceToken = validateDeviceToken(request.headers.get("X-Device-Token"));
  const tokenHash = await sha256Hex(deviceToken);
  const now = isoNow();
  const row = await env.DB.prepare(`
    WITH active_entitlement AS (
      SELECT id, tier, status, starts_at, expires_at
      FROM entitlements
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
        AND starts_at <= ? AND expires_at > ?
      ORDER BY CASE tier
        WHEN 'EXCLUSIVE_VIP' THEN 3
        WHEN 'EXCLUSIVE_PREMIUM' THEN 2
        ELSE 1
      END DESC, expires_at DESC
      LIMIT 1
    ),
    current_device AS (
      SELECT id, status, last_seen_at
      FROM registered_devices
      WHERE appwrite_user_id = ? AND device_token_hash = ?
      LIMIT 1
    ),
    device_count AS (
      SELECT COUNT(*) AS active_count
      FROM registered_devices
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
    )
    SELECT
      p.appwrite_user_id, p.email, p.display_name, p.email_verified,
      p.account_status, p.age_status, p.jurisdiction_code, p.last_active_at,
      p.last_appwrite_access_at, p.administrative_hold, p.legal_retention_until,
      p.deletion_job_hold, p.version,
      c.id AS content_id, c.content_status, c.required_tier,
      c.jurisdiction_policy, c.allow_comments,
      e.id AS entitlement_id, e.tier AS entitlement_tier,
      e.status AS entitlement_status, e.starts_at AS entitlement_starts_at,
      e.expires_at AS entitlement_expires_at,
      d.id AS device_id, d.status AS device_status, d.last_seen_at AS device_last_seen_at,
      dc.active_count
    FROM user_profiles p
    JOIN content_items c ON c.slug = ?
    LEFT JOIN active_entitlement e ON 1 = 1
    LEFT JOIN current_device d ON 1 = 1
    LEFT JOIN device_count dc ON 1 = 1
    WHERE p.appwrite_user_id = ?
  `).bind(userId, now, now, userId, tokenHash, userId, slug, userId).first<{
    appwrite_user_id: string;
    email: string;
    display_name: string;
    email_verified: number;
    account_status: UserProfileRow["account_status"];
    age_status: UserProfileRow["age_status"];
    jurisdiction_code: string | null;
    last_active_at: string | null;
    last_appwrite_access_at: string | null;
    administrative_hold: number;
    legal_retention_until: string | null;
    deletion_job_hold: number;
    version: number;
    content_id: string;
    content_status: "DISABLED" | "REVIEW" | "ACTIVE" | "RETIRED";
    required_tier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
    jurisdiction_policy: string | null;
    allow_comments: number;
    entitlement_id: string | null;
    entitlement_tier: EntitlementRow["tier"] | null;
    entitlement_status: EntitlementRow["status"] | null;
    entitlement_starts_at: string | null;
    entitlement_expires_at: string | null;
    device_id: string | null;
    device_status: "ACTIVE" | "REVOKED" | null;
    device_last_seen_at: string | null;
    active_count: number | null;
  }>();
  if (!row) throw new ApiError(404, "CONTENT_NOT_FOUND");
  const profile: UserProfileRow = {
    appwrite_user_id: row.appwrite_user_id,
    email: row.email,
    display_name: row.display_name,
    email_verified: row.email_verified,
    account_status: row.account_status,
    age_status: row.age_status,
    jurisdiction_code: row.jurisdiction_code,
    last_active_at: row.last_active_at,
    last_appwrite_access_at: row.last_appwrite_access_at,
    administrative_hold: row.administrative_hold,
    legal_retention_until: row.legal_retention_until,
    deletion_job_hold: row.deletion_job_hold,
    version: row.version,
  };
  const entitlement: EntitlementRow | null = row.entitlement_id && row.entitlement_tier &&
    row.entitlement_status && row.entitlement_starts_at && row.entitlement_expires_at ? {
      id: row.entitlement_id,
      tier: row.entitlement_tier,
      status: row.entitlement_status,
      starts_at: row.entitlement_starts_at,
      expires_at: row.entitlement_expires_at,
    } : null;
  const decision = authorizeProtectedContent({
    profile,
    entitlement,
    requiredTier: row.required_tier,
    contentStatus: row.content_status,
    activeDeviceCount: Number(row.active_count ?? 0),
    deviceLimit: parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
    currentDeviceActive: row.device_status === "ACTIVE",
    jurisdictionAllowed: jurisdictionAllowed(row.jurisdiction_policy, row.jurisdiction_code),
  });
  if (!decision.allowed) throw new ApiError(403, decision.code);
  await touchRegisteredDevice(env.DB, row.device_id!, row.device_last_seen_at);
  return {
    contentId: row.content_id,
    allowComments: row.allow_comments === 1,
    entitlementActive: Boolean(entitlement),
  };
}

async function listContentComments(
  request: Request,
  env: MembershipEnv,
  userId: string,
  slug: string,
): Promise<Record<string, unknown>> {
  const context = await commentContext(request, env, userId, slug);
  const comments = await env.DB.prepare(`
    SELECT comments.id, comments.appwrite_user_id, comments.body, comments.created_at,
      profiles.display_name, profiles.account_status
    FROM content_comments comments
    LEFT JOIN user_profiles profiles
      ON profiles.appwrite_user_id = comments.appwrite_user_id
    WHERE comments.content_item_id = ? AND comments.status = 'ACTIVE'
    ORDER BY comments.created_at ASC
    LIMIT 300
  `).bind(context.contentId).all<{
    id: string;
    appwrite_user_id: string;
    body: string;
    created_at: string;
    display_name: string | null;
    account_status: string | null;
  }>();
  return {
    allowComments: context.allowComments,
    canComment: context.allowComments && context.entitlementActive,
    comments: comments.results.map((comment) => ({
      id: comment.id,
      body: comment.body,
      displayName: comment.account_status === "DELETED"
        ? "Deleted member"
        : comment.display_name || "Member",
      createdAt: comment.created_at,
      own: comment.appwrite_user_id === userId,
    })),
  };
}

async function createContentComment(
  request: Request,
  env: MembershipEnv,
  userId: string,
  slug: string,
): Promise<Record<string, unknown>> {
  const context = await commentContext(request, env, userId, slug);
  if (!context.allowComments) throw new ApiError(403, "COMMENTS_DISABLED");
  if (!context.entitlementActive) throw new ApiError(403, "PAID_MEMBERSHIP_REQUIRED");
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["body"]);
  if (typeof body.body !== "string") throw new ApiError(400, "INVALID_COMMENT");
  const commentBody = body.body.trim();
  if (
    commentBody.length < 1 || commentBody.length > 1200 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(commentBody)
  ) throw new ApiError(400, "INVALID_COMMENT");
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, body, created_at FROM content_comments
    WHERE appwrite_user_id = ? AND idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{ id: string; body: string; created_at: string }>();
  if (replay) return { comment: { id: replay.id, body: replay.body, createdAt: replay.created_at, own: true }, existing: true };
  const commentId = crypto.randomUUID();
  const now = isoNow();
  await env.DB.prepare(`
    INSERT INTO content_comments (
      id, content_item_id, appwrite_user_id, body, status,
      idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
  `).bind(commentId, context.contentId, userId, commentBody, idempotencyKey, now, now).run();
  return { comment: { id: commentId, body: commentBody, createdAt: now, own: true }, existing: false };
}

async function deleteOwnContentComment(
  request: Request,
  env: MembershipEnv,
  userId: string,
  commentId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) throw new ApiError(400, "INVALID_COMMENT_ID");
  requireIdempotencyKey(request);
  const now = isoNow();
  const result = await env.DB.prepare(`
    UPDATE content_comments
    SET body = '[deleted]', status = 'DELETED', deleted_at = ?, updated_at = ?
    WHERE id = ? AND appwrite_user_id = ? AND status = 'ACTIVE'
  `).bind(now, now, commentId, userId).run();
  if ((result.meta.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare(`
      SELECT status FROM content_comments WHERE id = ? AND appwrite_user_id = ?
    `).bind(commentId, userId).first<{ status: string }>();
    if (!existing) throw new ApiError(404, "COMMENT_NOT_FOUND");
    if (existing.status === "DELETED") return { commentId, status: "DELETED", existing: true };
    throw new ApiError(409, "COMMENT_NOT_DELETABLE");
  }
  return { commentId, status: "DELETED", existing: false };
}

async function authorizeContent(
  request: Request,
  env: MembershipEnv,
  userId: string,
  slug: string,
  origin: string | null,
  origins: ReadonlySet<string>,
  correlationId: string,
): Promise<Response> {
  if (!/^[a-z0-9-]{1,128}$/.test(slug)) throw new ApiError(400, "INVALID_CONTENT_SLUG");
  const deviceToken = validateDeviceToken(request.headers.get("X-Device-Token"));
  const tokenHash = await sha256Hex(deviceToken);
  const [access, content] = await Promise.all([
    getAccessContext(env.DB, userId, tokenHash),
    getContentItem(env.DB, slug),
  ]);
  const { profile, entitlement, device, activeDeviceCount } = access;
  if (!content) throw new ApiError(404, "CONTENT_NOT_FOUND");
  const decision = authorizeProtectedContent({
    profile,
    entitlement,
    requiredTier: content.required_tier,
    contentStatus: content.content_status,
    activeDeviceCount,
    deviceLimit: parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
    currentDeviceActive: device?.status === "ACTIVE",
    jurisdictionAllowed: jurisdictionAllowed(content.jurisdiction_policy, profile?.jurisdiction_code ?? null),
  });
  if (!decision.allowed) throw new ApiError(403, decision.code);
  await touchRegisteredDevice(env.DB, device!.id, device!.last_seen_at);

  if (env.PROTECTED_CONTENT_MODE !== "private-r2-v1") {
    throw new ApiError(503, "PROTECTED_CONTENT_DISABLED");
  }
  const upload = await env.DB.prepare(`
    SELECT r2_object_key, content_type, size_bytes, object_etag FROM content_uploads
    WHERE content_item_id = ? AND status = 'ACTIVE'
  `).bind(content.id).first<{
    r2_object_key: string;
    content_type: string;
    size_bytes: number;
    object_etag: string;
  }>();
  if (!upload) throw new ApiError(503, "CONTENT_MEDIA_UNAVAILABLE");
  const rangeHeader = request.headers.get("Range");
  let status = 200;
  let range: { offset: number; length: number } | undefined;
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) throw new ApiError(416, "INVALID_CONTENT_RANGE");
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : upload.size_bytes - 1;
    if (
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end < start || end >= upload.size_bytes
    ) throw new ApiError(416, "INVALID_CONTENT_RANGE");
    range = { offset: start, length: end - start + 1 };
    status = 206;
  }
  const object = await env.CONTENT_MEDIA.get(
    upload.r2_object_key,
    range ? { range } : undefined,
  );
  if (!object || object.etag !== upload.object_etag) {
    throw new ApiError(503, "CONTENT_INTEGRITY_CHECK_FAILED");
  }
  const headers = corsHeaders(origin, origins);
  headers.set("Content-Type", upload.content_type);
  headers.set("Content-Disposition", "inline");
  headers.set("Accept-Ranges", "bytes");
  headers.set("X-Request-Id", correlationId);
  if (range) {
    headers.set("Content-Length", String(range.length));
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${upload.size_bytes}`,
    );
  } else headers.set("Content-Length", String(upload.size_bytes));
  return new Response(object.body, { status, headers });
}

async function privacyOverview(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const [profileResult, requestsResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT country_code, region_code, privacy_regime,
        privacy_notice_version, privacy_notice_acknowledged_at,
        marketing_opt_out, sale_share_opt_out, targeted_ads_opt_out,
        profiling_opt_out, sensitive_data_limit, privacy_choices_updated_at
      FROM user_profiles WHERE appwrite_user_id = ?
    `).bind(userId),
    env.DB.prepare(`
      SELECT id, request_type, status, request_note, statutory_deadline_at,
        response_summary, decided_at, created_at, updated_at
      FROM privacy_requests
      WHERE appwrite_user_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).bind(userId),
  ]);
  if (!profileResult || !requestsResult) throw new ApiError(503, "PRIVACY_DATA_UNAVAILABLE");
  const profile = profileResult.results[0] as {
    country_code: string | null;
    region_code: string | null;
    privacy_regime: string | null;
    privacy_notice_version: string | null;
    privacy_notice_acknowledged_at: string | null;
    marketing_opt_out: number;
    sale_share_opt_out: number;
    targeted_ads_opt_out: number;
    profiling_opt_out: number;
    sensitive_data_limit: number;
    privacy_choices_updated_at: string | null;
  } | undefined;
  if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND");
  return {
    noticeVersion: PRIVACY_NOTICE_VERSION,
    profile: {
      countryCode: profile.country_code,
      regionCode: profile.region_code,
      regime: profile.privacy_regime,
      noticeVersion: profile.privacy_notice_version,
      noticeAcknowledgedAt: profile.privacy_notice_acknowledged_at,
      complete: Boolean(
        profile.country_code &&
        profile.privacy_regime &&
        profile.privacy_notice_acknowledged_at
      ),
    },
    choices: {
      marketingOptOut: profile.marketing_opt_out === 1,
      saleShareOptOut: profile.sale_share_opt_out === 1,
      targetedAdsOptOut: profile.targeted_ads_opt_out === 1,
      profilingOptOut: profile.profiling_opt_out === 1,
      sensitiveDataLimit: profile.sensitive_data_limit === 1,
      updatedAt: profile.privacy_choices_updated_at,
    },
    requests: requestsResult.results.map((row) => {
      const request = row as Record<string, unknown>;
      return {
        id: request.id,
        type: request.request_type,
        status: request.status,
        note: request.request_note,
        deadlineAt: request.statutory_deadline_at,
        response: request.response_summary,
        decidedAt: request.decided_at,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      };
    }),
    practices: {
      sellsPersonalData: false,
      sharesForCrossContextAdvertising: false,
      targetedAdvertising: false,
      solelyAutomatedSignificantDecisions: false,
    },
  };
}

async function updatePrivacyProfile(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, [
    "countryCode",
    "regionCode",
    "noticeAccepted",
    "noticeVersion",
    "gpcSignal",
  ]);
  const country = normalizeCountry(body.countryCode);
  const region = normalizeRegion(country, body.regionCode);
  if (body.noticeAccepted !== true || body.noticeVersion !== PRIVACY_NOTICE_VERSION) {
    throw new ApiError(400, "PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (body.gpcSignal !== undefined && typeof body.gpcSignal !== "boolean") {
    throw new ApiError(400, "INVALID_GPC_SIGNAL");
  }
  const location = privacyRegime(country, region);
  const now = isoNow();
  const result = await env.DB.prepare(`
    UPDATE user_profiles SET
      country_code = ?,
      region_code = ?,
      jurisdiction_code = ?,
      privacy_regime = ?,
      privacy_notice_version = ?,
      privacy_notice_acknowledged_at = ?,
      sale_share_opt_out = CASE WHEN ? = 1 THEN 1 ELSE sale_share_opt_out END,
      targeted_ads_opt_out = CASE WHEN ? = 1 THEN 1 ELSE targeted_ads_opt_out END,
      privacy_choices_updated_at = CASE
        WHEN ? = 1 THEN ? ELSE privacy_choices_updated_at
      END,
      version = version + 1,
      updated_at = ?
    WHERE appwrite_user_id = ?
  `).bind(
    country,
    region,
    location.jurisdiction,
    location.regime,
    PRIVACY_NOTICE_VERSION,
    now,
    body.gpcSignal === true ? 1 : 0,
    body.gpcSignal === true ? 1 : 0,
    body.gpcSignal === true ? 1 : 0,
    now,
    now,
    userId,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new ApiError(404, "PROFILE_NOT_FOUND");
  return {
    countryCode: country,
    regionCode: region,
    regime: location.regime,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    noticeAcknowledgedAt: now,
    gpcApplied: body.gpcSignal === true,
  };
}

async function updatePrivacyChoices(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  const keys = [
    "marketingOptOut",
    "saleShareOptOut",
    "targetedAdsOptOut",
    "profilingOptOut",
    "sensitiveDataLimit",
  ] as const;
  exactObjectKeys(body, keys);
  if (keys.some((key) => typeof body[key] !== "boolean")) {
    throw new ApiError(400, "INVALID_PRIVACY_CHOICES");
  }
  const now = isoNow();
  const result = await env.DB.prepare(`
    UPDATE user_profiles SET
      marketing_opt_out = ?,
      sale_share_opt_out = ?,
      targeted_ads_opt_out = ?,
      profiling_opt_out = ?,
      sensitive_data_limit = ?,
      privacy_choices_updated_at = ?,
      version = version + 1,
      updated_at = ?
    WHERE appwrite_user_id = ? AND country_code IS NOT NULL
  `).bind(
    body.marketingOptOut ? 1 : 0,
    body.saleShareOptOut ? 1 : 0,
    body.targetedAdsOptOut ? 1 : 0,
    body.profilingOptOut ? 1 : 0,
    body.sensitiveDataLimit ? 1 : 0,
    now,
    now,
    userId,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new ApiError(409, "PRIVACY_PROFILE_REQUIRED");
  return { choices: Object.fromEntries(keys.map((key) => [key, body[key]])), updatedAt: now };
}

async function createPrivacyRequest(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["requestType", "note"]);
  if (typeof body.requestType !== "string" || !PRIVACY_REQUEST_TYPES.has(body.requestType)) {
    throw new ApiError(400, "INVALID_PRIVACY_REQUEST_TYPE");
  }
  if (typeof body.note !== "string" || body.note.trim().length < 10 || body.note.length > 1_000) {
    throw new ApiError(400, "PRIVACY_REQUEST_NOTE_REQUIRED");
  }
  const profile = await getUserProfile(env.DB, userId);
  if (!profile?.privacy_regime) throw new ApiError(409, "PRIVACY_PROFILE_REQUIRED");
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, status, statutory_deadline_at
    FROM privacy_requests
    WHERE appwrite_user_id = ? AND idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{
    id: string;
    status: string;
    statutory_deadline_at: string;
  }>();
  if (replay) {
    return {
      requestId: replay.id,
      status: replay.status,
      deadlineAt: replay.statutory_deadline_at,
    };
  }
  const open = await env.DB.prepare(`
    SELECT id, status, statutory_deadline_at
    FROM privacy_requests
    WHERE appwrite_user_id = ? AND request_type = ?
      AND status IN ('PENDING', 'IN_REVIEW')
    LIMIT 1
  `).bind(userId, body.requestType).first<{
    id: string;
    status: string;
    statutory_deadline_at: string;
  }>();
  if (open) {
    return { requestId: open.id, status: open.status, deadlineAt: open.statutory_deadline_at };
  }
  const now = isoNow();
  const id = crypto.randomUUID();
  const deadlineAt = privacyDeadline(profile.privacy_regime);
  await env.DB.prepare(`
    INSERT INTO privacy_requests (
      id, appwrite_user_id, request_type, status, request_note, idempotency_key,
      privacy_regime, statutory_deadline_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    body.requestType,
    body.note.trim(),
    idempotencyKey,
    profile.privacy_regime,
    deadlineAt,
    now,
    now,
  ).run();
  return { requestId: id, status: "PENDING", deadlineAt };
}

async function cancelPrivacyRequest(
  request: Request,
  env: MembershipEnv,
  userId: string,
  privacyRequestId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, []);
  const now = isoNow();
  const result = await env.DB.prepare(`
    UPDATE privacy_requests SET status = 'CANCELLED', updated_at = ?
    WHERE id = ? AND appwrite_user_id = ? AND status = 'PENDING'
  `).bind(now, privacyRequestId, userId).run();
  if ((result.meta.changes ?? 0) !== 1) throw new ApiError(409, "PRIVACY_REQUEST_NOT_CANCELLABLE");
  return { requestId: privacyRequestId, status: "CANCELLED" };
}

async function exportPrivacyData(
  env: MembershipEnv,
  userId: string,
  origin: string | null,
  origins: ReadonlySet<string>,
  correlationId: string,
): Promise<Response> {
  const results = await env.DB.batch([
    env.DB.prepare(`
      SELECT email, display_name, email_verified, account_status, age_status,
        country_code, region_code, jurisdiction_code, privacy_regime,
        privacy_notice_version, privacy_notice_acknowledged_at,
        marketing_opt_out, sale_share_opt_out, targeted_ads_opt_out,
        profiling_opt_out, sensitive_data_limit, privacy_choices_updated_at,
        created_at, updated_at
      FROM user_profiles WHERE appwrite_user_id = ?
    `).bind(userId),
    env.DB.prepare(`
      SELECT s.id, p.sku, p.display_name AS product_name, p.tier,
        s.payment_method, s.transfer_reference, s.amount_minor, s.currency,
        s.status, s.payment_due_at, s.current_period_start, s.current_period_end,
        s.settled_at, s.cancelled_at, s.cancellation_source,
        s.billing_name, s.billing_street, s.billing_postal_code, s.billing_city,
        s.billing_country_code, s.created_at, s.updated_at,
        i.invoice_number, i.status AS invoice_status, i.issued_at, i.due_at,
        i.paid_at, i.cancelled_at AS invoice_cancelled_at
      FROM subscriptions s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN invoices i ON i.subscription_id = s.id
      WHERE s.appwrite_user_id = ?
      ORDER BY s.created_at DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT tier, status, starts_at, expires_at, revoked_at, revocation_reason,
        created_at, updated_at
      FROM entitlements WHERE appwrite_user_id = ? ORDER BY created_at DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT status, threshold, review_method, manual_review_status,
        instructions_version, consented_at, submitted_at, decided_at,
        upload_expires_at, expires_at, retention_until, evidence_deleted_at,
        created_at, updated_at
      FROM age_verification_cases
      WHERE appwrite_user_id = ? ORDER BY created_at DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT display_name, status, first_seen_at, last_seen_at, revoked_at,
        created_at, updated_at
      FROM registered_devices
      WHERE appwrite_user_id = ? ORDER BY created_at DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT c.body, c.status, c.created_at, c.updated_at, c.deleted_at,
        i.slug AS post_slug, i.title AS post_title
      FROM content_comments c
      JOIN content_items i ON i.id = c.content_item_id
      WHERE c.appwrite_user_id = ? ORDER BY c.created_at DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT request_type, status, request_note, privacy_regime,
        statutory_deadline_at, response_summary, decided_at, created_at, updated_at
      FROM privacy_requests
      WHERE appwrite_user_id = ? ORDER BY created_at DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT b.amount_minor, b.currency, b.creditor_reference,
        b.remittance_information, b.booked_at, b.match_status
      FROM bank_transactions b
      JOIN subscriptions s ON s.id = b.matched_subscription_id
      WHERE s.appwrite_user_id = ? ORDER BY b.booked_at DESC
    `).bind(userId),
  ]);
  const headers = corsHeaders(origin, origins);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(
    "Content-Disposition",
    `attachment; filename="shadows-temptation-data-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-Id", correlationId);
  const payload = {
    format: "shadows-temptation-personal-data-export-v1",
    generatedAt: isoNow(),
    accountId: userId,
    profile: results[0]!.results[0] ?? null,
    ordersAndInvoices: results[1]!.results,
    accessEntitlements: results[2]!.results,
    ageVerificationHistory: results[3]!.results,
    registeredDevices: results[4]!.results,
    comments: results[5]!.results,
    privacyRequests: results[6]!.results,
    matchedPayments: results[7]!.results,
    notes: [
      "Age-verification media is not included in this export.",
      "Evidence media is deleted after approval; legally required transaction records may be retained.",
      "Security secrets, token hashes, internal fraud signals and data about other people are excluded.",
    ],
  };
  return new Response(JSON.stringify(payload, null, 2), { status: 200, headers });
}

async function requestDeletion(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["reason", "confirmation"]);
  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 500) {
    throw new ApiError(400, "DELETION_REASON_REQUIRED");
  }
  if (body.confirmation !== "DELETE_ACCOUNT") {
    throw new ApiError(400, "ACCOUNT_DELETION_CONFIRMATION_REQUIRED");
  }
  const profile = await getUserProfile(env.DB, userId);
  if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND");
  const completed = await env.DB.prepare(`
    SELECT 1 AS found FROM deletion_jobs
    WHERE appwrite_user_id = ? AND status = 'COMPLETED' LIMIT 1
  `).bind(userId).first<{ found: number }>();
  const now = isoNow();
  const inactiveDays = parsePositiveInt(env.INACTIVE_ACCOUNT_DAYS, 30, 3650);
  const inactiveBefore = new Date(Date.now() - inactiveDays * 86_400_000).toISOString();
  const blockers = [
    ...(profile.administrative_hold === 1 ? ["ADMINISTRATIVE_HOLD"] : []),
    ...(profile.deletion_job_hold === 1 ? ["DELETION_JOB_HOLD"] : []),
    ...(completed ? ["ALREADY_DELETED"] : []),
  ];
  if (blockers.length) {
    throw new ApiError(409, `DELETION_BLOCKED_${blockers[0]}`);
  }
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT status, scheduled_at FROM deletion_jobs
    WHERE appwrite_user_id = ? AND idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{ status: string; scheduled_at: string }>();
  if (replay) return { status: replay.status, scheduledAt: replay.scheduled_at };
  const scheduledAt = now;
  const requestRegime = profile.privacy_regime ?? "GLOBAL_BASELINE";
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO deletion_jobs (
        id, appwrite_user_id, status, reason, idempotency_key,
        inactivity_cutoff_at, scheduled_at, retention_checks_json, request_source,
        created_at, updated_at
      ) VALUES (?, ?, 'DELETION_PENDING', ?, ?, ?, ?, ?, 'USER_ERASURE', ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      body.reason.trim(),
      idempotencyKey,
      inactiveBefore,
      scheduledAt,
      JSON.stringify({ blockers, requestedAt: now }),
      now,
      now,
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO privacy_requests (
        id, appwrite_user_id, request_type, status, request_note, idempotency_key,
        privacy_regime, statutory_deadline_at, created_at, updated_at
      ) VALUES (?, ?, 'ERASURE', 'IN_REVIEW', ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      body.reason.trim(),
      `erasure:${idempotencyKey}`,
      requestRegime,
      privacyDeadline(requestRegime),
      now,
      now,
    ),
    env.DB.prepare(`
      UPDATE user_profiles SET account_status = 'DELETION_PENDING',
        version = version + 1, updated_at = ? WHERE appwrite_user_id = ?
    `).bind(now, userId),
  ]);
  let appwriteStatusSync = "SYNCED";
  try {
    await updateAppwriteUserStatus(
      env.IDENTITY_PROJECTION,
      env.LABEL_SYNC_SERVICE_SECRET,
      userId,
      false,
    );
  } catch {
    appwriteStatusSync = "FAILED";
  }
  return { status: "DELETION_PENDING", scheduledAt, appwriteStatusSync };
}

async function route(request: Request, env: MembershipEnv): Promise<Response> {
  const requestUrl = new URL(request.url);
  const origins = allowedOrigins(env.SITE_ORIGINS);
  if (request.method === "OPTIONS") return preflight(request, origins);
  const origin = enforceAllowedOrigin(request, origins);
  const correlationId = requestId(request);
  if (request.method === "GET" && requestUrl.pathname === "/health") {
    return jsonResponse({ status: "ok" }, { origin, origins, requestId: correlationId });
  }
  await enforceRateLimit(
    env.USER_RATE_LIMITER,
    request.headers.get("CF-Connecting-IP") ?? "unknown",
  );
  if (request.method === "GET" && requestUrl.pathname === "/v1/products") {
    const result = await listProducts(env);
    return jsonResponse(result, { origin, origins, requestId: correlationId });
  }
  if (request.method === "POST" && requestUrl.pathname === "/v1/auth/password-reset/request") {
    if (env.AUTH_EMAIL_MODE !== "CUSTOM") {
      throw new ApiError(503, "CUSTOM_AUTH_EMAIL_DISABLED");
    }
    const result = await requestPasswordResetEmail(request, env);
    return jsonResponse(result, { origin, origins, requestId: correlationId });
  }
  if (request.method === "POST" && requestUrl.pathname === "/v1/auth/password-reset/confirm") {
    const result = await completeAuthEmailToken(request, env, "RESET_PASSWORD");
    return jsonResponse(result, { origin, origins, requestId: correlationId });
  }
  if (request.method === "POST" && requestUrl.pathname === "/v1/auth/email-verification/confirm") {
    const result = await completeAuthEmailToken(request, env, "VERIFY_EMAIL");
    return jsonResponse(result, { origin, origins, requestId: correlationId });
  }
  const requiresVerified = !(
    (request.method === "GET" && requestUrl.pathname === "/v1/membership/status") ||
    (request.method === "POST" && requestUrl.pathname === "/v1/auth/email-verification/request") ||
    (request.method === "POST" && requestUrl.pathname === "/v1/account/deletion") ||
    (request.method === "GET" && requestUrl.pathname === "/v1/privacy") ||
    (request.method === "PATCH" && requestUrl.pathname === "/v1/privacy/profile")
  );
  const identity = await authenticateUser(request, env, {
    requireVerifiedEmail: requiresVerified,
  });
  let result: Record<string, unknown>;
  const evidencePath = /^\/v1\/age-verification\/cases\/([0-9a-f-]{36})\/evidence\/([^/]+)$/i
    .exec(requestUrl.pathname);
  const ageSubmitPath = /^\/v1\/age-verification\/cases\/([0-9a-f-]{36})\/submit$/i
    .exec(requestUrl.pathname);
  const paymentOrderPath = /^\/v1\/payments\/orders\/([0-9a-f-]{36})$/i
    .exec(requestUrl.pathname);
  const contentCommentsPath = /^\/v1\/content\/([a-z0-9-]{1,128})\/comments$/
    .exec(requestUrl.pathname);
  const contentCommentPath = /^\/v1\/content\/comments\/([0-9a-f-]{36})$/i
    .exec(requestUrl.pathname);
  const privacyRequestPath = /^\/v1\/privacy\/requests\/([0-9a-f-]{36})$/i
    .exec(requestUrl.pathname);

  if (request.method === "GET" && requestUrl.pathname === "/v1/membership/status") {
    result = await statusResponse(env, identity.userId);
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/auth/email-verification/request") {
    if (env.AUTH_EMAIL_MODE !== "CUSTOM") {
      throw new ApiError(503, "CUSTOM_AUTH_EMAIL_DISABLED");
    }
    result = await requestEmailVerification(request, env, identity);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/entitlements/status") {
    const status = await statusResponse(env, identity.userId);
    result = status.entitlement as Record<string, unknown>;
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/age-verification/cases") {
    result = await createAgeCase(request, env, identity.userId);
  } else if (request.method === "PUT" && evidencePath) {
    result = await uploadAgeEvidence(
      request,
      env,
      identity.userId,
      evidencePath[1]!,
      decodeURIComponent(evidencePath[2]!),
    );
  } else if (request.method === "POST" && ageSubmitPath) {
    result = await submitAgeCase(request, env, identity.userId, ageSubmitPath[1]!);
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/payments/sepa-orders") {
    result = await createSepaOrder(request, env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/payments/orders") {
    result = await listUserPaymentOrders(env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/perks/premium-telegram") {
    result = await premiumTelegramPerk(env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/perks/vip-whatsapp") {
    result = await vipWhatsappPerk(env, identity.userId);
  } else if (request.method === "DELETE" && paymentOrderPath) {
    result = await cancelUserPaymentOrder(request, env, identity.userId, paymentOrderPath[1]!);
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/account/deletion") {
    result = await requestDeletion(request, env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/privacy") {
    result = await privacyOverview(env, identity.userId);
  } else if (request.method === "PATCH" && requestUrl.pathname === "/v1/privacy/profile") {
    result = await updatePrivacyProfile(request, env, identity.userId);
  } else if (request.method === "PATCH" && requestUrl.pathname === "/v1/privacy/choices") {
    result = await updatePrivacyChoices(request, env, identity.userId);
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/privacy/requests") {
    result = await createPrivacyRequest(request, env, identity.userId);
  } else if (request.method === "DELETE" && privacyRequestPath) {
    result = await cancelPrivacyRequest(
      request,
      env,
      identity.userId,
      privacyRequestPath[1]!,
    );
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/privacy/export") {
    return exportPrivacyData(env, identity.userId, origin, origins, correlationId);
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/devices/register") {
    result = await registerDevice(request, env, identity.userId);
  } else if (request.method === "DELETE" && requestUrl.pathname === "/v1/devices/current") {
    result = await revokeCurrentDevice(request, env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/content") {
    result = await listContent(request, env, identity.userId);
  } else if (request.method === "GET" && contentCommentsPath) {
    result = await listContentComments(request, env, identity.userId, contentCommentsPath[1]!);
  } else if (request.method === "POST" && contentCommentsPath) {
    result = await createContentComment(request, env, identity.userId, contentCommentsPath[1]!);
  } else if (request.method === "DELETE" && contentCommentPath) {
    result = await deleteOwnContentComment(request, env, identity.userId, contentCommentPath[1]!);
  } else {
    const contentPath = /^\/v1\/content\/([^/]+)$/.exec(requestUrl.pathname);
    if (request.method === "GET" && contentPath) {
      return authorizeContent(
        request,
        env,
        identity.userId,
        decodeURIComponent(contentPath[1]!),
        origin,
        origins,
        correlationId,
      );
    } else {
      throw new ApiError(404, "NOT_FOUND");
    }
  }
  return jsonResponse(result, { origin, origins, requestId: correlationId });
}

export default {
  async fetch(request: Request, env: MembershipEnv): Promise<Response> {
    const origins = allowedOrigins(env.SITE_ORIGINS);
    const origin = request.headers.get("Origin");
    const correlationId = requestId(request);
    try {
      return await route(request, env);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
      logEvent(error instanceof ApiError && error.status < 500 ? "warn" : "error", "membership_request_failed", {
        code,
        path: new URL(request.url).pathname,
        requestId: correlationId,
      });
      return errorResponse(error, {
        origin: origin && origins.has(origin) ? origin : null,
        origins,
        requestId: correlationId,
      });
    }
  },
} satisfies ExportedHandler<MembershipEnv>;
