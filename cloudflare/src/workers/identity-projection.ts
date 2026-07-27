import {
  ApiError,
  errorResponse,
  jsonResponse,
  parsePositiveInt,
  readJsonBody,
  readJsonResponse,
} from "../shared/http";
import { secretsEqual } from "../shared/security";
import type { IdentityProjectionEnv } from "../shared/types";

const AGE_LABELS = new Set(["age_pending", "age_verified", "age_rejected"]);
const ACCESS_LABELS = new Set(["active_basic", "active_premium", "active_vip"]);

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
  const body = await readJsonBody<Record<string, unknown>>(request, 4096);
  const path = new URL(request.url).pathname;
  const labelServicePath = path === "/sync-labels" ||
    path === "/update-user-status" ||
    path === "/verify-user-email" ||
    path === "/update-user-password" ||
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
    await appwriteRequest(env, "/messaging/messages/email", {
      method: "POST",
      body: JSON.stringify({
        messageId: body.messageId,
        subject: body.subject,
        content: body.html,
        users: [body.userId],
        topics: [],
        targets: [],
        cc: [],
        bcc: [],
        attachments: [],
        draft: false,
        html: true,
      }),
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
