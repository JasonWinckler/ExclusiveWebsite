import {
  ApiError,
  errorResponse,
  jsonResponse,
  logEvent,
  parsePositiveInt,
  readJsonBody,
  readJsonResponse,
} from "../shared/http";
import { hashPassword, secretsEqual } from "../shared/security";
import { sendMicrosoftGraphEmail } from "../shared/microsoft-graph";
import type { IdentityProjectionEnv } from "../shared/types";

const AGE_LABELS = new Set(["age_pending", "age_verified", "age_rejected"]);
const ACCESS_LABELS = new Set(["active_basic", "active_premium", "active_vip"]);
const EMAIL_BRAND_CONTENT_ID = "shadow-brand-banner";
const EMAIL_BRAND_MAX_BYTES = 524_288;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

async function emailBrandImage(env: IdentityProjectionEnv): Promise<{
  contentType: "image/png";
  name: string;
  contentId: string;
  contentBytes: string;
}> {
  let response: Response;
  try {
    response = await env.EMAIL_ASSETS.fetch(
      new Request("https://email-assets.internal/banner.png"),
    );
  } catch {
    throw new ApiError(503, "EMAIL_BRAND_ASSET_UNAVAILABLE");
  }
  if (!response.ok || response.headers.get("Content-Type")?.split(";")[0] !== "image/png") {
    throw new ApiError(503, "EMAIL_BRAND_ASSET_INVALID");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > EMAIL_BRAND_MAX_BYTES) {
    throw new ApiError(503, "EMAIL_BRAND_ASSET_INVALID");
  }
  return {
    contentType: "image/png",
    name: "shadows-temptation-banner.png",
    contentId: EMAIL_BRAND_CONTENT_ID,
    contentBytes: bytesToBase64(bytes),
  };
}

function appwriteBaseUrl(raw: string | undefined): string {
  let endpoint: URL;
  try {
    endpoint = new URL(raw ?? "");
  } catch {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }
  if (endpoint.protocol !== "https:") throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  return endpoint.toString().replace(/\/$/, "");
}

