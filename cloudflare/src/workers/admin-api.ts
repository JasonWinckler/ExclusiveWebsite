import { authenticateAdministrator } from "../shared/auth";
import { parseCsv } from "../shared/csv";
import { getUserProfile, isoNow } from "../shared/db";
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
import { syncAppwriteLabel } from "../shared/identity-service";
import { sha256Hex } from "../shared/security";
import type { AdminEnv, AgeEvidenceRow } from "../shared/types";

const AGE_APPROVAL_CHECKLIST = [
  "DOCUMENT_FRONT_LEGIBLE",
  "DOCUMENT_BACK_LEGIBLE",
  "DOCUMENT_VALID_AND_OVER_18",
  "DOCUMENT_SAME_ORIGINAL",
  "FACE_MATCHES_DOCUMENT",
  "LIVE_VIDEO_UNCUT",
  "CHALLENGE_COMPLETED_IN_ORDER",
] as const;

function validateUserId(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,36}$/.test(value)) throw new ApiError(400, "INVALID_USER_ID");
  return value;
}

function validateReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3 || value.length > 500) {
    throw new ApiError(400, "REASON_REQUIRED");
  }
  return value.trim();
}

function exactKeys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_REQUEST");
  }
  const allow = new Set(allowed);
  if (Object.keys(value).some((key) => !allow.has(key))) {
    throw new ApiError(400, "UNSUPPORTED_REQUEST_FIELD");
  }
}

function auditStatement(
  db: D1Database,
  input: {
    administratorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    previousState: unknown;
    newState: unknown;
    reason: string;
    correlationId: string;
    now: string;
  },
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO admin_audit_events (
      id, administrator_appwrite_user_id, action, target_type, target_id,
      previous_state_json, new_state_json, reason, correlation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.administratorUserId,
    input.action,
    input.targetType,
    input.targetId,
    JSON.stringify(input.previousState),
    JSON.stringify(input.newState),
    input.reason,
    input.correlationId,
    input.now,
  );
}

