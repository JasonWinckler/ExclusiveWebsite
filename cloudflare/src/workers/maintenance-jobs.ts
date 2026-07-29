import { getUserProfile, isoNow } from "../shared/db";
import { logEvent, parsePositiveInt } from "../shared/http";
import {
  deleteAppwriteUser,
  syncAppwriteLabel,
  updateAppwriteUserName,
} from "../shared/identity-service";
import {
  sendMembershipActivationConfirmation,
  sendMembershipRenewalReminder,
} from "../shared/membership-email";
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
      status = 'PENDING' AND manual_review_status = 'READY_FOR_REVIEW'
        AND review_expires_at IS NOT NULL AND review_expires_at <= ?
    ) OR (
      status = 'APPROVED' AND expires_at IS NOT NULL AND expires_at <= ?
    )
    LIMIT ?
  `).bind(now, now, now, batchSize).all<{ id: string; appwrite_user_id: string }>();
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
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE invoices SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
      WHERE status = 'OPEN' AND subscription_id IN (
        SELECT id FROM subscriptions
        WHERE status = 'PENDING' AND payment_due_at <= ?
        ORDER BY payment_due_at ASC LIMIT ?
      )
    `).bind(now, now, now, batchSize),
    env.DB.prepare(`
      UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = ?,
        cancellation_source = 'SYSTEM',
        cancellation_reason = 'PAYMENT_NOT_RECEIVED_WITHIN_48_HOURS',
        version = version + 1, updated_at = ?
      WHERE id IN (
        SELECT id FROM subscriptions
        WHERE status = 'PENDING' AND payment_due_at <= ?
        ORDER BY payment_due_at ASC LIMIT ?
      )
    `).bind(now, now, now, batchSize),
  ]);
  const cancelledHistoryCutoff = new Date(Date.parse(now) - 2 * 86_400_000).toISOString();
  await env.DB.prepare(`
    UPDATE subscriptions
    SET archived_at = ?, archive_reason = 'AUTOMATIC_CANCELLED_ORDER_HISTORY_CLEANUP',
      version = version + 1, updated_at = ?
    WHERE id IN (
      SELECT id FROM subscriptions
      WHERE status = 'CANCELLED' AND archived_at IS NULL
        AND cancelled_at IS NOT NULL AND cancelled_at <= ?
      ORDER BY cancelled_at ASC
      LIMIT ?
    )
  `).bind(now, now, cancelledHistoryCutoff, batchSize).run();
  const staleAuthProcessingCutoff = new Date(Date.parse(now) - 10 * 60_000).toISOString();
  const authTokenHistoryCutoff = new Date(Date.parse(now) - 2 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE auth_email_tokens
      SET status = CASE WHEN expires_at > ? THEN 'PENDING' ELSE 'EXPIRED' END,
        updated_at = ?
      WHERE status = 'PROCESSING' AND updated_at <= ?
    `).bind(now, now, staleAuthProcessingCutoff),
    env.DB.prepare(`
      UPDATE auth_email_tokens SET status = 'EXPIRED', updated_at = ?
      WHERE status = 'PENDING' AND expires_at <= ?
    `).bind(now, now),
    env.DB.prepare(`
      DELETE FROM auth_email_tokens
      WHERE id IN (
        SELECT id FROM auth_email_tokens
        WHERE status IN ('USED', 'EXPIRED', 'REVOKED') AND updated_at <= ?
        ORDER BY updated_at ASC LIMIT ?
      )
    `).bind(authTokenHistoryCutoff, batchSize),
  ]);
  const resumableEntitlements = await env.DB.prepare(`
    SELECT id FROM entitlements
    WHERE status = 'ACTIVE' AND paused_at IS NOT NULL
      AND resume_at IS NOT NULL AND resume_at <= ? AND expires_at > ?
    ORDER BY resume_at ASC
    LIMIT ?
  `).bind(now, now, batchSize).all<{ id: string }>();
  for (const entitlement of resumableEntitlements.results) {
    await env.DB.prepare(`
      UPDATE entitlements SET paused_at = NULL, paused_remaining_seconds = NULL,
        paused_by_entitlement_id = NULL, resume_at = NULL,
        version = version + 1, updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
        AND paused_at IS NOT NULL AND resume_at <= ?
    `).bind(now, entitlement.id, now).run();
  }
  const expiringEntitlements = await env.DB.prepare(`
    SELECT id, appwrite_user_id FROM entitlements
    WHERE status = 'ACTIVE' AND paused_at IS NULL AND expires_at <= ? LIMIT ?
  `).bind(now, batchSize).all<{ id: string; appwrite_user_id: string }>();
  for (const entitlement of expiringEntitlements.results) {
    await env.DB.prepare(`
      UPDATE entitlements SET status = 'EXPIRED', version = version + 1, updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
    `).bind(now, entitlement.id).run();
    const effective = await env.DB.prepare(`
      SELECT tier FROM entitlements
      WHERE appwrite_user_id = ? AND status = 'ACTIVE'
        AND starts_at <= ? AND expires_at > ? AND paused_at IS NULL
      ORDER BY CASE tier
        WHEN 'EXCLUSIVE_VIP' THEN 3
        WHEN 'EXCLUSIVE_PREMIUM' THEN 2
        ELSE 1
      END DESC, expires_at DESC
      LIMIT 1
    `).bind(entitlement.appwrite_user_id, now, now).first<{ tier: string }>();
    const desiredLabel = {
      EXCLUSIVE_BASIC: "active_basic",
      EXCLUSIVE_PREMIUM: "active_premium",
      EXCLUSIVE_VIP: "active_vip",
    }[effective?.tier ?? ""] ?? null;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO label_sync_attempts (
        id, appwrite_user_id, category, desired_label, status, idempotency_key,
        created_at, updated_at
      ) VALUES (?, ?, 'ACCESS', ?, 'PENDING', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      entitlement.appwrite_user_id,
      desiredLabel,
      `entitlement-expiry-label:${entitlement.id}`,
      now,
      now,
    ).run();
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

async function cleanupRetiredContentMedia(
  env: MaintenanceEnv,
  now: string,
  batchSize: number,
): Promise<void> {
  const uploads = await env.DB.prepare(`
    SELECT id, r2_object_key FROM content_uploads
    WHERE status IN ('REPLACED', 'DELETED') AND deleted_at IS NULL
    ORDER BY updated_at ASC LIMIT ?
  `).bind(batchSize).all<{ id: string; r2_object_key: string }>();
  for (const upload of uploads.results) {
    try {
      await env.CONTENT_MEDIA.delete(upload.r2_object_key);
      await env.DB.prepare(`
        UPDATE content_uploads SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('REPLACED', 'DELETED') AND deleted_at IS NULL
      `).bind(now, now, upload.id).run();
    } catch {
      logEvent("error", "content_media_cleanup_failed", {
        requestId: upload.id,
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
  onlyUserId: string | null = null,
): Promise<"COMPLETED" | "PENDING" | "BLOCKED" | "NOT_FOUND"> {
  const statement = onlyUserId
    ? env.DB.prepare(`
        SELECT id, appwrite_user_id, inactivity_cutoff_at, status, version, request_source
        FROM deletion_jobs
        WHERE status IN ('DELETION_PENDING', 'BLOCKED', 'FAILED') AND scheduled_at <= ?
          AND appwrite_user_id = ?
        ORDER BY scheduled_at ASC LIMIT ?
      `).bind(now, onlyUserId, batchSize)
    : env.DB.prepare(`
        SELECT id, appwrite_user_id, inactivity_cutoff_at, status, version, request_source
        FROM deletion_jobs
        WHERE status IN ('DELETION_PENDING', 'BLOCKED', 'FAILED') AND scheduled_at <= ?
        ORDER BY scheduled_at ASC LIMIT ?
      `).bind(now, batchSize);
  const jobs = await statement.all<{
    id: string;
    appwrite_user_id: string;
    inactivity_cutoff_at: string;
    status: string;
    version: number;
    request_source: "AUTOMATIC" | "USER_ERASURE" | "ADMIN_ERASURE";
  }>();
  if (!jobs.results.length) return "NOT_FOUND";
  let outcome: "COMPLETED" | "PENDING" | "BLOCKED" = "PENDING";
  const inactiveBefore = new Date(Date.parse(now) - inactiveDays * 86_400_000).toISOString();
  for (const job of jobs.results) {
    const policyBlockers = await loadDeletionBlockers(
      env,
      job.appwrite_user_id,
      inactiveBefore,
      now,
    );
    const blockers = job.request_source === "AUTOMATIC"
      ? policyBlockers
      : policyBlockers.filter((blocker) => [
          "ADMINISTRATIVE_HOLD",
          "DELETION_JOB_HOLD",
          "ALREADY_DELETED",
          "PROFILE_NOT_FOUND",
        ].includes(blocker));
    if (blockers.length) {
      outcome = "BLOCKED";
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
        DELETE FROM registered_devices WHERE appwrite_user_id = ?
      `).bind(job.appwrite_user_id),
      env.DB.prepare(`
        DELETE FROM admin_sessions WHERE administrator_appwrite_user_id = ?
      `).bind(job.appwrite_user_id),
      env.DB.prepare(`
        DELETE FROM content_comments WHERE appwrite_user_id = ?
      `).bind(job.appwrite_user_id),
      env.DB.prepare(`
        DELETE FROM auth_email_tokens WHERE appwrite_user_id = ?
      `).bind(job.appwrite_user_id),
      env.DB.prepare(`
        UPDATE age_verification_cases
        SET liveness_challenge_json = '[]', review_reason = NULL,
          review_checklist_json = NULL, version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ?
      `).bind(now, job.appwrite_user_id),
      env.DB.prepare(`
        UPDATE privacy_requests
        SET request_note = 'Account erasure request',
          response_summary = CASE
            WHEN status IN ('COMPLETED', 'DENIED') THEN response_summary
            ELSE NULL
          END,
          updated_at = ?
        WHERE appwrite_user_id = ?
      `).bind(now, job.appwrite_user_id),
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
          email = 'deleted', display_name = '',
          jurisdiction_code = NULL, country_code = NULL, region_code = NULL,
          privacy_regime = NULL, privacy_notice_version = NULL,
          privacy_notice_acknowledged_at = NULL, last_active_at = NULL,
          last_appwrite_access_at = NULL, username_last_changed_at = NULL,
          username_next_change_at = NULL, username_sync_next_retry_at = NULL,
          username_sync_last_error_code = NULL, username_last_idempotency_key = NULL,
          restriction_reason = NULL, version = version + 1, updated_at = ?
        WHERE appwrite_user_id = ?
      `).bind(now, now, job.appwrite_user_id),
      env.DB.prepare(`
        UPDATE deletion_jobs SET status = 'COMPLETED', completed_at = ?,
          last_error_code = NULL, version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'EXECUTING'
      `).bind(now, now, job.id),
      env.DB.prepare(`
        UPDATE privacy_requests SET
          status = CASE WHEN request_type = 'ERASURE' THEN 'COMPLETED' ELSE 'CANCELLED' END,
          request_note = CASE
            WHEN request_type = 'ERASURE' THEN 'Account erasure request'
            ELSE 'Closed during account erasure'
          END,
          response_summary = CASE
            WHEN request_type = 'ERASURE' THEN 'Account data erased or anonymised; legally required records retained.'
            ELSE 'Request closed because the account was erased.'
          END,
          decided_at = ?, updated_at = ?
        WHERE appwrite_user_id = ? AND status IN ('PENDING', 'IN_REVIEW')
      `).bind(now, now, job.appwrite_user_id),
      env.DB.prepare(`
        INSERT INTO admin_audit_events (
          id, administrator_appwrite_user_id, action, target_type, target_id,
          previous_state_json, new_state_json, reason, correlation_id, created_at
        ) VALUES (?, 'system:maintenance-jobs', 'ACCOUNT_DELETED', 'USER', ?,
          ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        job.appwrite_user_id,
        JSON.stringify({ accountStatus: "DELETION_PENDING" }),
        JSON.stringify({ accountStatus: "DELETED" }),
        job.request_source === "AUTOMATIC"
          ? "INACTIVE_ACCOUNT_POLICY"
          : `${job.request_source}_REQUEST`,
        job.id,
        now,
      ),
    ]);
    outcome = "COMPLETED";
  }
  return outcome;
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

