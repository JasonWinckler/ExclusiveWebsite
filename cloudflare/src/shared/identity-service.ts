import { ApiError, logEvent, readJsonResponse } from "./http";

const mailDiagnosticCodes = new Set([
  "INTERNAL_SERVICE_AUTH_REQUIRED", "INVALID_TRANSACTIONAL_EMAIL", "USER_NOT_FOUND",
  "EMAIL_BRAND_ASSET_UNAVAILABLE", "EMAIL_BRAND_ASSET_INVALID",
  "GRAPH_EMAIL_NOT_CONFIGURED", "GRAPH_EMAIL_RECIPIENT_INVALID", "GRAPH_EMAIL_INLINE_IMAGE_INVALID",
  "GRAPH_EMAIL_AUTH_UNAVAILABLE", "GRAPH_EMAIL_AUTH_FAILED", "GRAPH_EMAIL_AUTH_INVALID_RESPONSE",
  "GRAPH_EMAIL_DELIVERY_UNAVAILABLE", "GRAPH_EMAIL_DELIVERY_FAILED",
]);

async function logMailServiceFailure(response: Response, body: unknown): Promise<void> {
  let diagnosticCode = "IDENTITY_PROJECTION_FAILED";
  try {
    const payload = await readJsonResponse<{ error?: { code?: unknown } }>(response, 4096);
    const code = payload.error?.code;
    if (typeof code === "string" && mailDiagnosticCodes.has(code)) diagnosticCode = code;
  } catch {
    // Never log an upstream body, description or arbitrary error string.
  }
  const reference = response.headers.get("X-Request-Id");
  const messageId = body && typeof body === "object" && "messageId" in body ? body.messageId : null;
  logEvent("error", "transactional_email_service_failed", {
    code: diagnosticCode,
    upstreamStatus: response.status,
    serviceReference: reference && /^[A-Za-z0-9._:-]{1,64}$/.test(reference) ? reference : null,
    messageId: typeof messageId === "string" && /^[A-Za-z0-9._-]{1,36}$/.test(messageId) ? messageId : null,
  });
}

async function callIdentityService(
  service: Service,
  secret: string,
  path: string,
  body: unknown,
): Promise<void> {
  let response: Response;
  try {
    response = await service.fetch(`https://identity.internal${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Secret": secret,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(503, "IDENTITY_PROJECTION_UNAVAILABLE");
  }
  if (!response.ok) {
    if (path === "/send-transactional-email") await logMailServiceFailure(response, body);
    throw new ApiError(503, "IDENTITY_PROJECTION_FAILED");
  }
}

async function callIdentityServiceJson<T>(
  service: Service,
  secret: string,
  path: string,
  body: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await service.fetch(`https://identity.internal${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Secret": secret,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(503, "IDENTITY_PROJECTION_UNAVAILABLE");
  }
  if (!response.ok) throw new ApiError(503, "IDENTITY_PROJECTION_FAILED");
  try {
    return await response.json<T>();
  } catch {
    throw new ApiError(503, "IDENTITY_PROJECTION_FAILED");
  }
}

export function syncIdentityLabel(
  service: Service,
  secret: string,
  input: {
    userId: string;
    category: "AGE" | "ACCESS";
    desiredLabel: string | null;
  },
): Promise<void> {
  return callIdentityService(service, secret, "/sync-labels", input);
}

export function deleteIdentityUser(
  service: Service,
  secret: string,
  userId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/delete-user", { userId });
}

export function revokeIdentitySessions(
  service: Service,
  secret: string,
  userId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/revoke-sessions", { userId });
}

export function listIdentitySessions(
  service: Service,
  secret: string,
  userId: string,
): Promise<{ sessions: Record<string, unknown>[] }> {
  return callIdentityServiceJson(service, secret, "/list-sessions", { userId });
}

export function deleteIdentitySession(
  service: Service,
  secret: string,
  userId: string,
  sessionId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/delete-session", { userId, sessionId });
}

export function updateIdentityUserStatus(
  service: Service,
  secret: string,
  userId: string,
  status: boolean,
): Promise<void> {
  return callIdentityService(service, secret, "/update-user-status", { userId, status });
}

export function verifyIdentityUserEmail(
  service: Service,
  secret: string,
  userId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/verify-user-email", { userId });
}

export function updateIdentityUserPassword(
  service: Service,
  secret: string,
  userId: string,
  password: string,
): Promise<void> {
  return callIdentityService(service, secret, "/update-user-password", { userId, password });
}

export function updateIdentityUserName(
  service: Service,
  secret: string,
  userId: string,
  name: string,
): Promise<void> {
  return callIdentityService(service, secret, "/update-user-name", { userId, name });
}

export function sendTransactionalEmail(
  service: Service,
  secret: string,
  input: {
    userId: string;
    messageId: string;
    subject: string;
    html: string;
    emailChangeTokenId?: string;
  },
): Promise<void> {
  return callIdentityService(service, secret, "/send-transactional-email", input);
}