async function userStatus(env: AdminEnv, userId: string): Promise<Record<string, unknown>> {
  const [profile, ageCase, subscriptions, deletionJob] = await Promise.all([
    getUserProfile(env.DB, userId),
    env.DB.prepare(`
      SELECT id, status, decided_at, expires_at, label_sync_status
      FROM age_verification_cases WHERE appwrite_user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(userId).first(),
    env.DB.prepare(`
      SELECT id, product_id, status, current_period_end, grace_until, dispute_open
      FROM subscriptions WHERE appwrite_user_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).bind(userId).all(),
    env.DB.prepare(`
      SELECT id, status, reason, scheduled_at, last_error_code, completed_at
      FROM deletion_jobs WHERE appwrite_user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(userId).first(),
  ]);
  if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND");
  return {
    profile: {
      userId: profile.appwrite_user_id,
      accountStatus: profile.account_status,
      emailVerified: profile.email_verified === 1,
      ageStatus: profile.age_status,
      administrativeHold: profile.administrative_hold === 1,
      legalRetentionUntil: profile.legal_retention_until,
      deletionJobHold: profile.deletion_job_hold === 1,
    },
    ageVerification: ageCase,
    subscriptions: subscriptions.results,
    deletionJob,
  };
}

async function pendingAgeCases(env: AdminEnv): Promise<Record<string, unknown>> {
  const cases = await env.DB.prepare(`
    SELECT c.id, c.appwrite_user_id, c.status, c.manual_review_status,
      c.submitted_at, c.upload_expires_at, c.created_at,
      SUM(CASE WHEN u.deleted_at IS NULL THEN 1 ELSE 0 END) AS evidence_count
    FROM age_verification_cases c
    LEFT JOIN age_verification_uploads u ON u.age_case_id = c.id
    WHERE c.status = 'PENDING' AND c.manual_review_status = 'READY_FOR_REVIEW'
    GROUP BY c.id
    ORDER BY c.submitted_at ASC
    LIMIT 100
  `).all();
  return { cases: cases.results };
}

async function ageCaseDetail(env: AdminEnv, caseId: string): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) throw new ApiError(400, "INVALID_AGE_CASE_ID");
  const [ageCase, evidence] = await Promise.all([
    env.DB.prepare(`
      SELECT c.id, c.appwrite_user_id, c.status, c.manual_review_status,
        c.submitted_at, c.upload_expires_at, c.created_at,
        c.instructions_version, c.consented_at, c.liveness_challenge_json,
        p.email, p.display_name
      FROM age_verification_cases c
      JOIN user_profiles p ON p.appwrite_user_id = c.appwrite_user_id
      WHERE c.id = ?
    `).bind(caseId).first(),
    env.DB.prepare(`
      SELECT id, evidence_kind, content_type, size_bytes, created_at
      FROM age_verification_uploads
      WHERE age_case_id = ? AND deleted_at IS NULL
      ORDER BY CASE evidence_kind
        WHEN 'DOCUMENT_FRONT' THEN 1 WHEN 'DOCUMENT_BACK' THEN 2 ELSE 3 END
    `).bind(caseId).all(),
  ]);
  if (!ageCase) throw new ApiError(404, "AGE_CASE_NOT_FOUND");
  return { case: ageCase, evidence: evidence.results };
}

async function streamAgeEvidence(
  env: AdminEnv,
  evidenceId: string,
  administratorUserId: string,
  correlationId: string,
  origin: string | null,
  origins: ReadonlySet<string>,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId)) throw new ApiError(400, "INVALID_EVIDENCE_ID");
  const evidence = await env.DB.prepare(`
    SELECT id, age_case_id, evidence_kind, r2_object_key, content_type,
      size_bytes, object_etag, deleted_at
    FROM age_verification_uploads WHERE id = ?
  `).bind(evidenceId).first<AgeEvidenceRow>();
  if (!evidence || evidence.deleted_at) throw new ApiError(404, "EVIDENCE_NOT_FOUND");
  const object = await env.VERIFICATION_UPLOADS.get(evidence.r2_object_key);
  if (!object || object.etag !== evidence.object_etag || object.size !== evidence.size_bytes) {
    throw new ApiError(503, "EVIDENCE_INTEGRITY_CHECK_FAILED");
  }
  const now = isoNow();
  await auditStatement(env.DB, {
    administratorUserId,
    action: "AGE_EVIDENCE_ACCESSED",
    targetType: "AGE_EVIDENCE",
    targetId: evidence.id,
    previousState: null,
    newState: { caseId: evidence.age_case_id, kind: evidence.evidence_kind },
    reason: "Manual age review",
    correlationId,
    now,
  }).run();
  const extension = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["video/mp4", "mp4"],
    ["video/webm", "webm"],
  ]).get(evidence.content_type) ?? "bin";
  const headers = corsHeaders(origin, origins);
  headers.set("Content-Type", evidence.content_type);
  headers.set("Content-Length", String(evidence.size_bytes));
  headers.set(
    "Content-Disposition",
    `attachment; filename="${evidence.evidence_kind.toLowerCase()}.${extension}"`,
  );
  headers.set("X-Request-Id", correlationId);
  return new Response(object.body, { headers });
}

async function decideAgeCase(
  request: Request,
  env: AdminEnv,
  caseId: string,
  administratorUserId: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) throw new ApiError(400, "INVALID_AGE_CASE_ID");
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactKeys(body, ["decision", "reason", "checklist"]);
  if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
    throw new ApiError(400, "INVALID_AGE_DECISION");
  }
  const reason = validateReason(body.reason);
  const checklist = Array.isArray(body.checklist) &&
      body.checklist.every((item) => typeof item === "string")
    ? body.checklist
    : [];
  if (body.decision === "APPROVED") {
    const submitted = new Set(checklist);
    if (
      submitted.size !== AGE_APPROVAL_CHECKLIST.length ||
      AGE_APPROVAL_CHECKLIST.some((item) => !submitted.has(item))
    ) throw new ApiError(400, "AGE_APPROVAL_CHECKLIST_INCOMPLETE");
  }
  const ageCase = await env.DB.prepare(`
    SELECT id, appwrite_user_id, status, manual_review_status, version
    FROM age_verification_cases WHERE id = ?
  `).bind(caseId).first<{
    id: string;
    appwrite_user_id: string;
    status: string;
    manual_review_status: string;
    version: number;
  }>();
  if (!ageCase) throw new ApiError(404, "AGE_CASE_NOT_FOUND");
  if (ageCase.status !== "PENDING" || ageCase.manual_review_status !== "READY_FOR_REVIEW") {
    throw new ApiError(409, "AGE_CASE_NOT_DECIDABLE");
  }
  const now = isoNow();
  const retentionUntil = new Date(
    Date.now() + parsePositiveInt(env.AGE_EVIDENCE_RETENTION_DAYS, 7, 90) * 86_400_000,
  ).toISOString();
  const approvalExpiresAt = body.decision === "APPROVED"
    ? new Date(
      Date.now() + parsePositiveInt(env.AGE_APPROVAL_VALID_DAYS, 365, 3_650) * 86_400_000,
    ).toISOString()
    : null;
  const desiredLabel = body.decision === "APPROVED" ? "age_verified" : "age_rejected";
  const attemptId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE age_verification_cases SET status = ?, manual_review_status = ?,
        reviewed_by_appwrite_user_id = ?, review_reason = ?, decided_at = ?,
        review_checklist_json = ?, expires_at = ?, retention_until = ?, label_sync_status = 'PENDING',
        label_sync_last_error_code = NULL, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'PENDING'
        AND manual_review_status = 'READY_FOR_REVIEW'
    `).bind(
      body.decision,
      body.decision,
      administratorUserId,
      reason,
      now,
      JSON.stringify(checklist),
      approvalExpiresAt,
      retentionUntil,
      now,
      ageCase.id,
      ageCase.version,
    ),
    env.DB.prepare(`
      UPDATE user_profiles SET age_status = ?, version = version + 1, updated_at = ?
      WHERE appwrite_user_id = ? AND EXISTS (
        SELECT 1 FROM age_verification_cases
        WHERE id = ? AND reviewed_by_appwrite_user_id = ? AND decided_at = ?
      )
    `).bind(body.decision, now, ageCase.appwrite_user_id, ageCase.id, administratorUserId, now),
    env.DB.prepare(`
      INSERT INTO label_sync_attempts (
        id, appwrite_user_id, category, desired_label, status,
        idempotency_key, created_at, updated_at
      ) SELECT ?, ?, 'AGE', ?, 'PENDING', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM age_verification_cases
        WHERE id = ? AND reviewed_by_appwrite_user_id = ? AND decided_at = ?
      )
    `).bind(
      attemptId,
      ageCase.appwrite_user_id,
      desiredLabel,
      `age-decision:${ageCase.id}:${ageCase.version + 1}`,
      now,
      now,
      ageCase.id,
      administratorUserId,
      now,
    ),
    auditStatement(env.DB, {
      administratorUserId,
      action: `AGE_CASE_${body.decision}`,
      targetType: "AGE_CASE",
      targetId: ageCase.id,
      previousState: { status: ageCase.status, reviewStatus: ageCase.manual_review_status },
      newState: {
        status: body.decision,
        expiresAt: approvalExpiresAt,
        retentionUntil,
        checklist,
      },
      reason,
      correlationId,
      now,
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1) throw new ApiError(409, "AGE_CASE_CONCURRENTLY_UPDATED");

  let labelSyncStatus = "SYNCED";
  try {
    await syncAppwriteLabel(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
      userId: ageCase.appwrite_user_id,
      category: "AGE",
      desiredLabel,
    });
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE age_verification_cases SET label_sync_status = 'SYNCED', updated_at = ?
        WHERE id = ?
      `).bind(now, ageCase.id),
      env.DB.prepare(`
        UPDATE label_sync_attempts SET status = 'SYNCED', attempt_count = 1, updated_at = ?
        WHERE id = ?
      `).bind(now, attemptId),
    ]);
  } catch {
    labelSyncStatus = "FAILED";
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE age_verification_cases SET label_sync_status = 'FAILED',
          label_sync_last_error_code = 'APPWRITE_SYNC_FAILED', updated_at = ? WHERE id = ?
      `).bind(now, ageCase.id),
      env.DB.prepare(`
        UPDATE label_sync_attempts SET status = 'FAILED', attempt_count = 1,
          last_error_code = 'APPWRITE_SYNC_FAILED', next_retry_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(new Date(Date.now() + 60 * 60_000).toISOString(), now, attemptId),
    ]);
  }
  return {
    caseId: ageCase.id,
    userId: ageCase.appwrite_user_id,
    status: body.decision,
    expiresAt: approvalExpiresAt,
    evidenceRetentionUntil: retentionUntil,
    labelSyncStatus,
  };
}

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

function n26Column(headers: string[], candidates: readonly string[]): number {
  const normalized = headers.map(normalizedHeader);
  return normalized.findIndex((header) => candidates.includes(header));
}

function parseN26Date(value: string): string | null {
  const trimmed = value.trim();
  const german = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T].*)?$/.exec(trimmed);
  const isoDate = german
    ? `${german[3]}-${german[2]}-${german[1]}T00:00:00.000Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T00:00:00.000Z`
      : trimmed;
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseEuroMinor(value: string): number | null {
  let normalized = value.trim().replace(/[€\s\u00a0]/g, "");
  if (!normalized) return null;
  const negative = normalized.startsWith("-") || (normalized.startsWith("(") && normalized.endsWith(")"));
  normalized = normalized.replace(/[()]/g, "").replace(/^[-+]/, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = Math.max(lastComma, lastDot);
    normalized = `${normalized.slice(0, decimal).replace(/[.,]/g, "")}.${normalized.slice(decimal + 1)}`;
  } else if (lastComma >= 0) {
    normalized = `${normalized.slice(0, lastComma).replace(/\./g, "")}.${normalized.slice(lastComma + 1)}`;
  } else if ((normalized.match(/\./g) ?? []).length > 1) {
    const decimal = normalized.lastIndexOf(".");
    normalized = `${normalized.slice(0, decimal).replace(/\./g, "")}.${normalized.slice(decimal + 1)}`;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100) * (negative ? -1 : 1);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function extractSepaTransferPurpose(row: string[]): string | null {
  for (const value of row) {
    const match = /Exclusive Content\s*-\s*ID\s*#([A-Z0-9]{8,12})/i.exec(value);
    if (match) return `Exclusive Content - ID #${match[1]!.toUpperCase()}`;
  }
  return null;
}

function entitlementExpiry(
  startsAt: string,
  unit: "DAYS" | "MONTHS",
  value: number,
): string {
  const start = new Date(startsAt);
  if (unit === "DAYS") {
    return new Date(start.getTime() + value * 86_400_000).toISOString();
  }
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + value);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.toISOString();
}

async function importN26Csv(
  request: Request,
  env: AdminEnv,
  administratorUserId: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  if (env.N26_CSV_IMPORT_MODE !== "n26-csv-v1") {
    throw new ApiError(503, "N26_CSV_IMPORT_NOT_CONFIGURED");
  }
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("text/csv")) {
    throw new ApiError(415, "CSV_CONTENT_TYPE_REQUIRED");
  }
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, summary_json, completed_at FROM bank_statement_imports
    WHERE idempotency_key = ? AND administrator_appwrite_user_id = ?
  `).bind(idempotencyKey, administratorUserId).first<{
    id: string;
    summary_json: string | null;
    completed_at: string | null;
  }>();
  if (replay) {
    if (!replay.completed_at || !replay.summary_json) throw new ApiError(409, "IMPORT_NOT_COMPLETED");
    return { importId: replay.id, ...JSON.parse(replay.summary_json) as Record<string, unknown> };
  }
  const bytes = await readRawBody(
    request,
    parsePositiveInt(env.MAX_N26_CSV_BYTES, 2_000_000, 10_000_000),
  );
  const csv = new TextDecoder("utf-8").decode(bytes);
  if (csv.includes("\uFFFD")) {
    throw new ApiError(400, "CSV_MUST_BE_UTF8");
  }
  const table = parseCsv(csv, 2_000, 64);
  const dateColumn = n26Column(table.headers, ["date", "datum"]);
  const amountColumn = n26Column(table.headers, ["amount (eur)", "betrag (eur)", "amount", "betrag"]);
  if (dateColumn < 0 || amountColumn < 0) throw new ApiError(400, "UNSUPPORTED_N26_CSV_HEADERS");
  const importId = crypto.randomUUID();
  const fileHash = await sha256Hex(bytes);
  const startedAt = isoNow();
  await env.DB.prepare(`
    INSERT INTO bank_statement_imports (
      id, source, file_sha256, idempotency_key,
      administrator_appwrite_user_id, created_at
    ) VALUES (?, 'N26_CSV', ?, ?, ?, ?)
  `).bind(importId, fileHash, idempotencyKey, administratorUserId, startedAt).run();

  const summary = {
    rows: table.rows.length,
    incomingCredits: 0,
    matched: 0,
    unmatched: 0,
    reviewRequired: 0,
    duplicates: 0,
    ignored: 0,
  };
  const occurrences = new Map<string, number>();
  const usersToSync = new Map<string, { attemptId: string; desiredLabel: string }>();
  for (const row of table.rows) {
    const amountMinor = parseEuroMinor(row[amountColumn]!);
    const bookedAt = parseN26Date(row[dateColumn]!);
    if (amountMinor == null || amountMinor <= 0 || !bookedAt) {
      summary.ignored += 1;
      continue;
    }
    summary.incomingCredits += 1;
    const payloadHash = await sha256Hex(JSON.stringify(row));
    const occurrence = (occurrences.get(payloadHash) ?? 0) + 1;
    occurrences.set(payloadHash, occurrence);
    const externalTransactionId = `n26:${payloadHash}:${occurrence}`;
    const existing = await env.DB.prepare(`
      SELECT id FROM bank_transactions WHERE external_transaction_id = ?
    `).bind(externalTransactionId).first<{ id: string }>();
    if (existing) {
      summary.duplicates += 1;
      continue;
    }
    const reference = extractSepaTransferPurpose(row);
    const subscription = reference
      ? await env.DB.prepare(`
        SELECT s.id, s.appwrite_user_id, s.status, s.amount_minor, s.currency,
          p.id AS product_id, p.tier, p.duration_unit, p.duration_value
        FROM subscriptions s
        JOIN products p ON p.id = s.product_id
        WHERE s.transfer_reference = ?
      `).bind(reference).first<{
        id: string;
        appwrite_user_id: string;
        status: string;
        amount_minor: number;
        currency: string;
        product_id: string;
        tier: "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
        duration_unit: "DAYS" | "MONTHS";
        duration_value: number;
      }>()
      : null;
    const exactMatch = subscription?.status === "PENDING" &&
      subscription.amount_minor === amountMinor && subscription.currency === "EUR";
    const matchStatus = exactMatch ? "MATCHED" : subscription ? "REVIEW_REQUIRED" : "UNMATCHED";
    const errorCode = !reference
      ? "CREDITOR_REFERENCE_NOT_FOUND"
      : subscription && !exactMatch
        ? "ORDER_STATUS_OR_AMOUNT_MISMATCH"
        : null;
    const transactionId = crypto.randomUUID();
    if (!exactMatch || !subscription) {
      await env.DB.prepare(`
        INSERT INTO bank_transactions (
          id, source, external_transaction_id, amount_minor, currency,
          creditor_reference, booked_at, received_at, payload_sha256,
          idempotency_key, match_status, processing_error_code, created_at
        ) VALUES (?, 'N26_CSV', ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        transactionId,
        externalTransactionId,
        amountMinor,
        reference,
        bookedAt,
        startedAt,
        payloadHash,
        `n26-row:${payloadHash}:${occurrence}`,
        matchStatus,
        errorCode,
        startedAt,
      ).run();
      if (matchStatus === "REVIEW_REQUIRED") summary.reviewRequired += 1;
      else summary.unmatched += 1;
      continue;
    }

    const active = await env.DB.prepare(`
      SELECT MAX(expires_at) AS expires_at FROM entitlements
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
    `).bind(subscription.appwrite_user_id).first<{ expires_at: string | null }>();
    const settledAt = isoNow();
    const startsAt = active?.expires_at && Date.parse(active.expires_at) > Date.parse(settledAt)
      ? active.expires_at
      : settledAt;
    const expiresAt = entitlementExpiry(
      startsAt,
      subscription.duration_unit,
      subscription.duration_value,
    );
    const entitlementId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    const desiredLabel = {
      EXCLUSIVE_BASIC: "active_basic",
      EXCLUSIVE_PREMIUM: "active_premium",
      EXCLUSIVE_VIP: "active_vip",
    }[subscription.tier];
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO bank_transactions (
          id, source, external_transaction_id, amount_minor, currency,
          creditor_reference, booked_at, received_at, payload_sha256,
          idempotency_key, matched_subscription_id, match_status, created_at
        ) VALUES (?, 'N26_CSV', ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, 'MATCHED', ?)
      `).bind(
        transactionId,
        externalTransactionId,
        amountMinor,
        reference,
        bookedAt,
        settledAt,
        payloadHash,
        `n26-row:${payloadHash}:${occurrence}`,
        subscription.id,
        settledAt,
      ),
      env.DB.prepare(`
        UPDATE subscriptions SET status = 'ACTIVE', current_period_start = ?,
          current_period_end = ?, settled_at = ?, settled_by_appwrite_user_id = ?,
          settlement_note = 'N26_CSV_EXACT_MATCH', version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'PENDING'
      `).bind(
        startsAt,
        expiresAt,
        settledAt,
        administratorUserId,
        settledAt,
        subscription.id,
      ),
      env.DB.prepare(`
        INSERT INTO entitlements (
          id, appwrite_user_id, product_id, subscription_id, tier, status,
          starts_at, expires_at, source_event_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
      `).bind(
        entitlementId,
        subscription.appwrite_user_id,
        subscription.product_id,
        subscription.id,
        subscription.tier,
        startsAt,
        expiresAt,
        transactionId,
        settledAt,
        settledAt,
      ),
      env.DB.prepare(`
        INSERT INTO label_sync_attempts (
          id, appwrite_user_id, category, desired_label, status,
          idempotency_key, created_at, updated_at
        ) VALUES (?, ?, 'ACCESS', ?, 'PENDING', ?, ?, ?)
      `).bind(
        attemptId,
        subscription.appwrite_user_id,
        desiredLabel,
        `payment-match:${transactionId}`,
        settledAt,
        settledAt,
      ),
      auditStatement(env.DB, {
        administratorUserId,
        action: "SEPA_PAYMENT_MATCHED",
        targetType: "SUBSCRIPTION",
        targetId: subscription.id,
        previousState: { status: subscription.status },
        newState: { status: "ACTIVE", transactionId, startsAt, expiresAt },
        reason: "Exact N26 CSV match by payment purpose, EUR amount, and pending order",
        correlationId,
        now: settledAt,
      }),
    ]);
    usersToSync.set(subscription.appwrite_user_id, { attemptId, desiredLabel });
    summary.matched += 1;
  }

  for (const [userId, sync] of usersToSync) {
    try {
      await syncAppwriteLabel(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
        userId,
        category: "ACCESS",
        desiredLabel: sync.desiredLabel,
      });
      await env.DB.prepare(`
        UPDATE label_sync_attempts SET status = 'SYNCED', attempt_count = 1,
          updated_at = ? WHERE id = ?
      `).bind(isoNow(), sync.attemptId).run();
    } catch {
      const now = isoNow();
      await env.DB.prepare(`
        UPDATE label_sync_attempts SET status = 'FAILED', attempt_count = 1,
          last_error_code = 'APPWRITE_SYNC_FAILED', next_retry_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(new Date(Date.now() + 60 * 60_000).toISOString(), now, sync.attemptId).run();
    }
  }
  const completedAt = isoNow();
  await env.DB.prepare(`
    UPDATE bank_statement_imports SET summary_json = ?, completed_at = ? WHERE id = ?
  `).bind(JSON.stringify(summary), completedAt, importId).run();
  return { importId, ...summary };
}

