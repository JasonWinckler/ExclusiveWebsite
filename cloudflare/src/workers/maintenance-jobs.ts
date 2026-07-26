import { getUserProfile, isoNow } from "../shared/db";
import { logEvent, parsePositiveInt } from "../shared/http";
import {
  deleteAppwriteUser,
  syncAppwriteLabel,
} from "../shared/identity-service";
import { deletionBlockers } from "../shared/policy";
import type {
  MaintenanceEnv,
  PaymentStatus,
} from "../shared/types";

async function acquireLock(
  db: D1Database,
  jobName: string,
  ownerId: string,
  now: string,
  lockMinutes = 15,
): Promise<boolean> {
  const lockedUntil = new Date(Date.parse(now) + lockMinutes * 60_000).toISOString();
  const result = await db.prepare(`
    INSERT INTO maintenance_locks (job_name, owner_id, locked_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(job_name) DO UPDATE SET
      owner_id = excluded.owner_id,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
    WHERE maintenance_locks.locked_until <= excluded.updated_at
  `).bind(jobName, ownerId, lockedUntil, now).run();
  return (result.meta.changes ?? 0) === 1;
}

async function releaseLock(db: D1Database, jobName: string, ownerId: string): Promise<void> {
  await db.prepare(`
    DELETE FROM maintenance_locks WHERE job_name = ? AND owner_id = ?
  `).bind(jobName, ownerId).run();
}

async function expireRecords(env: MaintenanceEnv, now: string, batchSize: number): Promise<void> {
  const expiringCases = await env.DB.prepare(`
    SELECT id, appwrite_user_id FROM age_verification_cases
    WHERE (
      status = 'PENDING' AND manual_review_status = 'UPLOADING' AND upload_expires_at <= ?
    ) OR (
      status = 'APPROVED' AND expires_at IS NOT NULL AND expires_at <= ?
    )
    LIMIT ?
  `).bind(now, now, batchSize).all<{ id: string; appwrite_user_id: string }>();
  for (const ageCase of expiringCases.results) {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE age_verification_cases SET status = 'EXPIRED', manual_review_status = 'EXPIRED',
          retention_until = COALESCE(retention_until, ?), version = version + 1, updated_at = ?
        WHERE id = ? AND status IN ('PENDING', 'APPROVED')
      `).bind(now, now, ageCase.id),
      env.DB.prepare(`
        UPDATE user_profiles SET age_status = 'EXPIRED', version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ? AND age_status IN ('PENDING', 'APPROVED')
      `).bind(now, ageCase.appwrite_user_id),
      env.DB.prepare(`
        INSERT OR IGNORE INTO label_sync_attempts (
          id, appwrite_user_id, category, desired_label, status, idempotency_key,
          created_at, updated_at
        ) VALUES (?, ?, 'AGE', NULL, 'PENDING', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        ageCase.appwrite_user_id,
        `age-expiry-label:${ageCase.id}`,
        now,
        now,
      ),
    ]);
  }
  const expiredOrders = await env.DB.prepare(`
    SELECT id FROM subscriptions
    WHERE status = 'PENDING' AND payment_due_at <= ? LIMIT ?
  `).bind(now, batchSize).all<{ id: string }>();
  for (const order of expiredOrders.results) {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = ?,
          cancellation_source = 'SYSTEM', cancellation_reason = 'PAYMENT_NOT_RECEIVED_WITHIN_48_HOURS',
          version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'PENDING'
      `).bind(now, now, order.id),
      env.DB.prepare(`
        UPDATE invoices SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
        WHERE subscription_id = ? AND status = 'OPEN'
      `).bind(now, now, order.id),
    ]);
  }
  const expiringEntitlements = await env.DB.prepare(`
    SELECT id, appwrite_user_id FROM entitlements
    WHERE status = 'ACTIVE' AND expires_at <= ? LIMIT ?
  `).bind(now, batchSize).all<{ id: string; appwrite_user_id: string }>();
  for (const entitlement of expiringEntitlements.results) {
    await env.DB.prepare(`
      UPDATE entitlements SET status = 'EXPIRED', version = version + 1, updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
    `).bind(now, entitlement.id).run();
    const anotherActive = await env.DB.prepare(`
      SELECT 1 AS found FROM entitlements
      WHERE appwrite_user_id = ? AND status = 'ACTIVE' AND expires_at > ? LIMIT 1
    `).bind(entitlement.appwrite_user_id, now).first<{ found: number }>();
    if (!anotherActive) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO label_sync_attempts (
          id, appwrite_user_id, category, desired_label, status, idempotency_key,
          created_at, updated_at
        ) VALUES (?, ?, 'ACCESS', NULL, 'PENDING', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        entitlement.appwrite_user_id,
        `entitlement-expiry-label:${entitlement.id}`,
        now,
        now,
      ).run();
    }
  }
}

async function discoverInactiveAccounts(
  env: MaintenanceEnv,
  now: string,
  inactiveDays: number,
  graceDays: number,
  batchSize: number,
): Promise<void> {
  const cutoff = new Date(Date.parse(now) - inactiveDays * 86_400_000).toISOString();
  const scheduledAt = new Date(Date.parse(now) + graceDays * 86_400_000).toISOString();
  const profiles = await env.DB.prepare(`
    SELECT appwrite_user_id
    FROM user_profiles p
    WHERE p.account_status IN ('EMAIL_PENDING', 'ACTIVE')
      AND COALESCE(
        CASE
          WHEN p.last_active_at >= p.last_appwrite_access_at THEN p.last_active_at
          ELSE p.last_appwrite_access_at
        END,
        p.last_active_at,
        p.last_appwrite_access_at,
        p.created_at
      ) <= ?
      AND p.administrative_hold = 0
      AND p.deletion_job_hold = 0
      AND (p.legal_retention_until IS NULL OR p.legal_retention_until <= ?)
      AND p.age_status NOT IN ('PENDING', 'RETRY_REQUIRED')
      AND NOT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.appwrite_user_id = p.appwrite_user_id
          AND s.status IN ('PENDING', 'PROCESSING', 'PAID', 'ACTIVE', 'GRACE_PERIOD', 'DISPUTED')
      )
      AND NOT EXISTS (
        SELECT 1 FROM deletion_jobs d WHERE d.appwrite_user_id = p.appwrite_user_id
      )
    LIMIT ?
  `).bind(cutoff, now, batchSize).all<{ appwrite_user_id: string }>();

  for (const profile of profiles.results) {
    const jobId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT OR IGNORE INTO deletion_jobs (
          id, appwrite_user_id, status, reason, idempotency_key,
          inactivity_cutoff_at, scheduled_at, retention_checks_json, created_at, updated_at
        ) VALUES (?, ?, 'DELETION_PENDING', 'INACTIVE_ACCOUNT', ?, ?, ?, ?, ?, ?)
      `).bind(
        jobId,
        profile.appwrite_user_id,
        `inactive:${profile.appwrite_user_id}:${cutoff}`,
        cutoff,
        scheduledAt,
        JSON.stringify({ checkedAt: now, blockers: [] }),
        now,
        now,
      ),
      env.DB.prepare(`
        UPDATE user_profiles SET account_status = 'DELETION_PENDING',
          version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ? AND account_status IN ('EMAIL_PENDING', 'ACTIVE')
      `).bind(now, profile.appwrite_user_id),
    ]);
  }
}

