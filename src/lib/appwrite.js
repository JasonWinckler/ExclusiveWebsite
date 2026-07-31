import {
  Account,
  AuthenticationFactor,
  AuthenticatorType,
  Client,
  ID,
} from "appwrite";

export const appwriteConfig = Object.freeze({
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || "https://auth-exclusive.jason-shadow.com/v1",
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || "6a64cbeb0009826c9efc",
});

export const cloudflareConfig = Object.freeze({
  apiBaseUrl: (
    import.meta.env.VITE_CLOUDFLARE_API_BASE_URL ||
    "https://exclusive-membership-api.jason-winckler-business.workers.dev"
  ).replace(/\/$/, ""),
  adminApiBaseUrl: (
    import.meta.env.VITE_CLOUDFLARE_ADMIN_API_BASE_URL ||
    "https://exclusive-admin-api.jason-winckler-business.workers.dev"
  ).replace(/\/$/, ""),
});

const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);
const account = new Account(client);
const deviceStorageKey = "jason-shadow-device-token-v1";
const adminSessionStorageKey = "shadows-temptation-admin-session-v1";
const appwriteFallbackCookieKey = "cookieFallback";
export const ageInstructionsVersion = "manual-age-v6";
let adminSessionPromise = null;

export class CloudflareApiError extends Error {
  constructor(code, status, requestId = null) {
    super(code);
    this.name = "CloudflareApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function requireApiUrl(value, code) {
  if (!value) throw new CloudflareApiError(code, 503);
  const url = new URL(value);
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new CloudflareApiError(code, 503);
  }
  return url.toString().replace(/\/$/, "");
}

async function errorFromResponse(response) {
  let code = "API_REQUEST_FAILED";
  let requestId = response.headers.get("X-Request-Id");
  try {
    const payload = await response.clone().json();
    code = payload?.error?.code || code;
    requestId = payload?.requestId || requestId;
  } catch {
    // API responses fail closed when their documented JSON error is unavailable.
  }
  return new CloudflareApiError(code, response.status, requestId);
}

async function apiRequest(path, options = {}) {
  const baseUrl = options.admin
    ? requireApiUrl(cloudflareConfig.adminApiBaseUrl, "ADMIN_API_NOT_CONFIGURED")
    : requireApiUrl(cloudflareConfig.apiBaseUrl, "MEMBERSHIP_API_NOT_CONFIGURED");
  const headers = new Headers(options.headers);
  headers.set("Accept", options.responseType === "response" ? "*/*" : "application/json");
  if (options.authenticated !== false) {
    const jwt = await account.createJWT();
    headers.set("Authorization", `Bearer ${jwt.jwt}`);
  }
  if (options.idempotent) headers.set("Idempotency-Key", options.idempotencyKey || crypto.randomUUID());
  if (options.device) headers.set("X-Device-Token", getDeviceToken());
  if (options.admin && !options.skipAdminSession) {
    const adminSession = await ensureAdminSession();
    headers.set("X-Admin-Session", adminSession.token);
    headers.set("X-Device-Token", getDeviceToken());
  }

  let body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  } else if (options.raw !== undefined) {
    headers.set("Content-Type", options.contentType || options.raw.type || "application/octet-stream");
    body = options.raw;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body,
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) {
    const error = await errorFromResponse(response);
    if (options.admin && ["ADMIN_SESSION_EXPIRED", "ADMIN_SESSION_REQUIRED"].includes(error.code)) {
      sessionStorage.removeItem(adminSessionStorageKey);
    }
    throw error;
  }
  if (options.responseType === "response") return response;
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CloudflareApiError("INVALID_API_RESPONSE", 503);
  }
  if (!payload || typeof payload !== "object") {
    throw new CloudflareApiError("INVALID_API_RESPONSE", 503);
  }
  return payload;
}

function storedAdminSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(adminSessionStorageKey) || "null");
    if (
      session &&
      typeof session.token === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(session.token) &&
      Number.isFinite(Date.parse(session.expiresAt)) &&
      Date.parse(session.expiresAt) > Date.now() + 5_000
    ) return session;
  } catch {
    // Invalid session state is discarded below.
  }
  sessionStorage.removeItem(adminSessionStorageKey);
  return null;
}

