import { upsertUserProjection } from "./db";
import { ApiError, parsePositiveInt, readJsonResponse } from "./http";
import { sha256Hex } from "./security";
import type {
  AppwriteUser,
  AuthenticatedIdentity,
  BaseEnv,
} from "./types";

function extractBearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match?.[1] || match[1].length > 8192) {
    throw new ApiError(401, "VALID_BEARER_TOKEN_REQUIRED");
  }
  return match[1];
}

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

function secureAppwriteEndpoint(raw: string | undefined): string {
  let endpoint: URL;
  try {
    endpoint = new URL(raw ?? "");
  } catch {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }
  if (endpoint.protocol !== "https:") {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }
  return endpoint.toString().replace(/\/$/, "");
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

async function authenticateCloudflareSession(
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
    appwriteAccessedAt: null,
  };
}

function trustedIso(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeFetchError(error: unknown): { errorName: string; errorMessage: string } {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errorMessage = rawMessage
    .replace(/[A-Za-z0-9._~-]{32,}/g, "[redacted]")
    .slice(0, 256);
  return { errorName, errorMessage };
}

export async function authenticateUser(
  request: Request,
  env: BaseEnv,
  options: { requireVerifiedEmail?: boolean; projectUser?: boolean } = {},
): Promise<AuthenticatedIdentity> {
  const cloudflareIdentity = await authenticateCloudflareSession(request, env);
  if (cloudflareIdentity) {
    if (options.requireVerifiedEmail && !cloudflareIdentity.emailVerified) {
      throw new ApiError(403, "EMAIL_NOT_VERIFIED");
    }
    return cloudflareIdentity;
  }
  if ((env.AUTH_MODE ?? "DUAL").toUpperCase() === "CLOUDFLARE_ONLY") {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED");
  }
  const token = extractBearerToken(request);
  if (!env.APPWRITE_PROJECT_ID?.trim()) {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }

  let response: Response;
  try {
    response = await fetch(`${secureAppwriteEndpoint(env.APPWRITE_ENDPOINT)}/account`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
        "X-Appwrite-JWT": token,
        "X-Appwrite-Response-Format": "1.9.5",
      },
      redirect: "manual",
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "appwrite_identity_fetch_failed",
      ...safeFetchError(error),
    }));
    throw new ApiError(503, "IDENTITY_PROVIDER_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, "INVALID_OR_EXPIRED_IDENTITY");
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      event: "appwrite_identity_upstream_rejected",
      status: response.status,
      statusText: response.statusText.slice(0, 64),
    }));
    throw new ApiError(503, "IDENTITY_PROVIDER_UNAVAILABLE");
  }

  const user = await readJsonResponse<AppwriteUser>(
    response,
    parsePositiveInt(env.MAX_UPSTREAM_JSON_BYTES, 65_536, 262_144),
    "INVALID_IDENTITY_PROVIDER_RESPONSE",
  );
  if (
    !user.$id ||
    !user.email ||
    user.status !== true ||
    !Array.isArray(user.labels)
  ) {
    throw new ApiError(401, "ANONYMOUS_OR_DISABLED_IDENTITY");
  }

  const identity: AuthenticatedIdentity = {
    userId: user.$id,
    email: user.email,
    displayName: user.name || "",
    emailVerified: user.emailVerification === true,
    mfaEnabled: user.mfa === true,
    labels: Object.freeze([...user.labels]),
    appwriteAccessedAt: trustedIso(user.accessedAt),
  };

  if (options.projectUser !== false) {
    try {
      await upsertUserProjection(env.DB, identity);
    } catch {
      throw new ApiError(503, "MEMBERSHIP_DATABASE_UNAVAILABLE");
    }
  }

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
