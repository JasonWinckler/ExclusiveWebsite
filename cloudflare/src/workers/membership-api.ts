import { authenticateUser } from "../shared/auth";
import {
  getActiveDeviceCount,
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
import { authorizeProtectedContent, deletionBlockers } from "../shared/policy";
import { sendTransactionalEmail } from "../shared/identity-service";
import { sha256Hex, validateDeviceToken } from "../shared/security";
import type { AgeEvidenceKind, MembershipEnv, PaymentStatus } from "../shared/types";

const AGE_INSTRUCTIONS_VERSION = "manual-age-v3";

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
  const [profile, entitlement, activeDeviceCount, ageCase, evidence] = await Promise.all([
    getUserProfile(env.DB, userId),
    getActiveEntitlement(env.DB, userId),
    getActiveDeviceCount(env.DB, userId),
    env.DB.prepare(`
      SELECT id, manual_review_status, upload_expires_at,
        instructions_version, liveness_challenge_json
      FROM age_verification_cases
      WHERE appwrite_user_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC LIMIT 1
    `).bind(userId).first<{
      id: string;
      manual_review_status: string;
      upload_expires_at: string;
      instructions_version: string;
      liveness_challenge_json: string;
    }>(),
    env.DB.prepare(`
      SELECT evidence_kind FROM age_verification_uploads
      WHERE appwrite_user_id = ? AND deleted_at IS NULL
        AND age_case_id = (
          SELECT id FROM age_verification_cases
          WHERE appwrite_user_id = ? AND status = 'PENDING'
          ORDER BY created_at DESC LIMIT 1
        )
      ORDER BY evidence_kind
    `).bind(userId, userId).all<{ evidence_kind: AgeEvidenceKind }>(),
  ]);
  if (!profile) throw new ApiError(503, "PROFILE_PROJECTION_UNAVAILABLE");
  return {
    account: {
      status: profile.account_status,
      emailVerified: profile.email_verified === 1,
      restricted: profile.account_status === "RESTRICTED",
      deletionPending: profile.account_status === "DELETION_PENDING",
    },
    ageVerification: {
      status: profile.age_status,
      caseId: ageCase?.id ?? null,
      reviewStatus: ageCase?.manual_review_status ?? null,
      uploadExpiresAt: ageCase?.upload_expires_at ?? null,
      instructionsVersion: ageCase?.instructions_version ?? null,
      livenessChallenge: ageCase ? parseChallenge(ageCase.liveness_challenge_json) : [],
      evidenceKinds: evidence.results.map((row) => row.evidence_kind),
    },
    entitlement: entitlement
      ? {
          active: true,
          tier: entitlement.tier,
          expiresAt: entitlement.expires_at,
        }
      : { active: false, tier: null, expiresAt: null },
    devices: {
      active: activeDeviceCount,
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
          upload_expires_at, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, 'PENDING', 'MANUAL_R2', 'UPLOADING', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        caseId,
        userId,
        AGE_INSTRUCTIONS_VERSION,
        now,
        JSON.stringify(challenge),
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
      submitted_at = ?, submission_idempotency_key = ?, version = version + 1, updated_at = ?
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

function invoiceNumber(orderId: string, issuedAt: string): string {
  return `ST-${issuedAt.slice(0, 4)}-${orderId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function invoiceEmailHtml(input: {
  locale: "de" | "en";
  invoiceNumber: string;
  customerName: string;
  productName: string;
  amountMinor: number;
  currency: string;
  dueAt: string;
  reference: string;
  beneficiary: string;
  iban: string;
  bic: string | null;
  sellerName: string;
  sellerAddress: string;
  sellerEmail: string;
  taxNote: string | null;
}): string {
  const isGerman = input.locale === "de";
  const amount = new Intl.NumberFormat(isGerman ? "de-DE" : "en-IE", {
    style: "currency",
    currency: input.currency,
  }).format(input.amountMinor / 100);
  const due = new Intl.DateTimeFormat(isGerman ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(input.dueAt));
  const title = isGerman ? "Deine Rechnung & Zahlungsdaten" : "Your invoice & payment details";
  const intro = isGerman
    ? "Danke für deine Bestellung. Der Auftrag ist 48 Stunden reserviert und wird automatisch storniert, wenn bis dahin kein Zahlungseingang bestätigt wurde."
    : "Thank you for your order. It is reserved for 48 hours and will be cancelled automatically if payment has not been confirmed by then.";
  const labels = isGerman
    ? { invoice: "Rechnung", product: "Mitgliedschaft", total: "Gesamtbetrag", due: "Zahlbar bis", beneficiary: "Empfänger", reference: "Verwendungszweck", note: "Wichtig" }
    : { invoice: "Invoice", product: "Membership", total: "Total", due: "Pay by", beneficiary: "Beneficiary", reference: "Remittance information", note: "Important" };
  return `<!doctype html><html><body style="margin:0;background:#120306;color:#f8eee7;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:32px 20px">
    <div style="background:linear-gradient(145deg,#2a0710,#150407);border:1px solid #7f2438;border-radius:22px;overflow:hidden">
      <div style="padding:28px 32px;border-bottom:1px solid #5a1b2a">
        <div style="color:#d7ad62;font-size:12px;letter-spacing:3px;text-transform:uppercase">Shadow's Temptation</div>
        <h1 style="margin:10px 0 8px;font-family:Georgia,serif;font-size:30px;color:#fff7ed">${title}</h1>
        <p style="margin:0;color:#d9c9c2;line-height:1.6">${intro}</p>
      </div>
      <div style="padding:28px 32px">
        <p style="margin:0 0 20px">${isGerman ? "Hallo" : "Hello"} ${escapeHtml(input.customerName)},</p>
        <table style="width:100%;border-collapse:collapse;color:#f8eee7">
          <tr><td style="padding:9px 0;color:#bdaaa4">${labels.invoice}</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(input.invoiceNumber)}</td></tr>
          <tr><td style="padding:9px 0;color:#bdaaa4">${labels.product}</td><td style="padding:9px 0;text-align:right">${escapeHtml(input.productName)}</td></tr>
          <tr><td style="padding:9px 0;color:#bdaaa4">${labels.total}</td><td style="padding:9px 0;text-align:right;font-size:22px;color:#e7c47d;font-weight:bold">${escapeHtml(amount)}</td></tr>
          <tr><td style="padding:9px 0;color:#bdaaa4">${labels.due}</td><td style="padding:9px 0;text-align:right">${escapeHtml(due)}</td></tr>
        </table>
        <div style="margin:24px 0;padding:20px;background:#0c0204;border-radius:14px;border:1px solid #4a1521">
          <p style="margin:0 0 8px"><strong>${labels.beneficiary}:</strong> ${escapeHtml(input.beneficiary)}</p>
          <p style="margin:0 0 8px"><strong>IBAN:</strong> ${escapeHtml(input.iban)}</p>
          ${input.bic ? `<p style="margin:0 0 8px"><strong>BIC:</strong> ${escapeHtml(input.bic)}</p>` : ""}
          <p style="margin:0"><strong>${labels.reference}:</strong><br><span style="color:#e7c47d;font-weight:bold">${escapeHtml(input.reference)}</span></p>
        </div>
        <p style="padding:14px 16px;background:#3a111b;border-left:3px solid #d7ad62;border-radius:8px;line-height:1.55"><strong>${labels.note}:</strong> ${isGerman ? "Bitte übernimm den Verwendungszweck exakt. Die Freischaltung erfolgt erst nach bestätigtem Zahlungseingang." : "Please use the remittance information exactly as shown. Access is activated only after payment has been confirmed."}</p>
        <p style="font-size:12px;color:#aa9993;line-height:1.6">${isGerman ? "Du hast den sofortigen Beginn der digitalen Bereitstellung nach Zahlungseingang verlangt und bestätigt, dass dein Widerrufsrecht mit Beginn der Bereitstellung erlischt." : "You requested digital supply to begin after payment and acknowledged that your withdrawal right expires when supply begins."}<br><a href="https://exclusive.jason-shadow.com/legal/eu/#terms" style="color:#d7ad62">${isGerman ? "AGB" : "Terms"}</a> · <a href="https://exclusive.jason-shadow.com/legal/eu/#withdrawal" style="color:#d7ad62">${isGerman ? "Widerruf" : "Withdrawal"}</a> · <a href="https://exclusive.jason-shadow.com/legal/eu/#privacy" style="color:#d7ad62">${isGerman ? "Datenschutz" : "Privacy"}</a></p>
        ${input.taxNote ? `<p style="font-size:12px;color:#aa9993">${escapeHtml(input.taxNote)}</p>` : ""}
      </div>
      <div style="padding:20px 32px;background:#0d0204;color:#998984;font-size:12px;line-height:1.6">
        ${escapeHtml(input.sellerName)} · ${escapeHtml(input.sellerAddress)} · ${escapeHtml(input.sellerEmail)}<br>
        <a href="https://exclusive.jason-shadow.com/" style="color:#d7ad62">exclusive.jason-shadow.com</a>
      </div>
    </div>
  </div></body></html>`;
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
  const sellerName = env.INVOICE_SELLER_NAME?.trim() || "Shadow's Temptation · Jason Winckler";
  const sellerAddress = env.INVOICE_SELLER_ADDRESS?.trim() || "Kleiberweg 24, 48432 Rheine, Deutschland";
  const sellerEmail = env.INVOICE_SELLER_EMAIL?.trim() || "info@exclusive.jason-shadow.com";
  const taxNote = env.INVOICE_TAX_NOTE?.trim() || null;
  const statements = [
    env.DB.prepare(`
      INSERT INTO subscriptions (
        id, appwrite_user_id, product_id, payment_method, transfer_reference,
        amount_minor, currency, status, payment_due_at, idempotency_key,
        billing_name, billing_street, billing_postal_code, billing_city,
        billing_country_code, customer_locale, terms_version, terms_accepted_at,
        digital_content_consent_at, withdrawal_acknowledged_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'SEPA_CREDIT_TRANSFER', ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      userId,
      product.id,
      reference,
      product.amount_minor,
      product.currency,
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
        seller_address, seller_email, amount_minor, tax_amount_minor, currency,
        tax_note, issued_at, due_at, email_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'PENDING', ?, ?)
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
          ? `Rechnung ${number} · Zahlung binnen 48 Stunden`
          : `Invoice ${number} · Payment due within 48 hours`,
        html: invoiceEmailHtml({
          locale,
          invoiceNumber: number,
          customerName: billing.name,
          productName: product.display_name,
          amountMinor: product.amount_minor,
          currency: product.currency,
          dueAt: paymentDueAt,
          reference,
          beneficiary: instructions.beneficiary,
          iban: instructions.iban,
          bic: instructions.bic,
          sellerName,
          sellerAddress,
          sellerEmail,
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
  const [profile, premiumEntitlement] = await Promise.all([
    getUserProfile(env.DB, userId),
    env.DB.prepare(`
      SELECT id, expires_at FROM entitlements
      WHERE appwrite_user_id = ? AND tier = 'EXCLUSIVE_PREMIUM'
        AND status = 'ACTIVE' AND starts_at <= ? AND expires_at > ?
      ORDER BY expires_at DESC LIMIT 1
    `).bind(userId, now, now).first<{ id: string; expires_at: string }>(),
  ]);
  if (!profile || profile.account_status !== "ACTIVE" || profile.age_status !== "APPROVED") {
    throw new ApiError(403, "PREMIUM_PERK_NOT_AVAILABLE");
  }
  if (!premiumEntitlement) throw new ApiError(403, "ACTIVE_PREMIUM_REQUIRED");
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
    entitlementExpiresAt: premiumEntitlement.expires_at,
  };
}

async function vipWhatsappPerk(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const now = isoNow();
  const [profile, vipThirtyDayEntitlement] = await Promise.all([
    getUserProfile(env.DB, userId),
    env.DB.prepare(`
      SELECT e.id, e.expires_at
      FROM entitlements e
      INNER JOIN products p ON p.id = e.product_id
      WHERE e.appwrite_user_id = ? AND e.tier = 'EXCLUSIVE_VIP'
        AND e.status = 'ACTIVE' AND e.starts_at <= ? AND e.expires_at > ?
        AND p.sku = 'exclusive-vip-30d'
      ORDER BY e.expires_at DESC LIMIT 1
    `).bind(userId, now, now).first<{ id: string; expires_at: string }>(),
  ]);
  if (!profile || profile.account_status !== "ACTIVE" || profile.age_status !== "APPROVED") {
    throw new ApiError(403, "VIP_WHATSAPP_PERK_NOT_AVAILABLE");
  }
  if (!vipThirtyDayEntitlement) throw new ApiError(403, "ACTIVE_VIP_30_DAY_REQUIRED");
  if (!env.VIP_WHATSAPP_NUMBER) throw new ApiError(503, "VIP_WHATSAPP_NOT_CONFIGURED");
  const digits = env.VIP_WHATSAPP_NUMBER.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new ApiError(503, "VIP_WHATSAPP_NOT_CONFIGURED");
  return {
    available: true,
    phoneNumber: env.VIP_WHATSAPP_NUMBER,
    whatsappUrl: `https://wa.me/${digits}`,
    entitlementExpiresAt: vipThirtyDayEntitlement.expires_at,
  };
}

async function listProducts(env: MembershipEnv): Promise<Record<string, unknown>> {
  const rows = await env.DB.prepare(`
    SELECT p.id, p.sku, p.display_name, p.tier, p.currency, p.amount_minor,
      p.duration_unit, p.duration_value, p.purchase_limit_per_user,
      k.id AS perk_id, k.title AS perk_title, k.description AS perk_description,
      k.sort_order AS perk_sort_order
    FROM products p
    LEFT JOIN product_perks k ON k.product_id = p.id AND k.active = 1
    WHERE p.active = 1
    ORDER BY
      CASE p.tier
        WHEN 'EXCLUSIVE_BASIC' THEN 1
        WHEN 'EXCLUSIVE_PREMIUM' THEN 2
        WHEN 'EXCLUSIVE_VIP' THEN 3
      END,
      CASE p.duration_unit WHEN 'DAYS' THEN 1 ELSE 2 END,
      p.duration_value,
      k.sort_order,
      k.id
  `).all<{
    id: string;
    sku: string;
    display_name: string;
    tier: string;
    currency: string;
    amount_minor: number;
    duration_unit: "DAYS" | "MONTHS";
    duration_value: number;
    purchase_limit_per_user: number | null;
    perk_id: string | null;
    perk_title: string | null;
    perk_description: string | null;
    perk_sort_order: number | null;
  }>();
  const products = new Map<string, Record<string, unknown> & { perks: Record<string, unknown>[] }>();
  for (const row of rows.results) {
    let product = products.get(row.id);
    if (!product) {
      product = {
        sku: row.sku,
        displayName: row.display_name,
        tier: row.tier,
        currency: row.currency,
        amountMinor: row.amount_minor,
        durationUnit: row.duration_unit,
        durationValue: row.duration_value,
        purchaseLimitPerUser: row.purchase_limit_per_user,
        perks: [],
      };
      products.set(row.id, product);
    }
    if (row.perk_id && row.perk_title) {
      product.perks.push({
        title: row.perk_title,
        description: row.perk_description,
        sortOrder: row.perk_sort_order,
      });
    }
  }
  return { products: [...products.values()] };
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
    await touchRegisteredDevice(env.DB, existing.id, now);
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
  const [profile, entitlement, device, activeDeviceCount, content] = await Promise.all([
    getUserProfile(env.DB, userId),
    getActiveEntitlement(env.DB, userId),
    getRegisteredDevice(env.DB, userId, tokenHash),
    getActiveDeviceCount(env.DB, userId),
    env.DB.prepare(`
      SELECT c.slug, c.title, c.body_text, c.allow_comments,
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
      required_tier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
      jurisdiction_policy: string | null;
      content_type: string;
      size_bytes: number;
      comment_count: number;
    }>(),
  ]);
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
  await touchRegisteredDevice(env.DB, device!.id);
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
  env: MembershipEnv,
  userId: string,
  slug: string,
): Promise<CommentContext> {
  if (!/^[a-z0-9-]{1,128}$/.test(slug)) throw new ApiError(400, "INVALID_CONTENT_SLUG");
  const [profile, entitlement, content] = await Promise.all([
    getUserProfile(env.DB, userId),
    getActiveEntitlement(env.DB, userId),
    env.DB.prepare(`
      SELECT id, content_status, required_tier, jurisdiction_policy, allow_comments
      FROM content_items WHERE slug = ?
    `).bind(slug).first<{
      id: string;
      content_status: "DISABLED" | "REVIEW" | "ACTIVE" | "RETIRED";
      required_tier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
      jurisdiction_policy: string | null;
      allow_comments: number;
    }>(),
  ]);
  if (!content) throw new ApiError(404, "CONTENT_NOT_FOUND");
  const decision = authorizeProtectedContent({
    profile,
    entitlement,
    requiredTier: content.required_tier,
    contentStatus: content.content_status,
    activeDeviceCount: 0,
    deviceLimit: parsePositiveInt(env.DEVICE_LIMIT, 3, 10),
    currentDeviceActive: true,
    jurisdictionAllowed: jurisdictionAllowed(
      content.jurisdiction_policy,
      profile?.jurisdiction_code ?? null,
    ),
  });
  if (!decision.allowed) throw new ApiError(403, decision.code);
  return {
    contentId: content.id,
    allowComments: content.allow_comments === 1,
    entitlementActive: Boolean(entitlement),
  };
}

async function listContentComments(
  env: MembershipEnv,
  userId: string,
  slug: string,
): Promise<Record<string, unknown>> {
  const context = await commentContext(env, userId, slug);
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
  const context = await commentContext(env, userId, slug);
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
  const [profile, entitlement, content, device, activeDeviceCount] = await Promise.all([
    getUserProfile(env.DB, userId),
    getActiveEntitlement(env.DB, userId),
    getContentItem(env.DB, slug),
    getRegisteredDevice(env.DB, userId, tokenHash),
    getActiveDeviceCount(env.DB, userId),
  ]);
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
  await touchRegisteredDevice(env.DB, device!.id);

  if (env.PROTECTED_CONTENT_MODE !== "private-r2-v1" || !content.storage_key) {
    throw new ApiError(503, "PROTECTED_CONTENT_DISABLED");
  }
  const upload = await env.DB.prepare(`
    SELECT content_type, size_bytes, object_etag FROM content_uploads
    WHERE content_item_id = ? AND status = 'ACTIVE'
  `).bind(content.id).first<{
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
    content.storage_key,
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

async function requestDeletion(
  request: Request,
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactObjectKeys(body, ["reason"]);
  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 500) {
    throw new ApiError(400, "DELETION_REASON_REQUIRED");
  }
  const profile = await getUserProfile(env.DB, userId);
  if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND");
  const subscriptions = await env.DB.prepare(`
    SELECT status FROM subscriptions WHERE appwrite_user_id = ?
  `).bind(userId).all<{ status: PaymentStatus }>();
  const completed = await env.DB.prepare(`
    SELECT 1 AS found FROM deletion_jobs
    WHERE appwrite_user_id = ? AND status = 'COMPLETED' LIMIT 1
  `).bind(userId).first<{ found: number }>();
  const now = isoNow();
  const inactiveDays = parsePositiveInt(env.INACTIVE_ACCOUNT_DAYS, 30, 3650);
  const inactiveBefore = new Date(Date.now() - inactiveDays * 86_400_000).toISOString();
  const trustedActivity = [profile.last_active_at, profile.last_appwrite_access_at]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const blockers = deletionBlockers({
    latestTrustedActivityAt: trustedActivity,
    inactiveBefore,
    subscriptionStatuses: subscriptions.results.map((row) => row.status),
    ageStatus: profile.age_status,
    administrativeHold: profile.administrative_hold === 1,
    deletionJobHold: profile.deletion_job_hold === 1,
    legalRetentionUntil: profile.legal_retention_until,
    now,
    deletionCompleted: Boolean(completed),
  });
  const executionBlockers = blockers.filter((blocker) => blocker !== "RECENT_ACTIVITY");
  if (executionBlockers.length) {
    throw new ApiError(409, `DELETION_BLOCKED_${executionBlockers[0]}`);
  }
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT status, scheduled_at FROM deletion_jobs
    WHERE appwrite_user_id = ? AND idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{ status: string; scheduled_at: string }>();
  if (replay) return { status: replay.status, scheduledAt: replay.scheduled_at };
  const graceDays = parsePositiveInt(env.DELETION_GRACE_DAYS, 7, 90);
  const graceAt = Date.now() + graceDays * 86_400_000;
  const inactiveAt = trustedActivity
    ? Date.parse(trustedActivity) + inactiveDays * 86_400_000
    : Date.now();
  const scheduledAt = new Date(Math.max(graceAt, inactiveAt)).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO deletion_jobs (
        id, appwrite_user_id, status, reason, idempotency_key,
        inactivity_cutoff_at, scheduled_at, retention_checks_json, created_at, updated_at
      ) VALUES (?, ?, 'DELETION_PENDING', ?, ?, ?, ?, ?, ?, ?)
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
      UPDATE user_profiles SET account_status = 'DELETION_PENDING',
        version = version + 1, updated_at = ? WHERE appwrite_user_id = ?
    `).bind(now, userId),
  ]);
  return { status: "DELETION_PENDING", scheduledAt };
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
  const requiresVerified = !(
    request.method === "GET" && requestUrl.pathname === "/v1/membership/status"
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

  if (request.method === "GET" && requestUrl.pathname === "/v1/membership/status") {
    result = await statusResponse(env, identity.userId);
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
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/devices/register") {
    result = await registerDevice(request, env, identity.userId);
  } else if (request.method === "DELETE" && requestUrl.pathname === "/v1/devices/current") {
    result = await revokeCurrentDevice(request, env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/content") {
    result = await listContent(request, env, identity.userId);
  } else if (request.method === "GET" && contentCommentsPath) {
    result = await listContentComments(env, identity.userId, contentCommentsPath[1]!);
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