async function ensureAdminSession() {
  const existing = storedAdminSession();
  if (existing) return existing;
  if (!adminSessionPromise) {
    adminSessionPromise = apiRequest("/v1/admin-session", {
      admin: true,
      method: "POST",
      device: true,
      skipAdminSession: true,
    }).then((created) => {
      if (typeof created?.token !== "string" || typeof created?.expiresAt !== "string") {
        throw new CloudflareApiError("INVALID_ADMIN_SESSION_RESPONSE", 503);
      }
      sessionStorage.setItem(adminSessionStorageKey, JSON.stringify(created));
      return created;
    }).finally(() => {
      adminSessionPromise = null;
    });
  }
  return adminSessionPromise;
}

function createDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getDeviceToken() {
  let token = localStorage.getItem(deviceStorageKey);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    token = createDeviceToken();
    localStorage.setItem(deviceStorageKey, token);
  }
  return token;
}

export function forgetCurrentDevice() {
  localStorage.removeItem(deviceStorageKey);
}

function clearAppwriteFallbackSession() {
  localStorage.removeItem(appwriteFallbackCookieKey);
}

async function discardBlockedSession() {
  try {
    await account.deleteSession({ sessionId: "current" });
  } catch {
    // A blocked Appwrite user may no longer be allowed to delete its own session.
  }
  clearAppwriteFallbackSession();
}

async function createEmailPasswordSession(email, password) {
  try {
    return await account.createEmailPasswordSession({ email, password });
  } catch (error) {
    if (error?.type !== "user_blocked") throw error;
    await discardBlockedSession();
    return account.createEmailPasswordSession({ email, password });
  }
}

async function createAccount(email, password, name) {
  try {
    return await account.create({ userId: ID.unique(), email, password, name });
  } catch (error) {
    if (error?.type !== "user_blocked") throw error;
    await discardBlockedSession();
    return account.create({ userId: ID.unique(), email, password, name });
  }
}

export async function getCurrentUser() {
  try {
    return await account.get();
  } catch (error) {
    if (error?.type === "user_blocked") {
      await discardBlockedSession();
      return null;
    }
    if (error?.code === 401) return null;
    throw error;
  }
}

export async function registerAccount({
  name,
  email,
  password,
  countryCode,
  regionCode,
  privacyNoticeVersion,
  privacyNoticeAccepted,
  gpcSignal = false,
  locale = "de",
}) {
  const user = await createAccount(email, password, name);
  const session = await createEmailPasswordSession(email, password);
  await updatePrivacyProfile({
    countryCode,
    regionCode: countryCode === "US" ? regionCode : null,
    noticeVersion: privacyNoticeVersion,
    noticeAccepted: privacyNoticeAccepted,
    gpcSignal,
    locale,
  });
  await requestEmailVerification(locale);
  await registerCurrentDevice(undefined, session.$id);
  return {
    user: await getCurrentUser() || user,
    sessionReady: true,
  };
}

