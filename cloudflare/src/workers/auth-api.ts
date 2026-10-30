import { AUTH_COOKIE_NAME, authenticateUser } from "../shared/auth";
import {
  ApiError,
  allowedOrigins,
  enforceAllowedOrigin,
  enforceRateLimit,
  errorResponse,
  jsonResponse,
  logEvent,
  parsePositiveInt,
  readJsonBody,
  requestId,
  requireIdempotencyKey,
} from "../shared/http";
import {
  hashPasswordVerifier,
  passwordMaterialSalt,
  randomBase64Url,
  sha256Hex,
  validateDeviceToken,
  validatePasswordVerifierCredential,
  verifyPasswordVerifier,
} from "../shared/security";
import {
  createRecoveryCodes,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from "../shared/totp";
import { sendTransactionalEmail } from "../shared/identity-service";
import type { AuthEnv, AuthenticatedIdentity } from "../shared/types";

type Locale = "de" | "en";
type TokenPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_EMAIL";

const SESSION_COOKIE = `${AUTH_COOKIE_NAME}=`;

function currentPasswordPepperVersion(env: AuthEnv): string {
  return env.AUTH_PASSWORD_PEPPER_VERSION?.trim() || "v1";
}

function currentPasswordPepper(env: AuthEnv): string {
  return env.AUTH_PASSWORD_PEPPER_CURRENT?.trim() || env.AUTH_PASSWORD_PEPPER;
}

function passwordPepperForVersion(env: AuthEnv, version: string): string {
  if (version === currentPasswordPepperVersion(env)) return currentPasswordPepper(env);
  if (env.AUTH_PASSWORD_PEPPER_CURRENT && version === env.AUTH_PASSWORD_PEPPER_PREVIOUS_VERSION) {
    return env.AUTH_PASSWORD_PEPPER;
  }
  if (env.AUTH_PASSWORD_PEPPER_PREVIOUS && version === env.AUTH_PASSWORD_PEPPER_PREVIOUS_VERSION) {
    return env.AUTH_PASSWORD_PEPPER_PREVIOUS;
  }
  throw new ApiError(503, "PASSWORD_PEPPER_VERSION_UNAVAILABLE");
}

function currentEncryptionKeyVersion(env: AuthEnv): string {
  return env.AUTH_ENCRYPTION_KEY_VERSION?.trim() || "v1";
}

function currentEncryptionKey(env: AuthEnv): string {
  return env.AUTH_ENCRYPTION_KEY_CURRENT?.trim() || env.AUTH_ENCRYPTION_KEY;
}

function encryptionKeyForVersion(env: AuthEnv, version: string): string {
  if (version === currentEncryptionKeyVersion(env)) return currentEncryptionKey(env);
  if (env.AUTH_ENCRYPTION_KEY_CURRENT && version === env.AUTH_ENCRYPTION_KEY_PREVIOUS_VERSION) {
    return env.AUTH_ENCRYPTION_KEY;
  }
  if (env.AUTH_ENCRYPTION_KEY_PREVIOUS && version === env.AUTH_ENCRYPTION_KEY_PREVIOUS_VERSION) {
    return env.AUTH_ENCRYPTION_KEY_PREVIOUS;
  }
  throw new ApiError(503, "AUTH_ENCRYPTION_KEY_VERSION_UNAVAILABLE");
}

function isoNow(): string {
  return new Date().toISOString();
}

function locale(value: unknown): Locale {
  return value === "en" ? "en" : "de";
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "VALID_EMAIL_REQUIRED");
  }
  return email;
}

function normalizeName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 64 || !/[\p{L}\p{N}]/u.test(name)) {
    throw new ApiError(400, "INVALID_DISPLAY_NAME");
  }
  return name;
}

function cookieToken(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AUTH_COOKIE_NAME) {
      const value = rest.join("=");
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

function setSessionCookie(response: Response, token: string, maxAge: number): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${SESSION_COOKIE}${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function clearSessionCookie(response: Response): Response {
  return setSessionCookie(response, "", 0);
}

function publicUser(identity: AuthenticatedIdentity): Record<string, unknown> {
  return {
    $id: identity.userId,
    email: identity.email,
    name: identity.displayName,
    emailVerification: identity.emailVerified,
    status: true,
    labels: identity.labels,
    mfa: identity.mfaEnabled,
  };
}

async function createSession(
  env: AuthEnv,
  userId: string,
  request: Request,
  state: "ACTIVE" | "MFA_PENDING",
): Promise<{ id: string; token: string; expiresAt: string }> {
  const maxSessions = parsePositiveInt(env.DEVICE_LIMIT, 3, 10);
  const now = isoNow();
  const active = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM auth_sessions
    WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
  `).bind(userId, now).first<{ count: number }>();
  if (Number(active?.count ?? 0) >= maxSessions) throw new ApiError(409, "DEVICE_LIMIT_EXCEEDED");
  const id = crypto.randomUUID();
  const token = randomBase64Url(32);
  const days = parsePositiveInt(env.SESSION_DAYS, 30, 90);
  const expiresAt = new Date(Date.now() + (state === "MFA_PENDING" ? 10 * 60_000 : days * 86_400_000)).toISOString();
  const deviceToken = request.headers.get("X-Device-Token");
  const deviceId = deviceToken && /^[A-Za-z0-9_-]{43}$/.test(deviceToken)
    ? await sha256Hex(deviceToken)
    : null;
  await env.DB.prepare(`
    INSERT INTO auth_sessions (
      id, user_id, token_sha256, state, device_id, created_at,
      last_seen_at, expires_at, user_agent_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, await sha256Hex(token), state, deviceId, now, now, expiresAt,
    (request.headers.get("User-Agent") ?? "Browser").slice(0, 160),
  ).run();
  return { id, token, expiresAt };
}

interface EmailVerificationDelivery {
  expiresAt: string;
  resendAfter: string;
  delivery: "sent" | "failed";
}

const VERIFICATION_TTL_MS = 15 * 60_000;
const VERIFICATION_RESEND_MS = 60_000;
const VERIFICATION_MAX_ATTEMPTS = 5;

function escapeMailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function verificationCode(): string {
  // Rejection sampling keeps all one million six-digit values equally likely.
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0]! >= 4_294_000_000);
  return String(value[0]! % 1_000_000).padStart(6, "0");
}

