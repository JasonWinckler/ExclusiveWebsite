import { Account, Client, ID } from "appwrite";

export const appwriteConfig = Object.freeze({
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
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
export const ageInstructionsVersion = "manual-age-v3";

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
  if (!response.ok) throw await errorFromResponse(response);
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

export async function getCurrentUser() {
  try {
    return await account.get();
  } catch (error) {
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
  const user = await account.create({ userId: ID.unique(), email, password, name });
  await account.createEmailPasswordSession({ email, password });
  await updatePrivacyProfile({
    countryCode,
    regionCode: countryCode === "US" ? regionCode : null,
    noticeVersion: privacyNoticeVersion,
    noticeAccepted: privacyNoticeAccepted,
    gpcSignal,
  });
  await requestEmailVerification(locale);
  return user;
}

export const login = (email, password) => account.createEmailPasswordSession({ email, password });
export const logout = () => account.deleteSession({ sessionId: "current" });
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
export const updateProfileName = (name) => account.updateName({ name });

export const getProducts = () => apiRequest("/v1/products", { authenticated: false });
export const getMembershipStatus = () => apiRequest("/v1/membership/status");
export const getEntitlementStatus = () => apiRequest("/v1/entitlements/status");
export const createAgeVerificationCase = () => apiRequest("/v1/age-verification/cases", {
  method: "POST",
  json: { consent: true, instructionsVersion: ageInstructionsVersion },
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
export const registerCurrentDevice = (displayName = navigator.userAgent.slice(0, 80)) => apiRequest(
  "/v1/devices/register",
  { method: "POST", json: { deviceToken: getDeviceToken(), displayName }, idempotent: true },
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
}) => apiRequest("/v1/privacy/profile", {
  method: "PATCH",
  json: { countryCode, regionCode, noticeAccepted, noticeVersion, gpcSignal },
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