export async function login(email, password) {
  const session = await createEmailPasswordSession(email, password);
  try {
    const user = await account.get();
    await registerCurrentDevice(undefined, session.$id);
    return {
      session,
      user,
      sessionReady: true,
    };
  } catch (error) {
    if (error?.type === "user_more_factors_required") {
      return {
        session,
        mfaRequired: true,
        sessionReady: false,
      };
    }
    try {
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // Preserve the original device-policy error.
    }
    clearAppwriteFallbackSession();
    throw error;
  }
}
export async function logout() {
  try {
    return await account.deleteSession({ sessionId: "current" });
  } catch (error) {
    if (error?.type !== "user_blocked" && error?.type !== "user_session_not_found") throw error;
    return {};
  } finally {
    sessionStorage.removeItem(adminSessionStorageKey);
    clearAppwriteFallbackSession();
  }
}
export async function endAdminSession() {
  const current = storedAdminSession();
  if (!current) return;
  try {
    await apiRequest("/v1/admin-session", {
      admin: true,
      method: "DELETE",
      device: true,
    });
  } finally {
    sessionStorage.removeItem(adminSessionStorageKey);
  }
}
export function getAdminSessionExpiry() {
  return storedAdminSession()?.expiresAt || null;
}
export const getLoginSessions = () => account.listSessions();
export const revokeLoginSession = (sessionId) => account.deleteSession({ sessionId });
export const getMfaStatus = async () => {
  const [user, factors] = await Promise.all([
    account.get(),
    account.listMFAFactors(),
  ]);
  return {
    enabled: Boolean(user.mfa),
    factors,
    user,
  };
};
export const beginTotpEnrollment = () => account.createMFAAuthenticator({
  type: AuthenticatorType.Totp,
});
export const confirmTotpEnrollment = async (otp) => {
  await account.updateMFAAuthenticator({
    type: AuthenticatorType.Totp,
    otp,
  });
  const recovery = await account.createMFARecoveryCodes();
  const user = await account.updateMFA({ mfa: true });
  return {
    user,
    recoveryCodes: recovery.recoveryCodes || [],
  };
};
export const disableTotpMfa = async () => {
  const user = await account.updateMFA({ mfa: false });
  await account.deleteMFAAuthenticator({ type: AuthenticatorType.Totp });
  return user;
};
export const createMfaLoginChallenge = async (factor = "totp") => {
  const authenticationFactor = factor === "recovery"
    ? AuthenticationFactor.Recoverycode
    : AuthenticationFactor.Totp;
  return account.createMFAChallenge({ factor: authenticationFactor });
};
export const completeMfaLoginChallenge = async (challengeId, otp) => {
  const session = await account.updateMFAChallenge({ challengeId, otp });
  try {
    const user = await account.get();
    await registerCurrentDevice(undefined, session.$id);
    return {
      session,
      user,
      sessionReady: true,
    };
  } catch (error) {
    try {
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // Preserve the original device-policy error.
    }
    clearAppwriteFallbackSession();
    throw error;
  }
};
export const requestEmailVerification = (locale = "de") => apiRequest(
  "/v1/auth/email-verification/request",
  { method: "POST", json: { locale }, idempotent: true },
);
export const resendVerification = requestEmailVerification;
export const requestPasswordReset = (email, locale = "de") => apiRequest(
  "/v1/auth/password-reset/request",
  { method: "POST", json: { email, locale }, authenticated: false, idempotent: true },
);
export const completePasswordReset = (token, password) => apiRequest(
  "/v1/auth/password-reset/confirm",
  { method: "POST", json: { token, password }, authenticated: false, idempotent: true },
);
export const completeEmailVerification = (token) => apiRequest(
  "/v1/auth/email-verification/confirm",
  { method: "POST", json: { token }, authenticated: false, idempotent: true },
);
export async function completeLegacyEmailVerification(userId, secret) {
  try {
    return await account.updateVerification({ userId, secret });
  } catch (error) {
    if (error?.type === "user_already_verified") return { alreadyVerified: true };
    throw error;
  }
}
export const completeLegacyPasswordReset = (userId, secret, password) => account.updateRecovery({ userId, secret, password });
export const updateProfileName = (displayName) => apiRequest(
  "/v1/account/profile/name",
  { method: "PATCH", json: { displayName }, idempotent: true },
);
export const updateProfileEmail = (email, password) => account.updateEmail({ email, password });