async function listContentItems(env: AdminEnv): Promise<Record<string, unknown>> {
  const items = await env.DB.prepare(`
    SELECT c.id, c.slug, c.title, c.content_status, c.required_tier,
      c.published_at, c.created_at, c.updated_at,
      u.id AS upload_id, u.content_type, u.size_bytes, u.created_at AS uploaded_at
    FROM content_items c
    LEFT JOIN content_uploads u
      ON u.content_item_id = c.id AND u.status = 'ACTIVE'
    ORDER BY c.created_at DESC LIMIT 200
  `).all();
  return { items: items.results };
}

async function createContentItem(
  request: Request,
  env: AdminEnv,
  administratorUserId: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactKeys(body, ["slug", "title", "tier"]);
  if (typeof body.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length > 128) {
    throw new ApiError(400, "INVALID_CONTENT_SLUG");
  }
  if (
    typeof body.title !== "string" || body.title.trim().length < 1 || body.title.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(body.title)
  ) throw new ApiError(400, "INVALID_CONTENT_TITLE");
  if (
    body.tier !== "FREE" && body.tier !== "EXCLUSIVE_BASIC" &&
    body.tier !== "EXCLUSIVE_PREMIUM" && body.tier !== "EXCLUSIVE_VIP"
  ) {
    throw new ApiError(400, "INVALID_CONTENT_TIER");
  }
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, slug, title, content_status, required_tier
    FROM content_items WHERE creation_idempotency_key = ?
  `).bind(idempotencyKey).first();
  if (replay) return replay as Record<string, unknown>;
  const contentId = crypto.randomUUID();
  const now = isoNow();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO content_items (
        id, slug, title, content_status, required_tier,
        creation_idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, 'DISABLED', ?, ?, ?, ?)
    `).bind(contentId, body.slug, body.title.trim(), body.tier, idempotencyKey, now, now),
    auditStatement(env.DB, {
      administratorUserId,
      action: "CONTENT_ITEM_CREATED",
      targetType: "CONTENT_ITEM",
      targetId: contentId,
      previousState: null,
      newState: { slug: body.slug, title: body.title.trim(), tier: body.tier, status: "DISABLED" },
      reason: "Admin content upload preparation",
      correlationId,
      now,
    }),
  ]);
  return {
    id: contentId,
    slug: body.slug,
    title: body.title.trim(),
    contentStatus: "DISABLED",
    requiredTier: body.tier,
  };
}

