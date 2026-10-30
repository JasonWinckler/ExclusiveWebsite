-- One-time, explicitly authorized owner role assignment. Not a migration.
-- Only the audit INSERT below mutates application data. Its triggers perform
-- every role/session change atomically with that single SQLite statement.
-- No password, MFA secret, profile, order or entitlement is changed.
PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS owner_admin_business_guard;
DROP TRIGGER IF EXISTS owner_admin_business_apply;

CREATE TRIGGER owner_admin_business_guard
BEFORE INSERT ON admin_audit_events
WHEN NEW.id = 'owner-admin-business-2026-10-30'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM admin_audit_events WHERE id = 'owner-admin-business-2026-10-30'
  ) THEN 1 ELSE RAISE(ABORT, 'OWNER_ADMIN_ALREADY_APPLIED') END;
  SELECT CASE WHEN (
    SELECT count(*) FROM auth_accounts
    WHERE email = 'business@jason-shadow.com' COLLATE NOCASE
  ) = 1 THEN 1 ELSE RAISE(ABORT, 'OWNER_ADMIN_EXPECTS_ONE_AUTH_ACCOUNT') END;
  SELECT CASE WHEN (
    SELECT count(*) FROM user_profiles
    WHERE email = 'business@jason-shadow.com' COLLATE NOCASE
  ) = 1 THEN 1 ELSE RAISE(ABORT, 'OWNER_ADMIN_EXPECTS_ONE_PROFILE') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id = a.user_id
    WHERE a.email = 'business@jason-shadow.com' COLLATE NOCASE
      AND p.email = 'business@jason-shadow.com' COLLATE NOCASE
      AND a.user_id = NEW.subject_appwrite_user_id
      AND a.user_id = NEW.target_id
      AND a.role IN ('USER', 'ADMIN')
  ) THEN 1 ELSE RAISE(ABORT, 'OWNER_ADMIN_AUTH_PROFILE_MISMATCH') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM user_profiles p WHERE p.appwrite_user_id = NEW.target_id
      AND p.email_verified = 1 AND p.account_status = 'ACTIVE'
      AND p.administrative_hold = 0 AND p.deletion_job_hold = 0
  ) THEN 1 ELSE RAISE(ABORT, 'OWNER_ADMIN_REQUIRES_VERIFIED_ACTIVE_UNHELD_ACCOUNT') END;
END;

CREATE TRIGGER owner_admin_business_apply
AFTER INSERT ON admin_audit_events
WHEN NEW.id = 'owner-admin-business-2026-10-30'
BEGIN
  UPDATE auth_accounts SET role = 'ADMIN', mfa_required = 1, updated_at = NEW.created_at
  WHERE user_id = NEW.target_id;
  UPDATE auth_sessions SET revoked_at = NEW.created_at,
    revoked_reason = 'OWNER_ADMIN_ROLE_ASSIGNMENT'
  WHERE user_id = NEW.target_id AND revoked_at IS NULL;
  UPDATE admin_sessions SET revoked_at = NEW.created_at
  WHERE administrator_appwrite_user_id = NEW.target_id AND revoked_at IS NULL;
END;

INSERT INTO admin_audit_events (
  id, administrator_appwrite_user_id, action, target_type, target_id,
  subject_appwrite_user_id, previous_state_json, new_state_json, reason,
  correlation_id, created_at
) VALUES (
  'owner-admin-business-2026-10-30', 'operator:owner-authorized-d1',
  'OWNER_ADMIN_ASSIGNED', 'USER',
  COALESCE((SELECT user_id FROM auth_accounts
    WHERE email = 'business@jason-shadow.com' COLLATE NOCASE), ''),
  COALESCE((SELECT user_id FROM auth_accounts
    WHERE email = 'business@jason-shadow.com' COLLATE NOCASE), ''),
  (SELECT json_object('role', role, 'mfaRequired', mfa_required)
    FROM auth_accounts WHERE email = 'business@jason-shadow.com' COLLATE NOCASE),
  '{"role":"ADMIN","mfaRequired":1,"existingSessionsRevoked":true}',
  'One-time owner-authorized role assignment to the existing verified business account; credentials and profile retained.',
  'owner-admin-business-2026-10-30', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

DROP TRIGGER owner_admin_business_apply;
DROP TRIGGER owner_admin_business_guard;