export const getProducts = (locale = "de") => apiRequest(
  `/v1/products?locale=${locale === "en" ? "en" : "de"}`,
  { authenticated: false },
);
export const getMembershipStatus = () => apiRequest("/v1/membership/status");
export const getEntitlementStatus = () => apiRequest("/v1/entitlements/status");
export const createAgeVerificationCase = ({
  verificationRoute = "MANUAL_DOCUMENT_VIDEO",
  documentType = "NATIONAL_ID",
} = {}) => apiRequest("/v1/age-verification/cases", {
  method: "POST",
  json: {
    consent: true,
    instructionsVersion: ageInstructionsVersion,
    verificationRoute,
    documentType,
  },
  idempotent: true,
});
export const uploadAgeEvidence = (caseId, kind, file) => apiRequest(
  `/v1/age-verification/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(kind)}`,
  { method: "PUT", raw: file, contentType: file.type, idempotent: true },
);
export const submitAgeVerificationCase = (caseId) => apiRequest(
  `/v1/age-verification/cases/${encodeURIComponent(caseId)}/submit`,
  { method: "POST", json: {}, idempotent: true },
);
export const createSepaOrder = (productSku, billing, locale = "de", legal = {}) => apiRequest("/v1/payments/sepa-orders", {
  method: "POST", json: { productSku, billing, locale, ...legal }, idempotent: true,
});
export const getPaymentOrders = () => apiRequest("/v1/payments/orders");
export const cancelPaymentOrder = (orderId, reason) => apiRequest(
  `/v1/payments/orders/${encodeURIComponent(orderId)}`,
  { method: "DELETE", json: { reason }, idempotent: true },
);
export const getPremiumTelegramPerk = () => apiRequest("/v1/perks/premium-telegram");
export const getVipWhatsappPerk = () => apiRequest("/v1/perks/vip-whatsapp");
function currentDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Device";
  const browser = navigator.userAgent.includes("Edg/") ? "Edge"
    : navigator.userAgent.includes("Chrome/") ? "Chrome"
    : navigator.userAgent.includes("Firefox/") ? "Firefox"
    : navigator.userAgent.includes("Safari/") ? "Safari"
    : "Browser";
  return `${platform} · ${browser}`.slice(0, 80);
}
export const registerCurrentDevice = (
  displayName = currentDeviceName(),
  sessionId = null,
) => apiRequest(
  "/v1/devices/register",
  {
    method: "POST",
    json: { deviceToken: getDeviceToken(), displayName, sessionId },
    idempotent: true,
  },
);
export const getRegisteredDevices = () => apiRequest("/v1/devices", { device: true });
export const revokeRegisteredDevice = (deviceId) => apiRequest(
  `/v1/devices/${encodeURIComponent(deviceId)}`,
  { method: "DELETE", json: {}, idempotent: true, device: true },
);
export const setRegisteredDeviceLock = (deviceId, locked) => apiRequest(
  `/v1/devices/${encodeURIComponent(deviceId)}`,
  {
    method: "PATCH",
    json: { action: locked ? "LOCK" : "UNLOCK" },
    idempotent: true,
    device: true,
  },
);
export const getContentItems = () => apiRequest("/v1/content", { device: true });
export const fetchContentItem = (slug) => apiRequest(`/v1/content/${encodeURIComponent(slug)}`, {
  device: true, responseType: "response",
});
export const getContentComments = (slug) => apiRequest(
  `/v1/content/${encodeURIComponent(slug)}/comments`,
  { device: true },
);
export const createContentComment = (slug, body) => apiRequest(
  `/v1/content/${encodeURIComponent(slug)}/comments`,
  { method: "POST", json: { body }, idempotent: true, device: true },
);
export const deleteContentComment = (commentId) => apiRequest(
  `/v1/content/comments/${encodeURIComponent(commentId)}`,
  { method: "DELETE", json: {}, idempotent: true },
);
export const requestAccountDeletion = (reason) => apiRequest("/v1/account/deletion", {
  method: "POST", json: { reason, confirmation: "DELETE_ACCOUNT" }, idempotent: true,
});
export const getPrivacyOverview = () => apiRequest("/v1/privacy");
export const updatePrivacyProfile = ({
  countryCode,
  regionCode = null,
  noticeAccepted = true,
  noticeVersion,
  gpcSignal = false,
  locale = "de",
}) => apiRequest("/v1/privacy/profile", {
  method: "PATCH",
  json: {
    countryCode,
    regionCode,
    noticeAccepted,
    noticeVersion,
    gpcSignal,
    locale: locale === "en" ? "en" : "de",
  },
});
export const updatePrivacyChoices = (choices) => apiRequest("/v1/privacy/choices", {
  method: "PATCH", json: choices,
});
export const createPrivacyRequest = (requestType, note) => apiRequest("/v1/privacy/requests", {
  method: "POST", json: { requestType, note }, idempotent: true,
});
export const cancelPrivacyRequest = (requestId) => apiRequest(
  `/v1/privacy/requests/${encodeURIComponent(requestId)}`,
  { method: "DELETE", json: {}, idempotent: true },
);
export const fetchPrivacyExport = () => apiRequest("/v1/privacy/export", {
  responseType: "response",
});

export const adminListUsers = () => apiRequest("/v1/users", { admin: true });
export const adminListUserDevices = (userId) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/devices`,
  { admin: true },
);
export const adminRevokeUserDevice = (userId, kind, targetId) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(kind)}/${encodeURIComponent(targetId)}`,
  { admin: true, method: "DELETE", json: {}, idempotent: true },
);
export const adminSetUserDeviceLock = (userId, targetId, locked) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/devices/registered/${encodeURIComponent(targetId)}`,
  {
    admin: true,
    method: "PATCH",
    json: { action: locked ? "LOCK" : "UNLOCK" },
    idempotent: true,
  },
);
export const adminGetUserStatus = (userId) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/status`, { admin: true },
);
export const adminRestrictUser = (userId, reason) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/restrict`,
  { admin: true, method: "POST", json: { reason }, idempotent: true },
);
export const adminUnrestrictUser = (userId, reason) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/unrestrict`,
  { admin: true, method: "POST", json: { reason }, idempotent: true },
);
export const adminVerifyUserEmail = (userId, reason) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/verify-email`,
  {
    admin: true,
    method: "POST",
    json: { reason, confirmation: "VERIFY_EMAIL" },
    idempotent: true,
  },
);
export const adminScheduleAccountDeletion = (userId, reason) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}`,
  {
    admin: true,
    method: "DELETE",
    json: { reason, confirmation: "DELETE_ACCOUNT" },
    idempotent: true,
  },
);
export const adminGrantMembership = (userId, productSku, reason) => apiRequest(
  `/v1/users/${encodeURIComponent(userId)}/membership`,
  {
    admin: true,
    method: "POST",
    json: { productSku, reason },
    idempotent: true,
  },
);