async function verificationCodeHash(env: AuthEnv, userId: string, id: string, code: string, version: string): Promise<string> {
  const encoder = new TextEncoder();
  const pepper = passwordPepperForVersion(env, version);
  if (!/^[A-Za-z0-9_-]{43}$/.test(pepper ?? "")) throw new ApiError(503, "PASSWORD_PEPPER_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key,
    encoder.encode(`email-verification:${userId}:${id}:${code}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function authMail(input: {
  locale: Locale; purpose: TokenPurpose; name: string; actionUrl: string; code?: string;
}): { subject: string; html: string } {
  const de = input.locale === "de";
  const title = input.purpose === "RESET_PASSWORD"
    ? (de ? "Passwort sicher festlegen" : "Set your password securely")
    : input.purpose === "CHANGE_EMAIL"
      ? (de ? "Neue E-Mail-Adresse bestätigen" : "Confirm your new email address")
      : (de ? "Dein Bestätigungscode" : "Your verification code");
  const action = input.purpose === "RESET_PASSWORD"
    ? (de ? "Passwort festlegen" : "Set password")
    : (de ? "Alternativ: E-Mail bestätigen" : "Or confirm by link");
  const copy = input.code
    ? (de ? "Gib diesen sechsstelligen Code im geöffneten Registrierungsfenster ein. Er ist 15 Minuten gültig und kann einmal verwendet werden. Danach bist du automatisch angemeldet."
      : "Enter this six-digit code in the registration window. It is valid for 15 minutes and can be used once. You will then be signed in automatically.")
    : input.purpose === "RESET_PASSWORD"
      ? (de ? "Der Link ist einmalig und 60 Minuten gültig. Danach kannst du dich direkt wieder anmelden."
        : "This single-use link is valid for 60 minutes. You can sign in immediately afterwards.")
      : (de ? "Bestätige deine neue Adresse über diesen einmaligen Link. Er ist 60 Minuten gültig."
        : "Confirm your new address with this single-use link. It is valid for 60 minutes.");
  const url = escapeMailHtml(input.actionUrl);
  const codeBlock = input.code ? `<p style="text-align:center;margin:28px 0;font-size:38px;font-weight:bold;letter-spacing:8px;color:#efd18a"><span>${input.code}</span></p><p style="font-size:13px;line-height:1.6;color:#d8c4bd">${de ? "Du kannst den Code nicht eingeben? Der folgende Link bestätigt dieselbe Adresse und öffnet direkt deine Mitgliedschaft. Verwende nur einen der beiden Wege." : "Cannot enter the code? The link below confirms the same address and opens your membership directly. Use either option once."}</p>` : "";
  return {
    subject: `${title} · Jason Shadow`,
    html: `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#240007;color:#f8eee7;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="640" style="max-width:640px;background:#31000b;border:1px solid #6d2432;border-radius:24px;overflow:hidden"><tr><td><img src="cid:shadow-brand-banner" width="640" alt="Jason Shadow · Order of Shadows" style="display:block;width:100%;height:auto"></td></tr><tr><td style="padding:34px"><p style="color:#e6c77c;letter-spacing:3px;font-size:11px;font-weight:bold">JASON SHADOW · EXCLUSIVE MEMBERSHIP</p><h1 style="font-family:Georgia,serif;font-size:38px;font-weight:normal;color:#fff6e8">${title}</h1><p style="font-size:16px;line-height:1.7;color:#d8c4bd">${de ? "Hallo" : "Hello"} ${escapeMailHtml(input.name || "Member")},<br>${copy}</p>${codeBlock}<p style="text-align:center;margin:30px 0"><a href="${url}" style="display:inline-block;padding:16px 28px;border-radius:999px;background:#efd18a;color:#240007;text-decoration:none;font-weight:bold">${action} →</a></p><p style="font-size:12px;line-height:1.6;color:#9f8e89">${de ? "Button nicht sichtbar? Öffne diesen sicheren Link:" : "Button not visible? Open this secure link:"}<br><a href="${url}" style="color:#e6c77c;word-break:break-all">${url}</a></p><p style="font-size:12px;line-height:1.6;color:#9f8e89">${de ? "Nicht angefordert? Ignoriere diese Nachricht. Teile den Code oder Link niemals mit anderen." : "Did not request this? Ignore this message. Never share your code or link."}</p></td></tr><tr><td style="padding:20px 34px;background:#0d0204;color:#968681;font-size:12px">Jason Shadow · Order of Shadows<br><a href="https://exclusive.jason-shadow.com/legal/" style="color:#e6c77c">${de ? "Rechtliches & Datenschutz" : "Legal & privacy"}</a> · <a href="mailto:info@exclusive.jason-shadow.com" style="color:#e6c77c">Support</a></td></tr></table></td></tr></table></body></html>`,
  };
}

async function issueActionToken(
  env: AuthEnv,
  input: { userId: string; purpose: TokenPurpose; locale: Locale; pendingEmail?: string | null; name: string },
): Promise<EmailVerificationDelivery> {
  const token = randomBase64Url(32);
  const now = isoNow();
  const isVerification = input.purpose === "VERIFY_EMAIL";
  const expiresAt = new Date(Date.now() + (isVerification ? VERIFICATION_TTL_MS : 3_600_000)).toISOString();
  const resendAfter = new Date(Date.now() + VERIFICATION_RESEND_MS).toISOString();
  const cooldownCutoff = new Date(Date.now() - VERIFICATION_RESEND_MS).toISOString();
  const id = crypto.randomUUID();
  const code = isVerification ? verificationCode() : undefined;
  const pepperVersion = currentPasswordPepperVersion(env);
  const codeHash = code ? await verificationCodeHash(env, input.userId, id, code, pepperVersion) : null;
  const inserted = await env.DB.batch([
    env.DB.prepare(`INSERT INTO auth_action_tokens (
      id, user_id, purpose, token_sha256, pending_email, locale, expires_at, created_at,
      code_sha256, code_pepper_version, resend_after
    ) SELECT ?, a.user_id, ?, ?, CASE WHEN ? = 'VERIFY_EMAIL' THEN a.email ELSE ? END, ?, ?, ?, ?, ?, ?
      FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id = a.user_id
      WHERE a.user_id = ? AND p.account_status IN ('ACTIVE', 'EMAIL_PENDING')
        AND (? <> 'VERIFY_EMAIL' OR p.email_verified = 0)
        AND (? <> 'VERIFY_EMAIL' OR NOT EXISTS (
          SELECT 1 FROM auth_action_tokens WHERE user_id = a.user_id AND purpose = 'VERIFY_EMAIL' AND created_at > ?
        )) RETURNING id`).bind(id, input.purpose, await sha256Hex(token), input.purpose,
      input.pendingEmail ?? null, input.locale, expiresAt, now, codeHash, code ? pepperVersion : null,
      resendAfter, input.userId, input.purpose, input.purpose, cooldownCutoff),
    env.DB.prepare(`UPDATE auth_action_tokens SET used_at = ?
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND id <> ?
        AND EXISTS (SELECT 1 FROM auth_action_tokens WHERE id = ?)`)
      .bind(now, input.userId, input.purpose, id, id),
  ]);
  if (!inserted[0]?.results?.length) {
    const profile = await env.DB.prepare(`SELECT email_verified FROM user_profiles WHERE appwrite_user_id = ?`)
      .bind(input.userId).first<{ email_verified: number }>();
    if (profile?.email_verified === 1 && isVerification) throw new ApiError(409, "EMAIL_ALREADY_VERIFIED");
    throw new ApiError(429, "VERIFICATION_RESEND_TOO_SOON");
  }
  const action = input.purpose === "RESET_PASSWORD" ? "recover" : "verify-email";
  const actionUrl = `https://exclusive.jason-shadow.com/?action=${action}&token=${encodeURIComponent(token)}`;
  const email = authMail({ ...input, actionUrl, code });
  const verification: EmailVerificationDelivery = { expiresAt, resendAfter, delivery: "sent" };
  try {
    await sendTransactionalEmail(env.IDENTITY_PROJECTION, env.AUTH_EMAIL_SERVICE_SECRET, {
      userId: input.userId, messageId: id, subject: email.subject, html: email.html,
      ...(input.purpose === "CHANGE_EMAIL" ? { emailChangeTokenId: id } : {}),
    });
  } catch (error) {
    if (!isVerification) throw error;
    verification.delivery = "failed";
    logEvent("error", "registration_verification_email_failed", {
      code: error instanceof ApiError ? error.code : "EMAIL_DELIVERY_FAILED",
    });
  }
  return verification;
}

async function register(request: Request, env: AuthEnv): Promise<{
  user: Record<string, unknown>;
  session: { id: string; token: string; expiresAt: string };
  verification: EmailVerificationDelivery;
}> {
  const idempotencyKey = requireIdempotencyKey(request);
  const body = await readJsonBody<Record<string, unknown>>(request, 16_384);
  const email = normalizeEmail(body.email);
  const name = normalizeName(body.name);
  const passwordCredential = validatePasswordVerifierCredential(body.passwordCredential);
  if (body.privacyNoticeAccepted !== true) throw new ApiError(400, "PRIVACY_NOTICE_ACCEPTANCE_REQUIRED");
  const country = typeof body.countryCode === "string" ? body.countryCode.toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(country)) throw new ApiError(400, "COUNTRY_REQUIRED");
  const region = country === "US" && typeof body.regionCode === "string"
    ? body.regionCode.toUpperCase().slice(0, 3) : null;
  const existing = await env.DB.prepare(`SELECT user_id FROM auth_accounts WHERE email = ? COLLATE NOCASE`)
    .bind(email).first<{ user_id: string }>();
  if (existing) throw new ApiError(409, "EMAIL_ALREADY_REGISTERED");
  const passwordHash = await hashPasswordVerifier(passwordCredential, currentPasswordPepper(env));
  const userId = crypto.randomUUID();
  const now = isoNow();
  const privacyRegime = country === "US" ? "US_STATE_PRIVACY"
    : ["DE", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "ES", "FI", "FR", "GR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK"].includes(country)
      ? "EU_GDPR" : "GLOBAL_BASELINE";
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user_profiles (
      appwrite_user_id, email, display_name, email_verified, account_status,
      age_status, jurisdiction_code, last_active_at, country_code, region_code,
      privacy_regime, privacy_notice_version, privacy_notice_acknowledged_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, 0, 'EMAIL_PENDING', 'NOT_STARTED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, email, name, country === "US" ? `US-${region || "UNSPECIFIED"}` : country,
        now, country, region, privacyRegime,
        typeof body.privacyNoticeVersion === "string" ? body.privacyNoticeVersion.slice(0, 64) : "CURRENT",
        now, now, now),
    env.DB.prepare(`INSERT INTO auth_accounts (
      user_id, email, password_hash, password_salt, password_iterations,
      password_pepper_version, role, mfa_required, migration_required,
      password_changed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'USER', 0, 0, ?, ?, ?)`)
      .bind(userId, email, passwordHash, passwordCredential.salt,
        passwordCredential.iterations, currentPasswordPepperVersion(env), now, now, now),
  ]);
  const session = await createSession(env, userId, request, "ACTIVE");
  const verification = await issueActionToken(env, {
    userId, purpose: "VERIFY_EMAIL", locale: locale(body.locale), name,
  });
  const identity = await authenticateUser(new Request(request.url, {
    headers: { Cookie: `${SESSION_COOKIE}${session.token}` },
  }), env);
  return { user: publicUser(identity), session, verification };
}

