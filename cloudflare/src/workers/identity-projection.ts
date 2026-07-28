import {
  ApiError,
  errorResponse,
  jsonResponse,
  logEvent,
  parsePositiveInt,
  readJsonBody,
  readJsonResponse,
} from "../shared/http";
import { secretsEqual } from "../shared/security";
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

function appwriteBaseUrl(raw: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
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
  if (!response.ok && response.status !== 204) {
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
  const userResponse = await appwriteRequest(env, `/users/${encodeURIComponent(input.userId)}`);
  const user = await readJsonResponse<{ labels?: unknown }>(
    userResponse,
    parsePositiveInt(env.MAX_UPSTREAM_JSON_BYTES, 65_536, 262_144),
    "APPWRITE_INVALID_RESPONSE",
  );
  if (!Array.isArray(user.labels) || !user.labels.every((label) => typeof label === "string")) {
    throw new ApiError(503, "APPWRITE_INVALID_RESPONSE");
  }
  const nextLabels = user.labels.filter((label) => !vocabulary.has(label));
  if (typeof input.desiredLabel === "string") nextLabels.push(input.desiredLabel);
  await appwriteRequest(env, `/users/${encodeURIComponent(input.userId)}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels: nextLabels }),
  });
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
    path === "/send-transactional-email";
  const expectedSecret = labelServicePath
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
    await appwriteRequest(env, `/users/${encodedUserId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: body.status }),
    });
    return jsonResponse({ ok: true });
  }
  if (path === "/verify-user-email") {
    await appwriteRequest(env, `/users/${encodedUserId}/verification`, {
      method: "PATCH",
      body: JSON.stringify({ emailVerification: true }),
    });
    return jsonResponse({ ok: true });
  }
  if (path === "/update-user-password") {
    if (
      typeof body.password !== "string" ||
      body.password.length < 8 ||
      body.password.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(body.password)
    ) throw new ApiError(400, "INVALID_PASSWORD");
    await appwriteRequest(env, `/users/${encodedUserId}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: body.password }),
    });
    await appwriteRequest(env, `/users/${encodedUserId}/sessions`, { method: "DELETE" });
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
    await appwriteRequest(env, `/users/${encodedUserId}/name`, {
      method: "PATCH",
      body: JSON.stringify({ name: body.name }),
    });
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
    const userResponse = await appwriteRequest(env, `/users/${encodedUserId}`);
    const user = await readJsonResponse<{ email?: unknown; name?: unknown }>(
      userResponse,
      parsePositiveInt(env.MAX_UPSTREAM_JSON_BYTES, 65_536, 262_144),
      "APPWRITE_INVALID_RESPONSE",
    );
    if (typeof user.email !== "string") throw new ApiError(503, "APPWRITE_INVALID_RESPONSE");
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
    await appwriteRequest(env, `/users/${encodedUserId}/sessions`, { method: "DELETE" });
    return jsonResponse({ ok: true });
  }
  if (path === "/delete-user") {
    await appwriteRequest(env, `/users/${encodedUserId}/sessions`, { method: "DELETE" });
    await appwriteRequest(env, `/users/${encodedUserId}`, { method: "DELETE" });
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
