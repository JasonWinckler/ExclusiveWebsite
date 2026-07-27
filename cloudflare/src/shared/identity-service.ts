import { ApiError } from "./http";

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
    throw new ApiError(503, "IDENTITY_PROJECTION_FAILED");
  }
}

export function syncAppwriteLabel(
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

export function deleteAppwriteUser(
  service: Service,
  secret: string,
  userId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/delete-user", { userId });
}

export function revokeAppwriteSessions(
  service: Service,
  secret: string,
  userId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/revoke-sessions", { userId });
}

export function updateAppwriteUserStatus(
  service: Service,
  secret: string,
  userId: string,
  status: boolean,
): Promise<void> {
  return callIdentityService(service, secret, "/update-user-status", { userId, status });
}

export function verifyAppwriteUserEmail(
  service: Service,
  secret: string,
  userId: string,
): Promise<void> {
  return callIdentityService(service, secret, "/verify-user-email", { userId });
}

export function updateAppwriteUserPassword(
  service: Service,
  secret: string,
  userId: string,
  password: string,
): Promise<void> {
  return callIdentityService(service, secret, "/update-user-password", { userId, password });
}

export function sendTransactionalEmail(
  service: Service,
  secret: string,
  input: {
    userId: string;
    messageId: string;
    subject: string;
    html: string;
  },
): Promise<void> {
  return callIdentityService(service, secret, "/send-transactional-email", input);
}