async function uploadContentMedia(
  request: Request,
  env: AdminEnv,
  contentId: string,
  administratorUserId: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(contentId)) throw new ApiError(400, "INVALID_CONTENT_ID");
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await env.DB.prepare(`
    SELECT id, content_type, size_bytes FROM content_uploads
    WHERE idempotency_key = ? AND uploaded_by_appwrite_user_id = ? AND status = 'ACTIVE'
  `).bind(idempotencyKey, administratorUserId).first<{
    id: string;
    content_type: string;
    size_bytes: number;
  }>();
  if (replay) {
    return {
      uploadId: replay.id,
      contentType: replay.content_type,
      sizeBytes: replay.size_bytes,
      contentStatus: "ACTIVE",
      existing: true,
    };
  }
  const item = await env.DB.prepare(`
    SELECT id, slug, content_status, required_tier, storage_key FROM content_items WHERE id = ?
  `).bind(contentId).first<{
    id: string;
    slug: string;
    content_status: string;
    required_tier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
    storage_key: string | null;
  }>();
  if (!item) throw new ApiError(404, "CONTENT_ITEM_NOT_FOUND");
  if (item.storage_key) throw new ApiError(409, "CONTENT_MEDIA_ALREADY_UPLOADED");
  if (item.content_status !== "REVIEW" && item.content_status !== "DISABLED") {
    throw new ApiError(409, "CONTENT_ITEM_NOT_UPLOADABLE");
  }
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const videoTypes = new Set(["video/mp4", "video/webm"]);
  const isImage = Boolean(contentType && imageTypes.has(contentType));
  const isVideo = Boolean(contentType && videoTypes.has(contentType));
  if (!contentType || (!isImage && !isVideo)) {
    throw new ApiError(415, "UNSUPPORTED_CONTENT_MEDIA_TYPE");
  }
  const maxBytes = isVideo
    ? parsePositiveInt(env.CONTENT_VIDEO_MAX_BYTES, 50_000_000, 100_000_000)
    : parsePositiveInt(env.CONTENT_IMAGE_MAX_BYTES, 15_000_000, 25_000_000);
  const bytes = await readRawBody(request, maxBytes);
  if (bytes.byteLength < 1) throw new ApiError(400, "CONTENT_MEDIA_BODY_REQUIRED");
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && Number(declaredLength) !== bytes.byteLength) {
    throw new ApiError(400, "CONTENT_MEDIA_SIZE_MISMATCH");
  }
  const uploadId = crypto.randomUUID();
  const tierPrefix = {
    FREE: "free",
    EXCLUSIVE_BASIC: "exclusive/basic",
    EXCLUSIVE_PREMIUM: "exclusive/premium",
    EXCLUSIVE_VIP: "exclusive/vip",
  }[item.required_tier];
  const objectKey = `${tierPrefix}/${contentId}/${uploadId}`;
  let uploaded: R2Object | null;
  try {
    uploaded = await env.CONTENT_MEDIA.put(objectKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { contentId, uploadId, tier: item.required_tier },
    });
  } catch {
    throw new ApiError(503, "CONTENT_STORAGE_UNAVAILABLE");
  }
  if (!uploaded || uploaded.size !== bytes.byteLength) {
    await env.CONTENT_MEDIA.delete(objectKey).catch(() => undefined);
    throw new ApiError(503, "CONTENT_STORAGE_INTEGRITY_FAILED");
  }
  const now = isoNow();
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO content_uploads (
          id, content_item_id, r2_object_key, content_type, size_bytes,
          object_etag, uploaded_by_appwrite_user_id, idempotency_key,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).bind(
        uploadId,
        contentId,
        objectKey,
        contentType,
        bytes.byteLength,
        uploaded.etag,
        administratorUserId,
        idempotencyKey,
        now,
        now,
      ),
      env.DB.prepare(`
        UPDATE content_items SET storage_key = ?, content_status = 'ACTIVE',
          published_at = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND storage_key IS NULL
      `).bind(objectKey, now, now, contentId),
      auditStatement(env.DB, {
        administratorUserId,
        action: "CONTENT_MEDIA_UPLOADED",
        targetType: "CONTENT_ITEM",
        targetId: contentId,
        previousState: { contentStatus: item.content_status, hasMedia: false },
        newState: {
          contentStatus: "ACTIVE",
          hasMedia: true,
          contentType,
          sizeBytes: bytes.byteLength,
        },
        reason: "Single-creator admin upload and publish",
        correlationId,
        now,
      }),
    ]);
  } catch {
    await env.CONTENT_MEDIA.delete(objectKey).catch(() => undefined);
    throw new ApiError(503, "CONTENT_DATABASE_UPDATE_FAILED");
  }
  return {
    uploadId,
    contentType,
    sizeBytes: bytes.byteLength,
    contentStatus: "ACTIVE",
    existing: false,
  };
}