export const adminListAgeCases = () => apiRequest("/v1/age-verification/cases", { admin: true });
export const adminGetAgeCase = (caseId) => apiRequest(
  `/v1/age-verification/cases/${encodeURIComponent(caseId)}`,
  { admin: true },
);
export const adminFetchAgeEvidence = (evidenceId) => apiRequest(
  `/v1/age-verification/evidence/${encodeURIComponent(evidenceId)}`,
  { admin: true, responseType: "response" },
);
export const adminDecideAgeCase = (caseId, decision, reason, checklist = []) => apiRequest(
  `/v1/age-verification/cases/${encodeURIComponent(caseId)}/decision`,
  { admin: true, method: "POST", json: { decision, reason, checklist }, idempotent: true },
);
export const adminListPaymentOrders = () => apiRequest("/v1/payments/orders", {
  admin: true,
});
export const adminActivatePaymentOrder = (orderId, reason) => apiRequest(
  `/v1/payments/orders/${encodeURIComponent(orderId)}/activate`,
  {
    admin: true,
    method: "POST",
    json: { reason, confirmedPaymentReceived: true },
    idempotent: true,
  },
);
export const adminCancelPaymentOrder = (orderId, reason) => apiRequest(
  `/v1/payments/orders/${encodeURIComponent(orderId)}/cancel`,
  { admin: true, method: "POST", json: { reason }, idempotent: true },
);
export const adminArchivePaymentOrder = (orderId, reason) => apiRequest(
  `/v1/payments/orders/${encodeURIComponent(orderId)}`,
  { admin: true, method: "DELETE", json: { reason }, idempotent: true },
);
export const adminImportN26Csv = (file) => apiRequest("/v1/payments/n26-csv-import", {
  admin: true, method: "POST", raw: file, contentType: "text/csv", idempotent: true,
});
export const adminListContent = () => apiRequest("/v1/content/items", { admin: true });
export const adminListPrivacyRequests = () => apiRequest("/v1/privacy/requests", { admin: true });
export const adminDecidePrivacyRequest = (requestId, status, response, reason) => apiRequest(
  `/v1/privacy/requests/${encodeURIComponent(requestId)}/decision`,
  { admin: true, method: "POST", json: { status, response, reason }, idempotent: true },
);
export const adminListContentComments = () => apiRequest("/v1/content/comments", { admin: true });
export const adminModerateContentComment = (commentId, action, reason) => apiRequest(
  `/v1/content/comments/${encodeURIComponent(commentId)}/moderate`,
  { admin: true, method: "POST", json: { action, reason }, idempotent: true },
);
export const adminCreateContent = ({ slug, title, tier, bodyText, allowComments }) => apiRequest("/v1/content/items", {
  admin: true, method: "POST", json: { slug, title, tier, bodyText, allowComments }, idempotent: true,
});
export const adminUpdateContent = (contentId, { title, tier, bodyText, allowComments }) => apiRequest(
  `/v1/content/items/${encodeURIComponent(contentId)}`,
  { admin: true, method: "PATCH", json: { title, tier, bodyText, allowComments }, idempotent: true },
);
export const adminDeleteContent = (contentId, reason) => apiRequest(
  `/v1/content/items/${encodeURIComponent(contentId)}`,
  { admin: true, method: "DELETE", json: { reason }, idempotent: true },
);
export const adminUploadContent = (contentId, file) => apiRequest(
  `/v1/content/items/${encodeURIComponent(contentId)}/media`,
  { admin: true, method: "PUT", raw: file, contentType: file.type, idempotent: true },
);

export { account, client };