async function login(request: Request, env: AuthEnv): Promise<{ payload: Record<string, unknown>; session: { token: string; expiresAt: string } }> {
  const body = await readJsonBody<Record<string, unknown>>(request, 8192);
  const email = normalizeEmail(body.email);
  const passwordVerifier = typeof body.passwordVerifier === "string" ? body.passwordVerifier : "";
  const row = await env.DB.prepare(`
    SELECT a.user_id, a.password_hash, a.password_salt, a.password_iterations,
      a.mfa_enabled, a.migration_required, a.failed_login_count, a.locked_until,
      a.password_pepper_version,
      p.account_status
    FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id = a.user_id
    WHERE a.email = ? COLLATE NOCASE
  `).bind(email).first<{
    user_id: string; password_hash: string | null; password_salt: string | null;
    password_iterations: number; mfa_enabled: number; migration_required: number;
    failed_login_count: number; locked_until: string | null; account_status: string;
    password_pepper_version: string;
  }>();
  if (!row) throw new ApiError(401, "INVALID_EMAIL_OR_PASSWORD");
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) throw new ApiError(429, "LOGIN_TEMPORARILY_LOCKED");
  if (!row.password_hash || !row.password_salt || row.migration_required === 1) {
    throw new ApiError(409, "PASSWORD_MIGRATION_REQUIRED");
  }
  const valid = await verifyPasswordVerifier(
    passwordVerifier,
    row.password_hash,
    row.password_salt,
    row.password_iterations,
    passwordPepperForVersion(env, row.password_pepper_version),
  );
  if (!valid) {
    const failures = row.failed_login_count + 1;
    const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await env.DB.prepare(`UPDATE auth_accounts SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE user_id = ?`)
      .bind(failures >= 5 ? 0 : failures, lockedUntil, isoNow(), row.user_id).run();
    throw new ApiError(401, "INVALID_EMAIL_OR_PASSWORD");
  }
  if (row.account_status === "RESTRICTED") throw new ApiError(403, "ACCOUNT_RESTRICTED");
  if (row.account_status === "DELETION_PENDING" || row.account_status === "DELETED") throw new ApiError(403, "ACCOUNT_DELETION_PENDING");
  const currentPepperVersion = currentPasswordPepperVersion(env);
  if (row.password_pepper_version !== currentPepperVersion) {
    const upgradedHash = await hashPasswordVerifier(
      { verifier: passwordVerifier, salt: row.password_salt, iterations: row.password_iterations },
      currentPasswordPepper(env),
    );
    await env.DB.prepare(`UPDATE auth_accounts SET password_hash = ?, password_pepper_version = ?,
      failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?`)
      .bind(upgradedHash, currentPepperVersion, isoNow(), row.user_id).run();
  } else {
    await env.DB.prepare(`UPDATE auth_accounts SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?`)
      .bind(isoNow(), row.user_id).run();
  }
  const state = row.mfa_enabled === 1 ? "MFA_PENDING" : "ACTIVE";
  const session = await createSession(env, row.user_id, request, state);
  return {
    payload: state === "MFA_PENDING"
      ? { mfaRequired: true, challenge: { $id: session.id } }
      : { session: { $id: session.id }, sessionReady: true },
    session,
  };
}

