import { upsertUserProjection } from "./db";
import { ApiError, parsePositiveInt, readJsonResponse } from "./http";
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

function secureAppwriteEndpoint(raw: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }
  if (endpoint.protocol !== "https:") {
    throw new ApiError(503, "APPWRITE_NOT_CONFIGURED");
  }
  return endpoint.toString().replace(/\/$/, "");
}

function trustedIso(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function authenticateUser(
  request: Request,
  env: BaseEnv,
  options: { requireVerifiedEmail?: boolean; projectUser?: boolean } = {},
): Promise<AuthenticatedIdentity> {
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
      redirect: "error",
    });
  } catch {
    throw new ApiError(503, "IDENTITY_PROVIDER_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, "INVALID_OR_EXPIRED_IDENTITY");
  }
  if (!response.ok) {
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
  return identity;
}
