// Cloudflare-native browser API. Authentication uses a same-origin HttpOnly
// session cookie; the browser never receives service credentials or JWTs.

export const cloudflareConfig = Object.freeze({
  apiBaseUrl: (
    import.meta.env.VITE_CLOUDFLARE_API_BASE_URL ||
    "/api/member"
  ).replace(/\/$/, ""),
  adminApiBaseUrl: (
    import.meta.env.VITE_CLOUDFLARE_ADMIN_API_BASE_URL ||
    "/api/admin"
  ).replace(/\/$/, ""),
  authApiBaseUrl: (
    import.meta.env.VITE_CLOUDFLARE_AUTH_API_BASE_URL ||
    "/api/auth"
  ).replace(/\/$/, ""),
});

const deviceStorageKey = "jason-shadow-device-token-v1";
const adminSessionStorageKey = "shadows-temptation-admin-session-v1";
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
  const baseUrl = options.auth
    ? cloudflareConfig.authApiBaseUrl
    : options.admin
      ? cloudflareConfig.adminApiBaseUrl
      : cloudflareConfig.apiBaseUrl;
  if (!baseUrl.startsWith("/")) requireApiUrl(baseUrl, "CLOUDFLARE_API_NOT_CONFIGURED");
  const headers = new Headers(options.headers);
  headers.set("Accept", options.responseType === "response" ? "*/*" : "application/json");
  if (options.idempotent) headers.set("Idempotency-Key", options.idempotencyKey || crypto.randomUUID());
  if (options.device || options.auth) headers.set("X-Device-Token", getDeviceToken());
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
    credentials: "same-origin",
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

export async function getCurrentUser() {
  try {
    return await apiRequest("/v1/account", { auth: true });
  } catch (error) {
    if (error?.status === 401) return null;
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
  const result = await apiRequest("/v1/register", {
    auth: true,
    authenticated: false,
    method: "POST",
    idempotent: true,
    json: {
      name, email, password, countryCode, regionCode, privacyNoticeVersion,
      privacyNoticeAccepted, gpcSignal, locale,
    },
  });
  await registerCurrentDevice(undefined, result.session?.$id);
  return result;
}

export async function login(email, password) {
  const result = await apiRequest("/v1/login", {
    auth: true, authenticated: false, method: "POST", json: { email, password },
  });
  if (!result.mfaRequired) {
    const user = await getCurrentUser();
    await registerCurrentDevice(undefined, result.session?.$id);
    return { ...result, user };
  }
  return result;
}
export async function logout() {
  try {
    return await apiRequest("/v1/logout", { auth: true, authenticated: false, method: "POST" });
  } finally {
    sessionStorage.removeItem(adminSessionStorageKey);
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
export const getLoginSessions = () => apiRequest("/v1/sessions", { auth: true });
export const revokeLoginSession = (sessionId) => apiRequest(
  `/v1/sessions/${encodeURIComponent(sessionId)}`,
  { auth: true, method: "DELETE" },
);
export const getMfaStatus = () => apiRequest("/v1/mfa", { auth: true });
export const beginTotpEnrollment = () => apiRequest("/v1/mfa/enrollment", { auth: true, method: "POST" });
export const confirmTotpEnrollment = (otp) => apiRequest(
  "/v1/mfa/enrollment/confirm", { auth: true, method: "POST", json: { otp } },
);
export const disableTotpMfa = () => apiRequest("/v1/mfa", { auth: true, method: "DELETE" });
export const createMfaLoginChallenge = (factor = "totp") => apiRequest(
  "/v1/mfa/challenge", { auth: true, authenticated: false, method: "POST", json: { factor } },
);
export const completeMfaLoginChallenge = async (challengeId, otp) => {
  const result = await apiRequest("/v1/mfa/challenge/confirm", {
    auth: true, authenticated: false, method: "POST", json: { challengeId, otp },
  });
  await registerCurrentDevice(undefined, result.session?.$id);
  return result;
};
export const requestEmailVerification = (locale = "de") => apiRequest(
  "/v1/email-verification/request",
  { auth: true, method: "POST", json: { locale }, idempotent: true },
);
export const resendVerification = requestEmailVerification;
export const requestPasswordReset = (email, locale = "de") => apiRequest(
  "/v1/password-reset/request",
  { auth: true, method: "POST", json: { email, locale }, authenticated: false, idempotent: true },
);
export const completePasswordReset = (token, password) => apiRequest(
  "/v1/password-reset/confirm",
  { auth: true, method: "POST", json: { token, password }, authenticated: false, idempotent: true },
);
export const completeEmailVerification = (token) => apiRequest(
  "/v1/email-verification/confirm",
  { auth: true, method: "POST", json: { token }, authenticated: false, idempotent: true },
);
export async function completeLegacyEmailVerification() {
  throw new CloudflareApiError("LEGACY_AUTH_LINK_EXPIRED", 410);
}
export async function completeLegacyPasswordReset() {
  throw new CloudflareApiError("LEGACY_AUTH_LINK_EXPIRED", 410);
}
export const updateProfileName = (displayName) => apiRequest(
  "/v1/account/profile/name",
  { method: "PATCH", json: { displayName }, idempotent: true },
);
export const updateProfileEmail = (email, password, locale = "de") => apiRequest(
  "/v1/account/email",
  { auth: true, method: "PATCH", json: { email, password, locale }, idempotent: true },
);

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

