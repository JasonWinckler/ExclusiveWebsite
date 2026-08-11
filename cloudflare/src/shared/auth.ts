import { ApiError } from "./http";
import { sha256Hex } from "./security";
import type {
  AuthenticatedIdentity,
  BaseEnv,
} from "./types";

export const AUTH_COOKIE_NAME = "__Host-shadow_session";

function sessionToken(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  return null;
}

interface CloudflareIdentityRow {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  email_verified: number;
  account_status: string;
  age_status: string;
  role: "USER" | "ADMIN";
  mfa_enabled: number;
  last_seen_at: string;
}

async function authenticateSession(
  request: Request,
  env: BaseEnv,
): Promise<AuthenticatedIdentity | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.user_id, s.last_seen_at,
      a.email, a.role, a.mfa_enabled,
      p.display_name, p.email_verified, p.account_status, p.age_status
    FROM auth_sessions s
    JOIN auth_accounts a ON a.user_id = s.user_id
    JOIN user_profiles p ON p.appwrite_user_id = s.user_id
    WHERE s.token_sha256 = ? AND s.state = 'ACTIVE'
      AND s.revoked_at IS NULL AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first<CloudflareIdentityRow>();
  if (!row) throw new ApiError(401, "INVALID_OR_EXPIRED_IDENTITY");
  if (row.account_status === "RESTRICTED") throw new ApiError(403, "ACCOUNT_RESTRICTED");
  if (row.account_status === "DELETION_PENDING" || row.account_status === "DELETED") {
    throw new ApiError(403, "ACCOUNT_DELETION_PENDING");
  }

  const labels: string[] = [];
  if (row.role === "ADMIN") labels.push("admin");
  if (row.age_status === "APPROVED") labels.push("age_verified");
  const entitlement = await env.DB.prepare(`
    SELECT tier FROM entitlements
    WHERE appwrite_user_id = ? AND status = 'ACTIVE' AND expires_at > ?
    ORDER BY CASE tier
      WHEN 'EXCLUSIVE_VIP' THEN 3
      WHEN 'EXCLUSIVE_PREMIUM' THEN 2
      ELSE 1 END DESC, expires_at DESC
    LIMIT 1
  `).bind(row.user_id, now).first<{ tier: string }>();
  if (entitlement?.tier === "EXCLUSIVE_VIP") labels.push("active_vip");
  else if (entitlement?.tier === "EXCLUSIVE_PREMIUM") labels.push("active_premium");
  else if (entitlement?.tier === "EXCLUSIVE_BASIC") labels.push("active_basic");

  if (Date.parse(row.last_seen_at) < Date.now() - 300_000) {
    await env.DB.prepare(`
      UPDATE auth_sessions SET last_seen_at = ?
      WHERE id = ? AND last_seen_at = ?
    `).bind(now, row.session_id, row.last_seen_at).run();
  }
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: row.email_verified === 1,
    mfaEnabled: row.mfa_enabled === 1,
    labels: Object.freeze(labels),
    lastAccessedAt: null,
  };
}

export async function authenticateUser(
  request: Request,
  env: BaseEnv,
  options: { requireVerifiedEmail?: boolean } = {},
): Promise<AuthenticatedIdentity> {
  const identity = await authenticateSession(request, env);
  if (!identity) throw new ApiError(401, "AUTHENTICATION_REQUIRED");
  if (options.requireVerifiedEmail && !identity.emailVerified) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED");
  }
  return identity;
}

export async function authenticateAdministrator(
  request: Request,
  env: BaseEnv,
  adminLabel: string,
): Promise<AuthenticatedIdentity> {
  const identity = await authenticateUser(request, env, { requireVerifiedEmail: true });
  if (!identity.labels.includes(adminLabel)) {
    throw new ApiError(403, "ADMINISTRATOR_REQUIRED");
  }
  if (!identity.mfaEnabled) {
    throw new ApiError(403, "ADMIN_MFA_REQUIRED");
  }
  return identity;
}