async function deleteEvidenceForCase(
  env: MaintenanceEnv,
  caseId: string,
  now: string,
): Promise<boolean> {
  const uploads = await env.DB.prepare(`
    SELECT id, r2_object_key FROM age_verification_uploads
    WHERE age_case_id = ? AND deleted_at IS NULL
  `).bind(caseId).all<{ id: string; r2_object_key: string }>();
  for (const upload of uploads.results) {
    try {
      await env.VERIFICATION_UPLOADS.delete(upload.r2_object_key);
    } catch {
      return false;
    }
    await env.DB.prepare(`
      UPDATE age_verification_uploads SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).bind(now, now, upload.id).run();
  }
  await env.DB.prepare(`
    UPDATE age_verification_cases SET evidence_deleted_at = ?,
      version = version + 1, updated_at = ?
    WHERE id = ? AND evidence_deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM age_verification_uploads
      WHERE age_case_id = ? AND deleted_at IS NULL
    )
  `).bind(now, now, caseId, caseId).run();
  return true;
}

async function deleteEvidenceForUser(
  env: MaintenanceEnv,
  userId: string,
  now: string,
): Promise<boolean> {
  const cases = await env.DB.prepare(`
    SELECT id FROM age_verification_cases
    WHERE appwrite_user_id = ? AND evidence_deleted_at IS NULL
  `).bind(userId).all<{ id: string }>();
  for (const ageCase of cases.results) {
    if (!await deleteEvidenceForCase(env, ageCase.id, now)) return false;
  }
  return true;
}

async function cleanupRetainedEvidence(
  env: MaintenanceEnv,
  now: string,
  batchSize: number,
): Promise<void> {
  const cases = await env.DB.prepare(`
    SELECT id FROM age_verification_cases
    WHERE evidence_deleted_at IS NULL AND retention_until IS NOT NULL AND retention_until <= ?
    ORDER BY retention_until ASC LIMIT ?
  `).bind(now, batchSize).all<{ id: string }>();
  for (const ageCase of cases.results) {
    if (!await deleteEvidenceForCase(env, ageCase.id, now)) {
      logEvent("error", "age_evidence_cleanup_failed", {
        requestId: ageCase.id,
      });
    }
  }
}

async function loadDeletionBlockers(
  env: MaintenanceEnv,
  userId: string,
  inactiveBefore: string,
  now: string,
): Promise<string[]> {
  const profile = await getUserProfile(env.DB, userId);
  if (!profile) return ["PROFILE_NOT_FOUND"];
  const [subscriptions, completed] = await Promise.all([
    env.DB.prepare(`
      SELECT status FROM subscriptions WHERE appwrite_user_id = ?
    `).bind(userId).all<{ status: PaymentStatus }>(),
    env.DB.prepare(`
      SELECT 1 AS found FROM deletion_jobs
      WHERE appwrite_user_id = ? AND status = 'COMPLETED' LIMIT 1
    `).bind(userId).first<{ found: number }>(),
  ]);
  const latestActivity = [profile.last_active_at, profile.last_appwrite_access_at]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return deletionBlockers({
    latestTrustedActivityAt: latestActivity,
    inactiveBefore,
    subscriptionStatuses: subscriptions.results.map((row) => row.status),
    ageStatus: profile.age_status,
    administrativeHold: profile.administrative_hold === 1,
    deletionJobHold: profile.deletion_job_hold === 1,
    legalRetentionUntil: profile.legal_retention_until,
    now,
    deletionCompleted: Boolean(completed),
  });
}

async function processDeletionJobs(
  env: MaintenanceEnv,
  now: string,
  batchSize: number,
  inactiveDays: number,
): Promise<void> {
  const jobs = await env.DB.prepare(`
    SELECT id, appwrite_user_id, inactivity_cutoff_at, status, version
    FROM deletion_jobs
    WHERE status IN ('DELETION_PENDING', 'BLOCKED', 'FAILED') AND scheduled_at <= ?
    ORDER BY scheduled_at ASC LIMIT ?
  `).bind(now, batchSize).all<{
    id: string;
    appwrite_user_id: string;
    inactivity_cutoff_at: string;
    status: string;
    version: number;
  }>();
  const inactiveBefore = new Date(Date.parse(now) - inactiveDays * 86_400_000).toISOString();
  for (const job of jobs.results) {
    const blockers = await loadDeletionBlockers(
      env,
      job.appwrite_user_id,
      inactiveBefore,
      now,
    );
    if (blockers.length) {
      await env.DB.prepare(`
        UPDATE deletion_jobs SET status = 'BLOCKED', retention_checks_json = ?,
          inactivity_cutoff_at = ?, scheduled_at = ?,
          last_error_code = ?, attempt_count = attempt_count + 1,
          version = version + 1, updated_at = ? WHERE id = ?
      `).bind(
        JSON.stringify({ checkedAt: now, blockers }),
        inactiveBefore,
        new Date(Date.parse(now) + 86_400_000).toISOString(),
        blockers[0],
        now,
        job.id,
      ).run();
      continue;
    }
    if (!await deleteEvidenceForUser(env, job.appwrite_user_id, now)) {
      await env.DB.prepare(`
        UPDATE deletion_jobs SET status = 'FAILED', last_error_code = 'EVIDENCE_DELETION_FAILED',
          attempt_count = attempt_count + 1, version = version + 1, updated_at = ?
        WHERE id = ?
      `).bind(now, job.id).run();
      continue;
    }
    const claimed = await env.DB.prepare(`
      UPDATE deletion_jobs SET status = 'EXECUTING', started_at = ?,
        attempt_count = attempt_count + 1, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status IN ('DELETION_PENDING', 'BLOCKED', 'FAILED')
    `).bind(now, now, job.id, job.version).run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE entitlements SET status = 'REVOKED', revoked_at = ?,
          revocation_reason = 'ACCOUNT_DELETION', version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ? AND status = 'ACTIVE'
      `).bind(now, now, job.appwrite_user_id),
      env.DB.prepare(`
        UPDATE registered_devices SET status = 'REVOKED', revoked_at = ?,
          version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ? AND status = 'ACTIVE'
      `).bind(now, now, job.appwrite_user_id),
    ]);
    try {
      await deleteAppwriteUser(
        env.IDENTITY_PROJECTION,
        env.ACCOUNT_LIFECYCLE_SERVICE_SECRET,
        job.appwrite_user_id,
      );
    } catch {
      await env.DB.prepare(`
        UPDATE deletion_jobs SET status = 'FAILED', last_error_code = 'APPWRITE_DELETION_FAILED',
          version = version + 1, updated_at = ? WHERE id = ? AND status = 'EXECUTING'
      `).bind(now, job.id).run();
      continue;
    }
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE user_profiles SET account_status = 'DELETED', deleted_at = ?,
          email = 'deleted', display_name = '', version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ?
      `).bind(now, now, job.appwrite_user_id),
      env.DB.prepare(`
        UPDATE deletion_jobs SET status = 'COMPLETED', completed_at = ?,
          last_error_code = NULL, version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'EXECUTING'
      `).bind(now, now, job.id),
      env.DB.prepare(`
        INSERT INTO admin_audit_events (
          id, administrator_appwrite_user_id, action, target_type, target_id,
          previous_state_json, new_state_json, reason, correlation_id, created_at
        ) VALUES (?, 'system:maintenance-jobs', 'ACCOUNT_DELETED', 'USER', ?,
          ?, ?, 'INACTIVE_ACCOUNT_POLICY', ?, ?)
      `).bind(
        crypto.randomUUID(),
        job.appwrite_user_id,
        JSON.stringify({ accountStatus: "DELETION_PENDING" }),
        JSON.stringify({ accountStatus: "DELETED" }),
        job.id,
        now,
      ),
    ]);
  }
}

async function retryLabelSync(env: MaintenanceEnv, now: string, batchSize: number): Promise<void> {
  const attempts = await env.DB.prepare(`
    SELECT id, appwrite_user_id, category, desired_label
    FROM label_sync_attempts
    WHERE status IN ('PENDING', 'FAILED') AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY updated_at ASC LIMIT ?
  `).bind(now, batchSize).all<{
    id: string;
    appwrite_user_id: string;
    category: "AGE" | "ACCESS";
    desired_label: string | null;
  }>();
  for (const attempt of attempts.results) {
    try {
      await syncAppwriteLabel(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
        userId: attempt.appwrite_user_id,
        category: attempt.category,
        desiredLabel: attempt.desired_label,
      });
      await env.DB.prepare(`
        UPDATE label_sync_attempts SET status = 'SYNCED', attempt_count = attempt_count + 1,
          last_error_code = NULL, next_retry_at = NULL, updated_at = ? WHERE id = ?
      `).bind(now, attempt.id).run();
    } catch {
      await env.DB.prepare(`
        UPDATE label_sync_attempts SET attempt_count = attempt_count + 1,
          next_retry_at = ?, updated_at = ? WHERE id = ?
      `).bind(new Date(Date.parse(now) + 60 * 60_000).toISOString(), now, attempt.id).run();
    }
  }
}

async function applyAuditRetention(
  env: MaintenanceEnv,
  ownerId: string,
  now: string,
  retentionDays: number,
  batchSize: number,
): Promise<void> {
  if (!await acquireLock(env.DB, "audit-retention-delete", ownerId, now, 5)) return;
  try {
    const cutoff = new Date(Date.parse(now) - retentionDays * 86_400_000).toISOString();
    await env.DB.prepare(`
      DELETE FROM admin_audit_events
      WHERE id IN (
        SELECT id FROM admin_audit_events WHERE created_at < ? ORDER BY created_at LIMIT ?
      )
    `).bind(cutoff, batchSize).run();
  } finally {
    await releaseLock(env.DB, "audit-retention-delete", ownerId);
  }
}

async function runMaintenance(env: MaintenanceEnv): Promise<void> {
  const now = isoNow();
  const ownerId = crypto.randomUUID();
  if (!await acquireLock(env.DB, "daily-maintenance", ownerId, now, 20)) {
    logEvent("info", "maintenance_skipped_overlap", { requestId: ownerId });
    return;
  }
  const batchSize = parsePositiveInt(env.MAINTENANCE_BATCH_SIZE, 50, 250);
  const inactiveDays = parsePositiveInt(env.INACTIVE_ACCOUNT_DAYS, 30, 3650);
  try {
    await expireRecords(env, now, batchSize);
    await cleanupRetainedEvidence(env, now, batchSize);
    await retryLabelSync(env, now, batchSize);
    await discoverInactiveAccounts(
      env,
      now,
      inactiveDays,
      parsePositiveInt(env.DELETION_GRACE_DAYS, 7, 90),
      batchSize,
    );
    await processDeletionJobs(env, now, batchSize, inactiveDays);
    await applyAuditRetention(
      env,
      ownerId,
      now,
      parsePositiveInt(env.AUDIT_RETENTION_DAYS, 2555, 36_500),
      batchSize,
    );
    logEvent("info", "maintenance_completed", { requestId: ownerId });
  } finally {
    await releaseLock(env.DB, "daily-maintenance", ownerId);
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  },
  async scheduled(
    _controller: ScheduledController,
    env: MaintenanceEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<MaintenanceEnv>;