async function mutateHold(
  request: Request,
  env: AdminEnv,
  input: {
    administratorUserId: string;
    userId: string;
    correlationId: string;
    enabled: boolean;
  },
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactKeys(body, input.enabled ? ["reason", "legalRetentionUntil"] : ["reason"]);
  const reason = validateReason(body.reason);
  let legalRetentionUntil: string | null = null;
  if (input.enabled && body.legalRetentionUntil != null) {
    if (
      typeof body.legalRetentionUntil !== "string" ||
      !Number.isFinite(Date.parse(body.legalRetentionUntil))
    ) throw new ApiError(400, "INVALID_RETENTION_DATE");
    legalRetentionUntil = new Date(body.legalRetentionUntil).toISOString();
  }
  const previous = await getUserProfile(env.DB, input.userId);
  if (!previous) throw new ApiError(404, "PROFILE_NOT_FOUND");
  const now = isoNow();
  const next = {
    administrativeHold: input.enabled,
    legalRetentionUntil: input.enabled ? legalRetentionUntil : null,
  };
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE user_profiles SET administrative_hold = ?,
        administrative_hold_reason = ?, legal_retention_until = ?,
        version = version + 1, updated_at = ?
      WHERE appwrite_user_id = ? AND version = ?
    `).bind(
      input.enabled ? 1 : 0,
      input.enabled ? reason : null,
      input.enabled ? legalRetentionUntil : null,
      now,
      input.userId,
      previous.version,
    ),
    auditStatement(env.DB, {
      administratorUserId: input.administratorUserId,
      action: input.enabled ? "ADMINISTRATIVE_HOLD_ADDED" : "ADMINISTRATIVE_HOLD_REMOVED",
      targetType: "USER",
      targetId: input.userId,
      previousState: {
        administrativeHold: previous.administrative_hold === 1,
        legalRetentionUntil: previous.legal_retention_until,
      },
      newState: next,
      reason,
      correlationId: input.correlationId,
      now,
    }),
  ]);
  return next;
}

async function restrictUser(
  request: Request,
  env: AdminEnv,
  administratorUserId: string,
  userId: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactKeys(body, ["reason"]);
  const reason = validateReason(body.reason);
  const previous = await getUserProfile(env.DB, userId);
  if (!previous) throw new ApiError(404, "PROFILE_NOT_FOUND");
  const now = isoNow();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE user_profiles SET account_status = 'RESTRICTED', restricted_at = ?,
        restriction_reason = ?, version = version + 1, updated_at = ?
      WHERE appwrite_user_id = ? AND version = ?
    `).bind(now, reason, now, userId, previous.version),
    env.DB.prepare(`
      UPDATE entitlements SET status = 'REVOKED', revoked_at = ?,
        revocation_reason = 'ACCOUNT_RESTRICTED', version = version + 1, updated_at = ?
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
    `).bind(now, now, userId),
    auditStatement(env.DB, {
      administratorUserId,
      action: "ACCOUNT_RESTRICTED",
      targetType: "USER",
      targetId: userId,
      previousState: { accountStatus: previous.account_status },
      newState: { accountStatus: "RESTRICTED" },
      reason,
      correlationId,
      now,
    }),
  ]);
  return { accountStatus: "RESTRICTED" };
}

