import type {
  AuthenticatedIdentity,
  ContentItemRow,
  EntitlementRow,
  RegisteredDeviceRow,
  UserProfileRow,
} from "./types";

export function isoNow(): string {
  return new Date().toISOString();
}

export async function upsertUserProjection(
  db: D1Database,
  identity: AuthenticatedIdentity,
  now = isoNow(),
): Promise<void> {
  await db.prepare(`
    INSERT INTO user_profiles (
      appwrite_user_id, email, display_name, email_verified, account_status,
      last_active_at, last_appwrite_access_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(appwrite_user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      email_verified = excluded.email_verified,
      account_status = CASE
        WHEN user_profiles.account_status IN ('RESTRICTED', 'DELETION_PENDING', 'DELETED')
          THEN user_profiles.account_status
        WHEN excluded.email_verified = 1 THEN 'ACTIVE'
        ELSE 'EMAIL_PENDING'
      END,
      last_active_at = excluded.last_active_at,
      last_appwrite_access_at = COALESCE(excluded.last_appwrite_access_at, user_profiles.last_appwrite_access_at),
      version = user_profiles.version + 1,
      updated_at = excluded.updated_at
  `).bind(
    identity.userId,
    identity.email,
    identity.displayName,
    identity.emailVerified ? 1 : 0,
    identity.emailVerified ? "ACTIVE" : "EMAIL_PENDING",
    now,
    identity.appwriteAccessedAt,
    now,
    now,
  ).run();
}

export async function getUserProfile(db: D1Database, userId: string): Promise<UserProfileRow | null> {
  return db.prepare(`
    SELECT appwrite_user_id, email, display_name, email_verified, account_status,
      age_status, jurisdiction_code, last_active_at, last_appwrite_access_at,
      administrative_hold, legal_retention_until, deletion_job_hold, version
    FROM user_profiles
    WHERE appwrite_user_id = ?
  `).bind(userId).first<UserProfileRow>();
}

export async function getActiveEntitlement(
  db: D1Database,
  userId: string,
  now = isoNow(),
): Promise<EntitlementRow | null> {
  return db.prepare(`
    SELECT id, tier, status, starts_at, expires_at
    FROM entitlements
    WHERE appwrite_user_id = ?
      AND status = 'ACTIVE'
      AND starts_at <= ?
      AND expires_at > ?
    ORDER BY CASE tier
      WHEN 'EXCLUSIVE_VIP' THEN 3
      WHEN 'EXCLUSIVE_PREMIUM' THEN 2
      ELSE 1
    END DESC, expires_at DESC
    LIMIT 1
  `).bind(userId, now, now).first<EntitlementRow>();
}

export async function getActiveDeviceCount(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM registered_devices
    WHERE appwrite_user_id = ? AND status = 'ACTIVE'
  `).bind(userId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function getContentItem(db: D1Database, slug: string): Promise<ContentItemRow | null> {
  return db.prepare(`
    SELECT id, slug, content_status, required_tier, jurisdiction_policy, storage_key
    FROM content_items WHERE slug = ?
  `).bind(slug).first<ContentItemRow>();
}

export async function getRegisteredDevice(
  db: D1Database,
  userId: string,
  tokenHash: string,
): Promise<RegisteredDeviceRow | null> {
  return db.prepare(`
    SELECT id, status FROM registered_devices
    WHERE appwrite_user_id = ? AND device_token_hash = ?
  `).bind(userId, tokenHash).first<RegisteredDeviceRow>();
}

export async function touchRegisteredDevice(
  db: D1Database,
  deviceId: string,
  now = isoNow(),
): Promise<void> {
  await db.prepare(`
    UPDATE registered_devices
    SET last_seen_at = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND status = 'ACTIVE'
  `).bind(now, now, deviceId).run();
}

export async function createAuditEvent(
  db: D1Database,
  values: {
    administratorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    previousState: unknown;
    newState: unknown;
    reason: string;
    correlationId: string;
    now?: string;
  },
): Promise<void> {
  await db.prepare(`
    INSERT INTO admin_audit_events (
      id, administrator_appwrite_user_id, action, target_type, target_id,
      previous_state_json, new_state_json, reason, correlation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    values.administratorUserId,
    values.action,
    values.targetType,
    values.targetId,
    values.previousState == null ? null : JSON.stringify(values.previousState),
    values.newState == null ? null : JSON.stringify(values.newState),
    values.reason,
    values.correlationId,
    values.now ?? isoNow(),
  ).run();
}
