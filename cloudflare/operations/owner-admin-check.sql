-- Read-only verification. Returns booleans/counts, never credentials or PII.
SELECT
  (SELECT count(*) FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id = a.user_id
    WHERE a.email = 'business@jason-shadow.com' COLLATE NOCASE
      AND p.email = 'business@jason-shadow.com' COLLATE NOCASE
      AND p.email_verified = 1 AND p.account_status = 'ACTIVE'
      AND p.administrative_hold = 0 AND p.deletion_job_hold = 0) AS matching_verified_active_accounts,
  (SELECT count(*) FROM auth_accounts WHERE email = 'business@jason-shadow.com' COLLATE NOCASE
    AND role = 'ADMIN' AND mfa_required = 1) AS owner_admin_with_mfa_required,
  (SELECT count(*) FROM auth_sessions s JOIN auth_accounts a ON a.user_id = s.user_id
    WHERE a.email = 'business@jason-shadow.com' COLLATE NOCASE
      AND s.revoked_at IS NULL AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS unrevoked_auth_sessions,
  (SELECT count(*) FROM admin_sessions s JOIN auth_accounts a ON a.user_id = s.administrator_appwrite_user_id
    WHERE a.email = 'business@jason-shadow.com' COLLATE NOCASE
      AND s.revoked_at IS NULL AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS unrevoked_admin_sessions,
  (SELECT count(*) FROM admin_audit_events WHERE id = 'owner-admin-business-2026-10-30') AS operation_recorded;