async function retryLabelSync(
  request: Request,
  env: AdminEnv,
  administratorUserId: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(
    request,
    parsePositiveInt(env.MAX_JSON_BODY_BYTES, 32_768, 65_536),
  );
  exactKeys(body, ["attemptId", "reason"]);
  const reason = validateReason(body.reason);
  if (typeof body.attemptId !== "string" || body.attemptId.length > 128) {
    throw new ApiError(400, "INVALID_ATTEMPT_ID");
  }
  const attempt = await env.DB.prepare(`
    SELECT id, appwrite_user_id, category, desired_label, status
    FROM label_sync_attempts WHERE id = ?
  `).bind(body.attemptId).first<{
    id: string;
    appwrite_user_id: string;
    category: "AGE" | "ACCESS";
    desired_label: string | null;
    status: string;
  }>();
  if (!attempt) throw new ApiError(404, "LABEL_SYNC_ATTEMPT_NOT_FOUND");
  await syncAppwriteLabel(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
    userId: attempt.appwrite_user_id,
    category: attempt.category,
    desiredLabel: attempt.desired_label,
  });
  const now = isoNow();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE label_sync_attempts SET status = 'SYNCED', attempt_count = attempt_count + 1,
        last_error_code = NULL, next_retry_at = NULL, updated_at = ? WHERE id = ?
    `).bind(now, attempt.id),
    auditStatement(env.DB, {
      administratorUserId,
      action: "LABEL_SYNC_RETRIED",
      targetType: "LABEL_SYNC_ATTEMPT",
      targetId: attempt.id,
      previousState: { status: attempt.status },
      newState: { status: "SYNCED" },
      reason,
      correlationId,
      now,
    }),
  ]);
  return { status: "SYNCED" };
}

async function route(request: Request, env: AdminEnv): Promise<Response> {
  const origins = allowedOrigins(env.SITE_ORIGINS);
  if (request.method === "OPTIONS") return preflight(request, origins);
  const origin = enforceAllowedOrigin(request, origins);
  const correlationId = requestId(request);
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ status: "ok" }, { origin, origins, requestId: correlationId });
  }
  await enforceRateLimit(
    env.ADMIN_RATE_LIMITER,
    request.headers.get("CF-Connecting-IP") ?? "unknown",
  );
  const administrator = await authenticateAdministrator(
    request,
    env,
    env.ADMIN_LABEL || "admin",
  );
  const evidencePath = /^\/v1\/age-verification\/evidence\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && evidencePath) {
    return streamAgeEvidence(
      env,
      decodeURIComponent(evidencePath[1]!),
      administrator.userId,
      correlationId,
      origin,
      origins,
    );
  }
  let result: Record<string, unknown>;
  const userPath = /^\/v1\/users\/([^/]+)\/(status|hold|restrict)$/.exec(url.pathname);
  const ageCasePath = /^\/v1\/age-verification\/cases\/([^/]+)$/.exec(url.pathname);
  const ageDecisionPath = /^\/v1\/age-verification\/cases\/([^/]+)\/decision$/.exec(url.pathname);
  const contentMediaPath = /^\/v1\/content\/items\/([^/]+)\/media$/.exec(url.pathname);
  if (userPath) {
    const userId = validateUserId(decodeURIComponent(userPath[1]!));
    if (request.method === "GET" && userPath[2] === "status") {
      result = await userStatus(env, userId);
    } else if (request.method === "POST" && userPath[2] === "hold") {
      result = await mutateHold(request, env, {
        administratorUserId: administrator.userId,
        userId,
        correlationId,
        enabled: true,
      });
    } else if (request.method === "DELETE" && userPath[2] === "hold") {
      result = await mutateHold(request, env, {
        administratorUserId: administrator.userId,
        userId,
        correlationId,
        enabled: false,
      });
    } else if (request.method === "POST" && userPath[2] === "restrict") {
      result = await restrictUser(request, env, administrator.userId, userId, correlationId);
    } else {
      throw new ApiError(405, "METHOD_NOT_ALLOWED");
    }
  } else if (request.method === "GET" && url.pathname === "/v1/age-verification/cases") {
    result = await pendingAgeCases(env);
  } else if (request.method === "GET" && ageCasePath) {
    result = await ageCaseDetail(env, decodeURIComponent(ageCasePath[1]!));
  } else if (request.method === "POST" && ageDecisionPath) {
    result = await decideAgeCase(
      request,
      env,
      decodeURIComponent(ageDecisionPath[1]!),
      administrator.userId,
      correlationId,
    );
  } else if (request.method === "POST" && url.pathname === "/v1/payments/n26-csv-import") {
    result = await importN26Csv(request, env, administrator.userId, correlationId);
  } else if (request.method === "GET" && url.pathname === "/v1/content/items") {
    result = await listContentItems(env);
  } else if (request.method === "POST" && url.pathname === "/v1/content/items") {
    result = await createContentItem(request, env, administrator.userId, correlationId);
  } else if (request.method === "PUT" && contentMediaPath) {
    result = await uploadContentMedia(
      request,
      env,
      decodeURIComponent(contentMediaPath[1]!),
      administrator.userId,
      correlationId,
    );
  } else if (request.method === "GET" && url.pathname === "/v1/deletion-jobs") {
    const jobs = await env.DB.prepare(`
      SELECT id, appwrite_user_id, status, reason, scheduled_at, attempt_count,
        last_error_code, completed_at, created_at, updated_at
      FROM deletion_jobs ORDER BY created_at DESC LIMIT 100
    `).all();
    result = { jobs: jobs.results };
  } else if (request.method === "GET" && url.pathname === "/v1/audit-events") {
    const events = await env.DB.prepare(`
      SELECT id, administrator_appwrite_user_id, action, target_type, target_id,
        previous_state_json, new_state_json, reason, correlation_id, created_at
      FROM admin_audit_events ORDER BY created_at DESC LIMIT 100
    `).all();
    result = { events: events.results };
  } else if (request.method === "POST" && url.pathname === "/v1/label-sync/retry") {
    result = await retryLabelSync(request, env, administrator.userId, correlationId);
  } else {
    throw new ApiError(404, "NOT_FOUND");
  }
  return jsonResponse(result, { origin, origins, requestId: correlationId });
}

export default {
  async fetch(request: Request, env: AdminEnv): Promise<Response> {
    const origins = allowedOrigins(env.SITE_ORIGINS);
    const origin = request.headers.get("Origin");
    const correlationId = requestId(request);
    try {
      return await route(request, env);
    } catch (error) {
      logEvent(error instanceof ApiError && error.status < 500 ? "warn" : "error", "admin_request_failed", {
        code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
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
} satisfies ExportedHandler<AdminEnv>;
