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
  exactObjectKeys(body, ["productSku"]);
  if (typeof body.productSku !== "string" || !/^[a-z0-9-]{1,64}$/.test(body.productSku)) {
    throw new ApiError(400, "INVALID_PRODUCT");
  }
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, transfer_reference, status, amount_minor, currency, payment_due_at
    FROM subscriptions WHERE appwrite_user_id = ? AND idempotency_key = ?
  `).bind(userId, idempotencyKey).first<{
    id: string;
    transfer_reference: string;
    status: string;
    amount_minor: number;
    currency: string;
    payment_due_at: string;
  }>();
  if (replay) {
    return sepaOrderResponse(env, {
      id: replay.id,
      status: replay.status,
      transferReference: replay.transfer_reference,
      amountMinor: replay.amount_minor,
      currency: replay.currency,
      paymentDueAt: replay.payment_due_at,
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
    Date.now() + parsePositiveInt(env.SEPA_ORDER_EXPIRY_DAYS, 7, 30) * 86_400_000,
  ).toISOString();
  const reference = createSepaTransferPurpose(crypto.randomUUID().replace(/-/g, ""));
  await env.DB.prepare(`
    INSERT INTO subscriptions (
      id, appwrite_user_id, product_id, payment_method, transfer_reference,
      amount_minor, currency, status, payment_due_at, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, 'SEPA_CREDIT_TRANSFER', ?, ?, ?, 'PENDING', ?, ?, ?, ?)
  `).bind(
    orderId,
    userId,
    product.id,
    reference,
    product.amount_minor,
    product.currency,
    paymentDueAt,
    idempotencyKey,
    now,
    now,
  ).run();
  return sepaOrderResponse(env, {
    id: orderId,
    status: "PENDING",
    transferReference: reference,
    amountMinor: product.amount_minor,
    currency: product.currency,
    paymentDueAt,
  });
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
      SELECT c.slug, c.title, c.required_tier, c.jurisdiction_policy,
        u.content_type, u.size_bytes
      FROM content_items c
      JOIN content_uploads u ON u.content_item_id = c.id AND u.status = 'ACTIVE'
      WHERE c.content_status = 'ACTIVE'
      ORDER BY c.published_at DESC, c.created_at DESC
      LIMIT 200
    `).all<{
      slug: string;
      title: string;
      required_tier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
      jurisdiction_policy: string | null;
      content_type: string;
      size_bytes: number;
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
        tier: item.required_tier,
        contentType: item.content_type,
        sizeBytes: item.size_bytes,
        accessible: decision.allowed,
        denialCode: decision.allowed ? null : decision.code,
      };
    }),
  };
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
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/account/deletion") {
    result = await requestDeletion(request, env, identity.userId);
  } else if (request.method === "POST" && requestUrl.pathname === "/v1/devices/register") {
    result = await registerDevice(request, env, identity.userId);
  } else if (request.method === "DELETE" && requestUrl.pathname === "/v1/devices/current") {
    result = await revokeCurrentDevice(request, env, identity.userId);
  } else if (request.method === "GET" && requestUrl.pathname === "/v1/content") {
    result = await listContent(request, env, identity.userId);
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