interface EmailTokenRow {
  id: string; user_id: string; purpose: TokenPurpose; pending_email: string | null;
  code_sha256: string | null; code_pepper_version: string | null; code_attempts: number;
}

async function confirmEmail(request: Request, env: AuthEnv): Promise<{
  payload: Record<string, unknown>;
  session?: { token: string; expiresAt: string };
}> {
  requireIdempotencyKey(request);
  const body = await readJsonBody<Record<string, unknown>>(request, 8192);
  const isCode = typeof body.code === "string";
  const now = isoNow();
  let row: EmailTokenRow | null;
  let codeHash: string | null = null;
  let tokenHash: string | null = null;
  if (isCode) {
    const identity = await requireSession(request, env);
    if (identity.emailVerified) throw new ApiError(409, "EMAIL_ALREADY_VERIFIED");
    if (!/^\d{6}$/.test(body.code as string)) throw new ApiError(400, "EMAIL_VERIFICATION_CODE_INVALID_OR_EXPIRED");
    row = await env.DB.prepare(`SELECT id, user_id, purpose, pending_email, code_sha256,
        code_pepper_version, code_attempts FROM auth_action_tokens
      WHERE user_id = ? AND purpose = 'VERIFY_EMAIL' AND used_at IS NULL AND expires_at > ?
        AND pending_email = ? COLLATE NOCASE AND code_sha256 IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`).bind(identity.userId, now, identity.email).first<EmailTokenRow>();
    if (!row) throw new ApiError(400, "EMAIL_VERIFICATION_CODE_INVALID_OR_EXPIRED");
    if (row.code_attempts >= VERIFICATION_MAX_ATTEMPTS) throw new ApiError(429, "EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED");
    codeHash = await verificationCodeHash(env, row.user_id, row.id, body.code as string, row.code_pepper_version!);
  } else {
    if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw new ApiError(400, "INVALID_AUTH_TOKEN");
    tokenHash = await sha256Hex(body.token);
    row = await env.DB.prepare(`SELECT id, user_id, purpose, pending_email, code_sha256,
        code_pepper_version, code_attempts FROM auth_action_tokens
      WHERE token_sha256 = ? AND purpose IN ('VERIFY_EMAIL', 'CHANGE_EMAIL')
        AND used_at IS NULL AND expires_at > ?`).bind(tokenHash, now).first<EmailTokenRow>();
    if (!row) throw new ApiError(400, "AUTH_TOKEN_INVALID_OR_EXPIRED");
  }
  const consumptionId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = randomBase64Url(32);
  const sessionHash = await sha256Hex(sessionToken);
  const days = parsePositiveInt(env.SESSION_DAYS, 30, 90);
  const activeExpiry = new Date(Date.now() + days * 86_400_000).toISOString();
  const pendingExpiry = new Date(Date.now() + 10 * 60_000).toISOString();
  const device = request.headers.get("X-Device-Token");
  const deviceHash = device && /^[A-Za-z0-9_-]{43}$/.test(device) ? await sha256Hex(device) : null;
  // Every mutation below is conditional on this request's unique consumption ID.
  // D1 batch executes as one transaction, so a stale read, replay, concurrent
  // guess or resend can neither verify an account nor mint a second session.
  const eligible = `EXISTS (
    SELECT 1 FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id = a.user_id
    WHERE a.user_id = auth_action_tokens.user_id AND p.account_status IN ('ACTIVE', 'EMAIL_PENDING')
      AND (auth_action_tokens.purpose = 'CHANGE_EMAIL' OR (p.email_verified = 0
        AND (auth_action_tokens.pending_email IS NULL OR auth_action_tokens.pending_email = a.email COLLATE NOCASE)))
  )`;
  const consumed = `EXISTS (SELECT 1 FROM auth_action_tokens WHERE id = ? AND consumed_by = ? AND used_at IS NOT NULL)`;
  const claim = isCode
    ? env.DB.prepare(`UPDATE auth_action_tokens SET code_attempts = code_attempts + 1,
        used_at = CASE WHEN code_sha256 = ? THEN ? ELSE used_at END,
        consumed_by = CASE WHEN code_sha256 = ? THEN ? ELSE consumed_by END
      WHERE id = ? AND user_id = ? AND purpose = 'VERIFY_EMAIL'
        AND used_at IS NULL AND expires_at > ? AND code_attempts < ? AND ${eligible}
      RETURNING consumed_by, code_attempts`)
      .bind(codeHash, now, codeHash, consumptionId, row.id, row.user_id, now, VERIFICATION_MAX_ATTEMPTS)
    : env.DB.prepare(`UPDATE auth_action_tokens SET used_at = ?, consumed_by = ?
      WHERE id = ? AND token_sha256 = ? AND purpose IN ('VERIFY_EMAIL', 'CHANGE_EMAIL')
        AND used_at IS NULL AND expires_at > ? AND ${eligible}
      RETURNING consumed_by, code_attempts`).bind(now, consumptionId, row.id, tokenHash, now);
  const statements = [claim];
  if (row.purpose === "CHANGE_EMAIL") {
    const email = normalizeEmail(row.pending_email);
    statements.push(env.DB.prepare(`UPDATE auth_accounts SET email = ?, updated_at = ?
      WHERE user_id = ? AND ${consumed}`).bind(email, now, row.user_id, row.id, consumptionId));
    statements.push(env.DB.prepare(`UPDATE user_profiles SET email = ?, email_verified = 1,
      account_status = CASE WHEN account_status = 'EMAIL_PENDING' THEN 'ACTIVE' ELSE account_status END,
      updated_at = ?, version = version + 1 WHERE appwrite_user_id = ? AND ${consumed}`)
      .bind(email, now, row.user_id, row.id, consumptionId));
  } else {
    statements.push(env.DB.prepare(`UPDATE user_profiles SET email_verified = 1,
      account_status = CASE WHEN account_status = 'EMAIL_PENDING' THEN 'ACTIVE' ELSE account_status END,
      updated_at = ?, version = version + 1 WHERE appwrite_user_id = ? AND ${consumed}`)
      .bind(now, row.user_id, row.id, consumptionId));
  }
  // Revoke the pre-verification session, then issue a fresh HttpOnly session.
  // Existing MFA never becomes an ACTIVE session merely through email access.
  statements.push(env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'EMAIL_VERIFIED'
    WHERE user_id = ? AND revoked_at IS NULL AND ${consumed}`).bind(now, row.user_id, row.id, consumptionId));
  statements.push(env.DB.prepare(`INSERT INTO auth_sessions (
    id, user_id, token_sha256, state, device_id, created_at, last_seen_at, expires_at, user_agent_label
  ) SELECT ?, a.user_id, ?, CASE WHEN a.mfa_enabled = 1 THEN 'MFA_PENDING' ELSE 'ACTIVE' END,
      ?, ?, ?, CASE WHEN a.mfa_enabled = 1 THEN ? ELSE ? END, ?
    FROM auth_accounts a WHERE a.user_id = ? AND ${consumed}
      AND NOT (a.mfa_enabled = 0 AND (a.role = 'ADMIN' OR a.mfa_required = 1))`)
    .bind(sessionId, sessionHash, deviceHash, now, now, pendingExpiry, activeExpiry,
      (request.headers.get("User-Agent") ?? "Browser").slice(0, 160), row.user_id, row.id, consumptionId));
  const results = await env.DB.batch(statements);
  const claimed = results[0]?.results?.[0] as { consumed_by: string | null; code_attempts: number } | undefined;
  if (claimed?.consumed_by !== consumptionId) {
    if (isCode && claimed && claimed.code_attempts >= VERIFICATION_MAX_ATTEMPTS) {
      throw new ApiError(429, "EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED");
    }
    throw new ApiError(400, isCode ? "EMAIL_VERIFICATION_CODE_INVALID_OR_EXPIRED" : "AUTH_TOKEN_INVALID_OR_EXPIRED");
  }
  const session = await env.DB.prepare(`SELECT state, expires_at FROM auth_sessions WHERE id = ?`)
    .bind(sessionId).first<{ state: string; expires_at: string }>();
  if (!session) return { payload: { ok: true, emailVerified: true, sessionReady: false, loginRequired: true } };
  if (session.state === "MFA_PENDING") return {
    payload: { ok: true, emailVerified: true, sessionReady: false, mfaRequired: true, challenge: { $id: sessionId } },
    session: { token: sessionToken, expiresAt: session.expires_at },
  };
  const identity = await authenticateUser(new Request(request.url, {
    headers: { Cookie: `${SESSION_COOKIE}${sessionToken}` },
  }), env);
  return {
    payload: { ok: true, emailVerified: true, sessionReady: true, session: { $id: sessionId }, user: publicUser(identity) },
    session: { token: sessionToken, expiresAt: session.expires_at },
  };
}

async function actionToken(
  request: Request,
  env: AuthEnv,
  purpose: "RESET_PASSWORD",
): Promise<Record<string, unknown>> {
  requireIdempotencyKey(request);
  const body = await readJsonBody<Record<string, unknown>>(request, 8192);
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(400, "INVALID_AUTH_TOKEN");
  const now = isoNow();
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT id, user_id FROM auth_action_tokens
    WHERE token_sha256 = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(tokenHash, purpose, now).first<{ id: string; user_id: string }>();
  if (!row) throw new ApiError(400, "AUTH_TOKEN_INVALID_OR_EXPIRED");
  const passwordCredential = validatePasswordVerifierCredential(body.passwordCredential);
  const passwordHash = await hashPasswordVerifier(passwordCredential, currentPasswordPepper(env));
  const consumptionId = crypto.randomUUID();
  const consumed = `EXISTS (SELECT 1 FROM auth_action_tokens WHERE id = ? AND consumed_by = ?)`;
  let results: D1Result[];
  try {
    results = await env.DB.batch([
      env.DB.prepare(`UPDATE auth_action_tokens SET used_at = ?, consumed_by = ?
        WHERE id = ? AND token_sha256 = ? AND purpose = 'RESET_PASSWORD'
          AND used_at IS NULL AND expires_at > ? RETURNING id`)
        .bind(now, consumptionId, row.id, tokenHash, now),
      env.DB.prepare(`UPDATE auth_accounts SET password_hash = ?, password_salt = ?,
        password_iterations = ?, migration_required = 0, password_changed_at = ?,
        password_pepper_version = ?, failed_login_count = 0, locked_until = NULL,
        updated_at = ? WHERE user_id = ? AND ${consumed}`)
        .bind(passwordHash, passwordCredential.salt, passwordCredential.iterations, now,
          currentPasswordPepperVersion(env), now, row.user_id, row.id, consumptionId),
      env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'PASSWORD_RESET'
        WHERE user_id = ? AND revoked_at IS NULL AND ${consumed}`)
        .bind(now, row.user_id, row.id, consumptionId),
    ]);
  } catch {
    throw new ApiError(503, "PASSWORD_RESET_PERSISTENCE_FAILED");
  }
  if (!results[0]?.results?.length) throw new ApiError(400, "AUTH_TOKEN_INVALID_OR_EXPIRED");
  return { ok: true };
}