async function appwriteRequest(
  env: IdentityProjectionEnv,
  path: string,
  init: RequestInit = {},
  acceptedStatuses: readonly number[] = [],
): Promise<Response> {
  if (!env.APPWRITE_PROJECT_ID || !env.APPWRITE_SERVER_API_KEY) {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }
  let response: Response;
  try {
    response = await fetch(`${appwriteBaseUrl(env.APPWRITE_ENDPOINT)}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Appwrite-Key": env.APPWRITE_SERVER_API_KEY,
        "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
        "X-Appwrite-Response-Format": "1.9.5",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(503, "APPWRITE_UNAVAILABLE");
  }
  if (!response.ok && response.status !== 204 && !acceptedStatuses.includes(response.status)) {
    throw new ApiError(503, "APPWRITE_OPERATION_FAILED");
  }
  return response;
}

async function syncLabels(
  env: IdentityProjectionEnv,
  input: { userId?: unknown; category?: unknown; desiredLabel?: unknown },
): Promise<void> {
  if (typeof input.userId !== "string" || !/^[A-Za-z0-9._-]{1,36}$/.test(input.userId)) {
    throw new ApiError(400, "INVALID_USER_ID");
  }
  if (input.category !== "AGE" && input.category !== "ACCESS") {
    throw new ApiError(400, "INVALID_LABEL_CATEGORY");
  }
  const vocabulary = input.category === "AGE" ? AGE_LABELS : ACCESS_LABELS;
  if (input.desiredLabel !== null && (
    typeof input.desiredLabel !== "string" ||
    !vocabulary.has(input.desiredLabel)
  )) {
    throw new ApiError(400, "INVALID_LABEL");
  }
  // Access and age state are authoritative D1 records. Labels are derived when
  // a session is authenticated, so no external identity write is necessary.
  const exists = await env.DB.prepare(`SELECT 1 AS found FROM user_profiles WHERE appwrite_user_id = ?`)
    .bind(input.userId).first<{ found: number }>();
  if (!exists) throw new ApiError(404, "USER_NOT_FOUND");
}

async function handleRequest(request: Request, env: IdentityProjectionEnv): Promise<Response> {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED");
  const path = new URL(request.url).pathname;
  const body = await readJsonBody<Record<string, unknown>>(
    request,
    path === "/send-transactional-email" ? 196_608 : 4096,
  );
  const labelServicePath = path === "/sync-labels" ||
    path === "/update-user-status" ||
    path === "/verify-user-email" ||
    path === "/update-user-password" ||
    path === "/update-user-name" ||
    path === "/list-sessions" ||
    path === "/delete-session" ||
    path === "/send-transactional-email";
  const expectedSecret = path === "/send-transactional-email" && env.AUTH_EMAIL_SERVICE_SECRET
    ? env.AUTH_EMAIL_SERVICE_SECRET
    : labelServicePath
    ? env.LABEL_SYNC_SERVICE_SECRET
    : env.ACCOUNT_LIFECYCLE_SERVICE_SECRET;
  if (!await secretsEqual(
    expectedSecret,
    request.headers.get("X-Internal-Service-Secret") ?? "",
  )) {
    throw new ApiError(403, "INTERNAL_SERVICE_AUTH_REQUIRED");
  }

  if (path === "/sync-labels") {
    await syncLabels(env, body);
    return jsonResponse({ ok: true });
  }

  if (typeof body.userId !== "string" || !/^[A-Za-z0-9._-]{1,36}$/.test(body.userId)) {
    throw new ApiError(400, "INVALID_USER_ID");
  }
  const encodedUserId = encodeURIComponent(body.userId);
  if (path === "/update-user-status") {
    if (typeof body.status !== "boolean") throw new ApiError(400, "INVALID_USER_STATUS");
    if (!body.status) {
      await env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'ACCOUNT_STATUS'
        WHERE user_id = ? AND revoked_at IS NULL`).bind(new Date().toISOString(), body.userId).run();
    }
    return jsonResponse({ ok: true });
  }
  if (path === "/verify-user-email") {
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE user_profiles SET email_verified = 1,
      account_status = CASE WHEN account_status = 'EMAIL_PENDING' THEN 'ACTIVE' ELSE account_status END,
      version = version + 1, updated_at = ? WHERE appwrite_user_id = ?`)
      .bind(now, body.userId).run();
    return jsonResponse({ ok: true });
  }
  if (path === "/update-user-password") {
    if (
      typeof body.password !== "string" ||
      body.password.length < 6 ||
      body.password.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(body.password)
    ) throw new ApiError(400, "INVALID_PASSWORD");
    const password = await hashPassword(body.password);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE auth_accounts SET password_hash = ?, password_salt = ?,
        password_iterations = ?, migration_required = 0, password_changed_at = ?, updated_at = ?
        WHERE user_id = ?`).bind(password.hash, password.salt, password.iterations, now, now, body.userId),
      env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'PASSWORD_CHANGED'
        WHERE user_id = ? AND revoked_at IS NULL`).bind(now, body.userId),
    ]);
    return jsonResponse({ ok: true });
  }
  if (path === "/update-user-name") {
    if (
      typeof body.name !== "string" ||
      body.name.length < 2 ||
      body.name.length > 64 ||
      /[\u0000-\u001f\u007f]/.test(body.name) ||
      !/[\p{L}\p{N}]/u.test(body.name)
    ) throw new ApiError(400, "INVALID_DISPLAY_NAME");
    await env.DB.prepare(`UPDATE user_profiles SET display_name = ?, version = version + 1,
      updated_at = ? WHERE appwrite_user_id = ?`)
      .bind(body.name, new Date().toISOString(), body.userId).run();
    return jsonResponse({ ok: true });
  }
  if (path === "/send-transactional-email") {
    if (
      typeof body.messageId !== "string" ||
      !/^[A-Za-z0-9._-]{1,36}$/.test(body.messageId) ||
      typeof body.subject !== "string" ||
      body.subject.length < 1 ||
      body.subject.length > 255 ||
      typeof body.html !== "string" ||
      body.html.length < 1 ||
      body.html.length > 131_072
    ) throw new ApiError(400, "INVALID_TRANSACTIONAL_EMAIL");
    const user = await env.DB.prepare(`SELECT email, display_name AS name FROM user_profiles
      WHERE appwrite_user_id = ? AND account_status <> 'DELETED'`)
      .bind(body.userId).first<{ email: string; name: string }>();
    if (!user?.email) throw new ApiError(404, "USER_NOT_FOUND");
    const deliveryStartedAt = Date.now();
    await sendMicrosoftGraphEmail({
      tenantId: env.GRAPH_TENANT_ID,
      clientId: env.GRAPH_CLIENT_ID,
      clientSecret: env.GRAPH_CLIENT_SECRET,
      senderMailbox: env.GRAPH_SENDER_MAILBOX,
      recipientEmail: user.email,
      recipientName: typeof user.name === "string" ? user.name : undefined,
      messageId: body.messageId,
      subject: body.subject,
      html: body.html,
      inlineImage: await emailBrandImage(env),
    });
    logEvent("info", "transactional_email_accepted", {
      requestId: body.messageId,
      provider: "MICROSOFT_GRAPH",
      elapsedMs: Date.now() - deliveryStartedAt,
    });
    return jsonResponse({ ok: true });
  }
  if (path === "/revoke-sessions") {
    await env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'REVOKED'
      WHERE user_id = ? AND revoked_at IS NULL`).bind(new Date().toISOString(), body.userId).run();
    return jsonResponse({ ok: true });
  }
  if (path === "/list-sessions") {
    const payload = await env.DB.prepare(`SELECT id, created_at, last_seen_at, expires_at,
      user_agent_label FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL
      AND state = 'ACTIVE' AND expires_at > ? ORDER BY last_seen_at DESC LIMIT 20`)
      .bind(body.userId, new Date().toISOString()).all<Record<string, unknown>>();
    return jsonResponse({
      sessions: (payload.results ?? []).map((session) => {
        const value = session as Record<string, unknown>;
        return {
          id: value.id,
          createdAt: value.created_at,
          updatedAt: value.last_seen_at,
          expire: value.expires_at,
          current: false,
          clientName: value.user_agent_label,
        };
      }),
    });
  }
  if (path === "/delete-session") {
    if (typeof body.sessionId !== "string" || !/^[A-Za-z0-9._-]{1,36}$/.test(body.sessionId)) {
      throw new ApiError(400, "INVALID_SESSION_ID");
    }
    await env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'DEVICE_REVOKED'
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
      .bind(new Date().toISOString(), body.sessionId, body.userId).run();
    return jsonResponse({ ok: true });
  }
  if (path === "/delete-user") {
    await env.DB.prepare(`DELETE FROM auth_accounts WHERE user_id = ?`).bind(body.userId).run();
    return jsonResponse({ ok: true });
  }
  throw new ApiError(404, "NOT_FOUND");
}

export default {
  async fetch(request: Request, env: IdentityProjectionEnv): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<IdentityProjectionEnv>;