async function retryUsernameSync(
  env: MaintenanceEnv,
  now: string,
  batchSize: number,
): Promise<void> {
  const profiles = await env.DB.prepare(`
    SELECT appwrite_user_id, display_name
    FROM user_profiles
    WHERE username_sync_status IN ('PENDING', 'FAILED')
      AND account_status NOT IN ('DELETION_PENDING', 'DELETED')
      AND (username_sync_next_retry_at IS NULL OR username_sync_next_retry_at <= ?)
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(now, batchSize).all<{
    appwrite_user_id: string;
    display_name: string;
  }>();
  for (const profile of profiles.results) {
    try {
      await updateAppwriteUserName(
        env.IDENTITY_PROJECTION,
        env.LABEL_SYNC_SERVICE_SECRET,
        profile.appwrite_user_id,
        profile.display_name,
      );
      await env.DB.prepare(`
        UPDATE user_profiles
        SET username_sync_status = 'SYNCED',
          username_sync_attempt_count = username_sync_attempt_count + 1,
          username_sync_next_retry_at = NULL,
          username_sync_last_error_code = NULL,
          version = version + 1,
          updated_at = ?
        WHERE appwrite_user_id = ? AND display_name = ?
      `).bind(now, profile.appwrite_user_id, profile.display_name).run();
    } catch {
      await env.DB.prepare(`
        UPDATE user_profiles
        SET username_sync_status = 'FAILED',
          username_sync_attempt_count = username_sync_attempt_count + 1,
          username_sync_next_retry_at = ?,
          username_sync_last_error_code = 'APPWRITE_NAME_SYNC_FAILED',
          version = version + 1,
          updated_at = ?
        WHERE appwrite_user_id = ? AND display_name = ?
      `).bind(
        new Date(Date.parse(now) + 60 * 60_000).toISOString(),
        now,
        profile.appwrite_user_id,
        profile.display_name,
      ).run();
    }
  }
}

async function retryMembershipActivationEmails(
  env: MaintenanceEnv,
  batchSize: number,
): Promise<void> {
  const entitlements = await env.DB.prepare(`
    SELECT id FROM entitlements
    WHERE activation_email_status IN ('PENDING', 'FAILED')
      AND status = 'ACTIVE'
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(batchSize).all<{ id: string }>();
  for (const entitlement of entitlements.results) {
    await sendMembershipActivationConfirmation(env, entitlement.id);
  }
}

async function sendMembershipRenewalReminders(
  env: MaintenanceEnv,
  now: string,
  batchSize: number,
): Promise<void> {
  const reminderWindowEnd = new Date(Date.parse(now) + 7 * 86_400_000).toISOString();
  const entitlements = await env.DB.prepare(`
    SELECT e.id
    FROM entitlements e
    JOIN user_profiles u ON u.appwrite_user_id = e.appwrite_user_id
    WHERE e.status = 'ACTIVE' AND e.paused_at IS NULL
      AND e.starts_at <= ? AND e.expires_at > ? AND e.expires_at <= ?
      AND e.renewal_reminder_status IN ('PENDING', 'FAILED')
      AND u.account_status = 'ACTIVE' AND u.email_verified = 1
    ORDER BY e.expires_at ASC
    LIMIT ?
  `).bind(now, now, reminderWindowEnd, batchSize).all<{ id: string }>();
  for (const entitlement of entitlements.results) {
    await sendMembershipRenewalReminder(env, entitlement.id);
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
    await cleanupRetiredContentMedia(env, now, batchSize);
    await retryLabelSync(env, now, batchSize);
    await retryUsernameSync(env, now, batchSize);
    await retryMembershipActivationEmails(env, batchSize);
    await sendMembershipRenewalReminders(env, now, batchSize);
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
  async fetch(request: Request, env: MaintenanceEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/process-account-deletion") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "INVALID_JSON" }, { status: 400 });
      }
      const userId = (body as { userId?: unknown } | null)?.userId;
      if (typeof userId !== "string" || !/^[A-Za-z0-9._-]{1,36}$/.test(userId)) {
        return Response.json({ error: "INVALID_USER_ID" }, { status: 400 });
      }
      const status = await processDeletionJobs(
        env,
        isoNow(),
        1,
        parsePositiveInt(env.INACTIVE_ACCOUNT_DAYS, 30, 3650),
        userId,
      );
      return Response.json({ status }, {
        status: status === "COMPLETED" ? 200 : status === "BLOCKED" ? 409 : 202,
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
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