async function requireSession(request: Request, env: AuthEnv): Promise<AuthenticatedIdentity> {
  return authenticateUser(request, env);
}

async function mfaStatus(request: Request, env: AuthEnv): Promise<Record<string, unknown>> {
  const identity = await requireSession(request, env);
  const row = await env.DB.prepare(`SELECT mfa_required, mfa_enabled, totp_secret_ciphertext
    FROM auth_accounts WHERE user_id = ?`).bind(identity.userId).first<{
      mfa_required: number; mfa_enabled: number; totp_secret_ciphertext: string | null;
    }>();
  return {
    enabled: row?.mfa_enabled === 1,
    required: row?.mfa_required === 1,
    factors: { totp: Boolean(row?.totp_secret_ciphertext), recoveryCode: row?.mfa_enabled === 1 },
    user: publicUser(identity),
  };
}

async function startMfa(request: Request, env: AuthEnv): Promise<Record<string, unknown>> {
  const identity = await requireSession(request, env);
  const secret = createTotpSecret();
  const encrypted = await encryptTotpSecret(secret, currentEncryptionKey(env));
  await env.DB.prepare(`UPDATE auth_accounts SET totp_secret_ciphertext = ?, totp_key_version = ?,
    mfa_enabled = 0, updated_at = ? WHERE user_id = ?`)
    .bind(encrypted, currentEncryptionKeyVersion(env), isoNow(), identity.userId).run();
  const issuer = encodeURIComponent("The Order of Shadows");
  const account = encodeURIComponent(identity.email);
  return { secret, uri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
}

async function confirmMfa(request: Request, env: AuthEnv): Promise<Record<string, unknown>> {
  const identity = await requireSession(request, env);
  const body = await readJsonBody<Record<string, unknown>>(request, 4096);
  const otp = typeof body.otp === "string" ? body.otp.replace(/\s/g, "") : "";
  const row = await env.DB.prepare(`SELECT totp_secret_ciphertext, totp_key_version FROM auth_accounts WHERE user_id = ?`)
    .bind(identity.userId).first<{ totp_secret_ciphertext: string | null; totp_key_version: string }>();
  if (!row?.totp_secret_ciphertext) throw new ApiError(409, "MFA_ENROLLMENT_NOT_STARTED");
  const secret = await decryptTotpSecret(
    row.totp_secret_ciphertext,
    encryptionKeyForVersion(env, row.totp_key_version),
  );
  if (!await verifyTotp(secret, otp)) throw new ApiError(400, "INVALID_MFA_CODE");
  const codes = createRecoveryCodes();
  const now = isoNow();
  const statements = [
    env.DB.prepare(`DELETE FROM auth_recovery_codes WHERE user_id = ?`).bind(identity.userId),
    env.DB.prepare(`UPDATE auth_accounts SET mfa_enabled = 1, updated_at = ? WHERE user_id = ?`).bind(now, identity.userId),
  ];
  for (const code of codes) {
    statements.push(env.DB.prepare(`INSERT INTO auth_recovery_codes (id, user_id, code_sha256, created_at)
      VALUES (?, ?, ?, ?)`).bind(crypto.randomUUID(), identity.userId, await hashRecoveryCode(code), now));
  }
  await env.DB.batch(statements);
  const refreshed = await requireSession(request, env);
  return { user: publicUser({ ...refreshed, mfaEnabled: true }), recoveryCodes: codes };
}

async function completeMfa(request: Request, env: AuthEnv): Promise<Record<string, unknown>> {
  const rawToken = cookieToken(request);
  if (!rawToken) throw new ApiError(401, "MFA_CHALLENGE_REQUIRED");
  const body = await readJsonBody<Record<string, unknown>>(request, 4096);
  const otp = typeof body.otp === "string" ? body.otp.trim().toUpperCase() : "";
  const now = isoNow();
  const row = await env.DB.prepare(`
    SELECT s.id, s.user_id, a.totp_secret_ciphertext, a.totp_key_version
    FROM auth_sessions s JOIN auth_accounts a ON a.user_id = s.user_id
    WHERE s.token_sha256 = ? AND s.state = 'MFA_PENDING'
      AND s.revoked_at IS NULL AND s.expires_at > ?
  `).bind(await sha256Hex(rawToken), now).first<{
    id: string; user_id: string; totp_secret_ciphertext: string | null; totp_key_version: string;
  }>();
  if (!row?.totp_secret_ciphertext) throw new ApiError(401, "MFA_CHALLENGE_REQUIRED");
  let valid = false;
  if (/^\d{6}$/.test(otp)) {
    valid = await verifyTotp(
      await decryptTotpSecret(
        row.totp_secret_ciphertext,
        encryptionKeyForVersion(env, row.totp_key_version),
      ), otp,
    );
  } else {
    const recoveryHash = await hashRecoveryCode(otp);
    const recovery = await env.DB.prepare(`SELECT id FROM auth_recovery_codes
      WHERE user_id = ? AND code_sha256 = ? AND used_at IS NULL`)
      .bind(row.user_id, recoveryHash).first<{ id: string }>();
    if (recovery) {
      valid = true;
      await env.DB.prepare(`UPDATE auth_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL`)
        .bind(now, recovery.id).run();
    }
  }
  if (!valid) throw new ApiError(400, "INVALID_MFA_CODE");
  const statements = [env.DB.prepare(`UPDATE auth_sessions SET state = 'ACTIVE', last_seen_at = ? WHERE id = ?`)
    .bind(now, row.id)];
  if (row.totp_key_version !== currentEncryptionKeyVersion(env)) {
    const secret = await decryptTotpSecret(
      row.totp_secret_ciphertext,
      encryptionKeyForVersion(env, row.totp_key_version),
    );
    statements.push(env.DB.prepare(`UPDATE auth_accounts SET totp_secret_ciphertext = ?,
      totp_key_version = ?, updated_at = ? WHERE user_id = ?`).bind(
      await encryptTotpSecret(secret, currentEncryptionKey(env)),
      currentEncryptionKeyVersion(env), now, row.user_id,
    ));
  }
  await env.DB.batch(statements);
  const identity = await requireSession(request, env);
  return { session: { $id: row.id }, user: publicUser(identity), sessionReady: true };
}

async function route(request: Request, env: AuthEnv): Promise<Response> {
  const origins = allowedOrigins(env.SITE_ORIGINS);
  const origin = enforceAllowedOrigin(request, origins);
  const correlationId = requestId(request);
  const url = new URL(request.url);
  await enforceRateLimit(env.AUTH_RATE_LIMITER, request.headers.get("CF-Connecting-IP") ?? "unknown");
  const response = (data: unknown, status = 200) => jsonResponse(data, { status, origin, origins, requestId: correlationId });

  if (request.method === "POST" && url.pathname === "/v1/register") {
    const created = await register(request, env);
    return setSessionCookie(response({
      user: created.user,
      session: { $id: created.session.id },
      sessionReady: true,
      verification: created.verification,
    }, 201), created.session.token,
    Math.max(0, Math.floor((Date.parse(created.session.expiresAt) - Date.now()) / 1000)));
  }
  if (request.method === "POST" && url.pathname === "/v1/login") {
    const result = await login(request, env);
    return setSessionCookie(response(result.payload), result.session.token,
      Math.max(0, Math.floor((Date.parse(result.session.expiresAt) - Date.now()) / 1000)));
  }
  if (request.method === "POST" && url.pathname === "/v1/password/material") {
    const body = await readJsonBody<Record<string, unknown>>(request, 4096);
    const email = normalizeEmail(body.email);
    const account = await env.DB.prepare(`SELECT password_salt, password_iterations
      FROM auth_accounts WHERE email = ? COLLATE NOCASE`).bind(email).first<{
        password_salt: string | null; password_iterations: number;
      }>();
    return response({
      salt: account?.password_salt && /^[A-Za-z0-9_-]{22}$/.test(account.password_salt)
        ? account.password_salt
        : await passwordMaterialSalt(email, currentPasswordPepper(env)),
      iterations: 600_000,
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/logout") {
    const token = cookieToken(request);
    if (token) await env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'LOGOUT'
      WHERE token_sha256 = ? AND revoked_at IS NULL`).bind(isoNow(), await sha256Hex(token)).run();
    return clearSessionCookie(response({ ok: true }));
  }
  if (request.method === "GET" && url.pathname === "/v1/account") {
    return response(publicUser(await requireSession(request, env)));
  }
  if (request.method === "GET" && url.pathname === "/v1/sessions") {
    const identity = await requireSession(request, env);
    const currentHash = await sha256Hex(cookieToken(request)!);
    const rows = await env.DB.prepare(`SELECT id, created_at, last_seen_at, expires_at,
      user_agent_label, token_sha256 FROM auth_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND state = 'ACTIVE' AND expires_at > ?
      ORDER BY last_seen_at DESC LIMIT 10`).bind(identity.userId, isoNow()).all<Record<string, unknown>>();
    return response({ sessions: (rows.results ?? []).map((row) => ({
      $id: row.id, id: row.id, $createdAt: row.created_at, $updatedAt: row.last_seen_at,
      expire: row.expires_at, clientName: row.user_agent_label, current: row.token_sha256 === currentHash,
    })) });
  }
  const sessionPath = /^\/v1\/sessions\/([0-9a-f-]{36}|current)$/i.exec(url.pathname);
  if (request.method === "DELETE" && sessionPath) {
    const identity = await requireSession(request, env);
    const token = cookieToken(request)!;
    const id = sessionPath[1] === "current" ? null : sessionPath[1];
    await env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'USER_REVOKED'
      WHERE user_id = ? AND revoked_at IS NULL AND ${id ? "id = ?" : "token_sha256 = ?"}`)
      .bind(isoNow(), identity.userId, id ?? await sha256Hex(token)).run();
    const result = response({ ok: true });
    return id ? result : clearSessionCookie(result);
  }
  if (request.method === "POST" && url.pathname === "/v1/email-verification/request") {
    requireIdempotencyKey(request);
    const identity = await requireSession(request, env);
    const body = await readJsonBody<Record<string, unknown>>(request, 4096);
    if (identity.emailVerified) throw new ApiError(409, "EMAIL_ALREADY_VERIFIED");
    const verification = await issueActionToken(env, { userId: identity.userId, purpose: "VERIFY_EMAIL", locale: locale(body.locale), name: identity.displayName });
    return response({ accepted: true, verification });
  }
  if (request.method === "POST" && url.pathname === "/v1/email-verification/confirm") {
    const result = await confirmEmail(request, env);
    const confirmed = response(result.payload);
    return result.session ? setSessionCookie(confirmed, result.session.token,
      Math.max(0, Math.floor((Date.parse(result.session.expiresAt) - Date.now()) / 1000))) : confirmed;
  }
  if (request.method === "POST" && url.pathname === "/v1/password-reset/request") {
    requireIdempotencyKey(request);
    const body = await readJsonBody<Record<string, unknown>>(request, 4096);
    const email = normalizeEmail(body.email);
    const account = await env.DB.prepare(`SELECT a.user_id, p.display_name FROM auth_accounts a
      JOIN user_profiles p ON p.appwrite_user_id = a.user_id WHERE a.email = ? COLLATE NOCASE
        AND p.account_status IN ('ACTIVE', 'EMAIL_PENDING')`)
      .bind(email).first<{ user_id: string; display_name: string }>();
    if (account) await issueActionToken(env, { userId: account.user_id, purpose: "RESET_PASSWORD", locale: locale(body.locale), name: account.display_name });
    return response({ accepted: true });
  }
  if (request.method === "POST" && url.pathname === "/v1/password-reset/confirm") {
    return response(await actionToken(request, env, "RESET_PASSWORD"));
  }
  if (request.method === "PATCH" && url.pathname === "/v1/account/email") {
    requireIdempotencyKey(request);
    const identity = await requireSession(request, env);
    const body = await readJsonBody<Record<string, unknown>>(request, 8192);
    const newEmail = normalizeEmail(body.email);
    const account = await env.DB.prepare(`SELECT password_hash, password_salt, password_iterations,
      password_pepper_version FROM auth_accounts WHERE user_id = ?`)
      .bind(identity.userId).first<{ password_hash: string; password_salt: string;
        password_iterations: number; password_pepper_version: string }>();
    if (!account || !await verifyPasswordVerifier(
      body.passwordVerifier,
      account.password_hash,
      account.password_salt,
      account.password_iterations,
      passwordPepperForVersion(env, account.password_pepper_version),
    )) {
      throw new ApiError(401, "CURRENT_PASSWORD_INCORRECT");
    }
    const duplicate = await env.DB.prepare(`SELECT user_id FROM auth_accounts WHERE email = ? COLLATE NOCASE AND user_id <> ?`)
      .bind(newEmail, identity.userId).first();
    if (duplicate) throw new ApiError(409, "EMAIL_ALREADY_REGISTERED");
    await issueActionToken(env, { userId: identity.userId, purpose: "CHANGE_EMAIL", pendingEmail: newEmail, locale: locale(body.locale), name: identity.displayName });
    return response({ accepted: true, verificationRequired: true });
  }
  if (request.method === "GET" && url.pathname === "/v1/mfa") return response(await mfaStatus(request, env));
  if (request.method === "POST" && url.pathname === "/v1/mfa/enrollment") return response(await startMfa(request, env));
  if (request.method === "POST" && url.pathname === "/v1/mfa/enrollment/confirm") return response(await confirmMfa(request, env));
  if (request.method === "POST" && url.pathname === "/v1/mfa/challenge") return response({ $id: cookieToken(request) ? "current" : null });
  if (request.method === "POST" && url.pathname === "/v1/mfa/challenge/confirm") return response(await completeMfa(request, env));
  if (request.method === "DELETE" && url.pathname === "/v1/mfa") {
    const identity = await requireSession(request, env);
    const account = await env.DB.prepare(`SELECT mfa_required FROM auth_accounts WHERE user_id = ?`).bind(identity.userId).first<{ mfa_required: number }>();
    if (account?.mfa_required === 1) throw new ApiError(403, "ADMIN_MFA_REQUIRED");
    await env.DB.batch([
      env.DB.prepare(`UPDATE auth_accounts SET mfa_enabled = 0, totp_secret_ciphertext = NULL, updated_at = ? WHERE user_id = ?`).bind(isoNow(), identity.userId),
      env.DB.prepare(`DELETE FROM auth_recovery_codes WHERE user_id = ?`).bind(identity.userId),
    ]);
    return response(publicUser({ ...identity, mfaEnabled: false }));
  }
  throw new ApiError(404, "NOT_FOUND");
}

export default {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const origins = allowedOrigins(env.SITE_ORIGINS);
    const origin = request.headers.get("Origin");
    const correlationId = requestId(request);
    try {
      return await route(request, env);
    } catch (error) {
      logEvent(error instanceof ApiError && error.status < 500 ? "warn" : "error", "auth_request_failed", {
        code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
        path: new URL(request.url).pathname,
        requestId: correlationId,
      });
      return errorResponse(error, {
        origin: origin && origins.has(origin) ? origin : null,
        origins,
        requestId: correlationId,
      });
    }
  },
} satisfies ExportedHandler<AuthEnv>;
