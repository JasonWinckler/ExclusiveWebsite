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
  const activityCutoff = new Date(Date.parse(now) - 15 * 60_000).toISOString();
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
    WHERE
      user_profiles.email <> excluded.email
      OR user_profiles.display_name <> excluded.display_name
      OR user_profiles.email_verified <> excluded.email_verified
      OR (
        user_profiles.account_status NOT IN ('RESTRICTED', 'DELETION_PENDING', 'DELETED')
        AND user_profiles.account_status <> CASE
          WHEN excluded.email_verified = 1 THEN 'ACTIVE'
          ELSE 'EMAIL_PENDING'
        END
      )
      OR user_profiles.last_active_at IS NULL
      OR user_profiles.last_active_at < ?
      OR (
        excluded.last_appwrite_access_at IS NOT NULL
        AND COALESCE(user_profiles.last_appwrite_access_at, '') <> excluded.last_appwrite_access_at
      )
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
    activityCutoff,
  ).run();
}

export async function getUserProfile(db: D1Database, userId: string): Promise<UserProfileRow | null> {
  return db.prepare(`
    SELECT appwrite_user_id, email, display_name, email_verified, account_status,
      age_status, jurisdiction_code, country_code, region_code, privacy_regime,
      privacy_notice_version, privacy_notice_acknowledged_at,
      marketing_opt_out, sale_share_opt_out, targeted_ads_opt_out,
      profiling_opt_out, sensitive_data_limit, privacy_choices_updated_at,
      last_active_at, last_appwrite_access_at,
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
    SELECT id, slug, content_status, required_tier, jurisdiction_policy
    FROM content_items WHERE slug = ?
  `).bind(slug).first<ContentItemRow>();
}

export async function getRegisteredDevice(
  db: D1Database,
  userId: string,
  tokenHash: string,
): Promise<RegisteredDeviceRow | null> {
  return db.prepare(`
    SELECT id, status, last_seen_at FROM registered_devices
    WHERE appwrite_user_id = ? AND device_token_hash = ?
  `).bind(userId, tokenHash).first<RegisteredDeviceRow>();
}

export async function touchRegisteredDevice(
  db: D1Database,
  deviceId: string,
  lastSeenAt: string | null,
  now = isoNow(),
): Promise<boolean> {
  const lastSeen = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
  if (Number.isFinite(lastSeen) && Date.parse(now) - lastSeen < 15 * 60_000) return false;
  const result = await db.prepare(`
    UPDATE registered_devices
    SET last_seen_at = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND status = 'ACTIVE' AND last_seen_at < ?
  `).bind(now, now, deviceId, new Date(Date.parse(now) - 15 * 60_000).toISOString()).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function getAccessContext(
  db: D1Database,
  userId: string,
  tokenHash: string,
  now = isoNow(),
): Promise<{
  profile: UserProfileRow | null;
  entitlement: EntitlementRow | null;
  device: RegisteredDeviceRow | null;
  activeDeviceCount: number;
}> {
  const row = await db.prepare(`
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
      e.id AS entitlement_id, e.tier AS entitlement_tier,
      e.status AS entitlement_status, e.starts_at AS entitlement_starts_at,
      e.expires_at AS entitlement_expires_at,
      d.id AS device_id, d.status AS device_status, d.last_seen_at AS device_last_seen_at,
      COALESCE(dc.active_count, 0) AS active_device_count
    FROM user_profiles p
    LEFT JOIN active_entitlement e ON 1 = 1
    LEFT JOIN current_device d ON 1 = 1
    LEFT JOIN device_count dc ON 1 = 1
    WHERE p.appwrite_user_id = ?
  `).bind(userId, now, now, userId, tokenHash, userId, userId).first<{
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
    entitlement_id: string | null;
    entitlement_tier: EntitlementRow["tier"] | null;
    entitlement_status: EntitlementRow["status"] | null;
    entitlement_starts_at: string | null;
    entitlement_expires_at: string | null;
    device_id: string | null;
    device_status: RegisteredDeviceRow["status"] | null;
    device_last_seen_at: string | null;
    active_device_count: number;
  }>();
  if (!row) return { profile: null, entitlement: null, device: null, activeDeviceCount: 0 };
  return {
    profile: {
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
    },
    entitlement: row.entitlement_id && row.entitlement_tier && row.entitlement_status &&
      row.entitlement_starts_at && row.entitlement_expires_at ? {
        id: row.entitlement_id,
        tier: row.entitlement_tier,
        status: row.entitlement_status,
        starts_at: row.entitlement_starts_at,
        expires_at: row.entitlement_expires_at,
      } : null,
    device: row.device_id && row.device_status && row.device_last_seen_at ? {
      id: row.device_id,
      status: row.device_status,
      last_seen_at: row.device_last_seen_at,
    } : null,
    activeDeviceCount: Number(row.active_device_count),
  };
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
