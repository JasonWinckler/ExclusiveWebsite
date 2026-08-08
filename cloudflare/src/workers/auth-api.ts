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
  hashPassword,
  randomBase64Url,
  sha256Hex,
  validateDeviceToken,
  validatePassword,
  verifyPassword,
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

function authMail(input: {
  locale: Locale;
  purpose: TokenPurpose;
  name: string;
  actionUrl: string;
}): { subject: string; html: string } {
  const de = input.locale === "de";
  const title = input.purpose === "RESET_PASSWORD"
    ? (de ? "Passwort sicher festlegen" : "Set your password securely")
    : input.purpose === "CHANGE_EMAIL"
      ? (de ? "Neue E-Mail-Adresse bestätigen" : "Confirm your new email address")
      : (de ? "E-Mail-Adresse bestätigen" : "Confirm your email address");
  const action = input.purpose === "RESET_PASSWORD"
    ? (de ? "Passwort festlegen" : "Set password")
    : (de ? "E-Mail bestätigen" : "Confirm email");
  const copy = input.purpose === "RESET_PASSWORD"
    ? (de ? "Der Link ist einmalig und 60 Minuten gültig. Danach kannst du dich direkt wieder anmelden."
      : "This single-use link is valid for 60 minutes. You can sign in immediately afterwards.")
    : (de ? "Bestätige deine Adresse über den sicheren, einmalig nutzbaren Link."
      : "Confirm your address through this secure, single-use link.");
  return {
    subject: `${title} · Shadow's Temptation`,
    html: `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#100205;color:#f8eee7;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="640" style="max-width:640px;background:#21070d;border:1px solid #6d2432;border-radius:24px;overflow:hidden"><tr><td><img src="cid:shadow-brand-banner" width="640" alt="Shadow's Temptation" style="display:block;width:100%;height:auto"></td></tr><tr><td style="padding:34px"><p style="color:#e6c77c;letter-spacing:3px;font-size:11px;font-weight:bold">SHADOW'S TEMPTATION</p><h1 style="font-family:Georgia,serif;font-size:38px;font-weight:normal;color:#fff6e8">${title}</h1><p style="font-size:16px;line-height:1.7;color:#d8c4bd">${de ? "Hallo" : "Hello"} ${input.name || "Member"},<br>${copy}</p><p style="text-align:center;margin:30px 0"><a href="${input.actionUrl}" style="display:inline-block;padding:16px 28px;border-radius:999px;background:#c83a22;color:#fff;text-decoration:none;font-weight:bold">${action} →</a></p><p style="font-size:12px;line-height:1.6;color:#9f8e89">${de ? "Nicht angefordert? Ignoriere diese Nachricht. Dein Konto bleibt unverändert." : "Did not request this? Ignore this message. Your account remains unchanged."}</p></td></tr><tr><td style="padding:20px 34px;background:#0d0204;color:#968681;font-size:12px">Shadow's Temptation · Desire lives in the shadows.<br><a href="https://exclusive.jason-shadow.com/legal/" style="color:#e6c77c">Legal & Privacy</a> · <a href="mailto:info@exclusive.jason-shadow.com" style="color:#e6c77c">Support</a></td></tr></table></td></tr></table></body></html>`,
  };
}

async function issueActionToken(
  env: AuthEnv,
  input: { userId: string; purpose: TokenPurpose; locale: Locale; pendingEmail?: string | null; name: string },
): Promise<void> {
  const token = randomBase64Url(32);
  const now = isoNow();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_action_tokens
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL`).bind(input.userId, input.purpose),
    env.DB.prepare(`INSERT INTO auth_action_tokens (
      id, user_id, purpose, token_sha256, pending_email, locale,
      expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, input.userId, input.purpose, await sha256Hex(token),
      input.pendingEmail ?? null, input.locale, expiresAt, now,
    ),
  ]);
  const action = input.purpose === "RESET_PASSWORD" ? "recover" : "verify-email";
  const actionUrl = `https://exclusive.jason-shadow.com/?action=${action}&token=${encodeURIComponent(token)}`;
  const email = authMail({ ...input, actionUrl });
  await sendTransactionalEmail(env.IDENTITY_PROJECTION, env.AUTH_EMAIL_SERVICE_SECRET, {
    userId: input.userId,
    messageId: id,
    subject: email.subject,
    html: email.html,
  });
}

async function register(request: Request, env: AuthEnv): Promise<{
  user: Record<string, unknown>;
  session: { id: string; token: string; expiresAt: string };
}> {
  const idempotencyKey = requireIdempotencyKey(request);
  const body = await readJsonBody<Record<string, unknown>>(request, 16_384);
  const email = normalizeEmail(body.email);
  const name = normalizeName(body.name);
  const password = validatePassword(body.password);
  if (body.privacyNoticeAccepted !== true) throw new ApiError(400, "PRIVACY_NOTICE_ACCEPTANCE_REQUIRED");
  const country = typeof body.countryCode === "string" ? body.countryCode.toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(country)) throw new ApiError(400, "COUNTRY_REQUIRED");
  const region = country === "US" && typeof body.regionCode === "string"
    ? body.regionCode.toUpperCase().slice(0, 3) : null;
  const existing = await env.DB.prepare(`SELECT user_id FROM auth_accounts WHERE email = ? COLLATE NOCASE`)
    .bind(email).first<{ user_id: string }>();
  if (existing) throw new ApiError(409, "EMAIL_ALREADY_REGISTERED");
  const passwordRecord = await hashPassword(password);
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
      role, mfa_required, migration_required, password_changed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'USER', 0, 0, ?, ?, ?)`)
      .bind(userId, email, passwordRecord.hash, passwordRecord.salt,
        passwordRecord.iterations, now, now, now),
  ]);
  const session = await createSession(env, userId, request, "ACTIVE");
  try {
    await issueActionToken(env, { userId, purpose: "VERIFY_EMAIL", locale: locale(body.locale), name });
  } catch (error) {
    logEvent("error", "registration_verification_email_failed", {
      userId,
      code: error instanceof ApiError ? error.code : "EMAIL_DELIVERY_FAILED",
    });
  }
  const identity = await authenticateUser(new Request(request.url, {
    headers: { Cookie: `${SESSION_COOKIE}${session.token}` },
  }), { ...env, AUTH_MODE: "CLOUDFLARE_ONLY" });
  return { user: publicUser(identity), session };
}

async function login(request: Request, env: AuthEnv): Promise<{ payload: Record<string, unknown>; session: { token: string; expiresAt: string } }> {
  const body = await readJsonBody<Record<string, unknown>>(request, 8192);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const row = await env.DB.prepare(`
    SELECT a.user_id, a.password_hash, a.password_salt, a.password_iterations,
      a.mfa_enabled, a.migration_required, a.failed_login_count, a.locked_until,
      p.account_status
    FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id = a.user_id
    WHERE a.email = ? COLLATE NOCASE
  `).bind(email).first<{
    user_id: string; password_hash: string | null; password_salt: string | null;
    password_iterations: number; mfa_enabled: number; migration_required: number;
    failed_login_count: number; locked_until: string | null; account_status: string;
  }>();
  if (!row) throw new ApiError(401, "INVALID_EMAIL_OR_PASSWORD");
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) throw new ApiError(429, "LOGIN_TEMPORARILY_LOCKED");
  if (!row.password_hash || !row.password_salt || row.migration_required === 1) {
    throw new ApiError(409, "PASSWORD_MIGRATION_REQUIRED");
  }
  const valid = await verifyPassword(password, row.password_hash, row.password_salt, row.password_iterations);
  if (!valid) {
    const failures = row.failed_login_count + 1;
    const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await env.DB.prepare(`UPDATE auth_accounts SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE user_id = ?`)
      .bind(failures >= 5 ? 0 : failures, lockedUntil, isoNow(), row.user_id).run();
    throw new ApiError(401, "INVALID_EMAIL_OR_PASSWORD");
  }
  if (row.account_status === "RESTRICTED") throw new ApiError(403, "ACCOUNT_RESTRICTED");
  if (row.account_status === "DELETION_PENDING" || row.account_status === "DELETED") throw new ApiError(403, "ACCOUNT_DELETION_PENDING");
  await env.DB.prepare(`UPDATE auth_accounts SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?`)
    .bind(isoNow(), row.user_id).run();
  const state = row.mfa_enabled === 1 ? "MFA_PENDING" : "ACTIVE";
  const session = await createSession(env, row.user_id, request, state);
  return {
    payload: state === "MFA_PENDING"
      ? { mfaRequired: true, challenge: { $id: session.id } }
      : { session: { $id: session.id }, sessionReady: true },
    session,
  };
}

async function actionToken(
  request: Request,
  env: AuthEnv,
  purpose: TokenPurpose | "EMAIL_CONFIRM",
): Promise<Record<string, unknown>> {
  requireIdempotencyKey(request);
  const body = await readJsonBody<Record<string, unknown>>(request, 8192);
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(400, "INVALID_AUTH_TOKEN");
  const now = isoNow();
  const row = await env.DB.prepare(`
    SELECT id, user_id, purpose, pending_email FROM auth_action_tokens
    WHERE token_sha256 = ?
      AND ((? = 'EMAIL_CONFIRM' AND purpose IN ('VERIFY_EMAIL', 'CHANGE_EMAIL')) OR purpose = ?)
      AND used_at IS NULL AND expires_at > ?
  `).bind(await sha256Hex(token), purpose, purpose, now).first<{
    id: string; user_id: string; purpose: TokenPurpose; pending_email: string | null;
  }>();
  if (!row) throw new ApiError(400, "AUTH_TOKEN_INVALID_OR_EXPIRED");
  if (row.purpose === "RESET_PASSWORD") {
    const password = validatePassword(body.password);
    const record = await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare(`UPDATE auth_accounts SET password_hash = ?, password_salt = ?,
        password_iterations = ?, migration_required = 0, password_changed_at = ?,
        failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?`)
        .bind(record.hash, record.salt, record.iterations, now, now, row.user_id),
      env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'PASSWORD_RESET'
        WHERE user_id = ? AND revoked_at IS NULL`).bind(now, row.user_id),
      env.DB.prepare(`UPDATE auth_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL`)
        .bind(now, row.id),
    ]);
  } else {
    const email = row.purpose === "CHANGE_EMAIL" ? normalizeEmail(row.pending_email) : null;
    const statements = email
      ? [
        env.DB.prepare(`UPDATE auth_accounts SET email = ?, updated_at = ? WHERE user_id = ?`).bind(email, now, row.user_id),
        env.DB.prepare(`UPDATE user_profiles SET email = ?, email_verified = 1, updated_at = ?, version = version + 1 WHERE appwrite_user_id = ?`).bind(email, now, row.user_id),
        env.DB.prepare(`UPDATE auth_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL`).bind(now, row.id),
      ]
      : [
        env.DB.prepare(`UPDATE user_profiles SET email_verified = 1,
          account_status = CASE WHEN account_status = 'EMAIL_PENDING' THEN 'ACTIVE' ELSE account_status END,
          updated_at = ?, version = version + 1 WHERE appwrite_user_id = ?`).bind(now, row.user_id),
        env.DB.prepare(`UPDATE auth_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL`).bind(now, row.id),
      ];
    await env.DB.batch(statements);
  }
  return { ok: true };
}

async function requireSession(request: Request, env: AuthEnv): Promise<AuthenticatedIdentity> {
  return authenticateUser(request, { ...env, AUTH_MODE: "CLOUDFLARE_ONLY" });
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
  const encrypted = await encryptTotpSecret(secret, env.AUTH_ENCRYPTION_KEY);
  await env.DB.prepare(`UPDATE auth_accounts SET totp_secret_ciphertext = ?, mfa_enabled = 0, updated_at = ? WHERE user_id = ?`)
    .bind(encrypted, isoNow(), identity.userId).run();
  const issuer = encodeURIComponent("Shadow's Temptation");
  const account = encodeURIComponent(identity.email);
  return { secret, uri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
}

async function confirmMfa(request: Request, env: AuthEnv): Promise<Record<string, unknown>> {
  const identity = await requireSession(request, env);
  const body = await readJsonBody<Record<string, unknown>>(request, 4096);
  const otp = typeof body.otp === "string" ? body.otp.replace(/\s/g, "") : "";
  const row = await env.DB.prepare(`SELECT totp_secret_ciphertext FROM auth_accounts WHERE user_id = ?`)
    .bind(identity.userId).first<{ totp_secret_ciphertext: string | null }>();
  if (!row?.totp_secret_ciphertext) throw new ApiError(409, "MFA_ENROLLMENT_NOT_STARTED");
  const secret = await decryptTotpSecret(row.totp_secret_ciphertext, env.AUTH_ENCRYPTION_KEY);
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
    SELECT s.id, s.user_id, a.totp_secret_ciphertext
    FROM auth_sessions s JOIN auth_accounts a ON a.user_id = s.user_id
    WHERE s.token_sha256 = ? AND s.state = 'MFA_PENDING'
      AND s.revoked_at IS NULL AND s.expires_at > ?
  `).bind(await sha256Hex(rawToken), now).first<{
    id: string; user_id: string; totp_secret_ciphertext: string | null;
  }>();
  if (!row?.totp_secret_ciphertext) throw new ApiError(401, "MFA_CHALLENGE_REQUIRED");
  let valid = false;
  if (/^\d{6}$/.test(otp)) {
    valid = await verifyTotp(
      await decryptTotpSecret(row.totp_secret_ciphertext, env.AUTH_ENCRYPTION_KEY), otp,
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
  await env.DB.prepare(`UPDATE auth_sessions SET state = 'ACTIVE', last_seen_at = ? WHERE id = ?`)
    .bind(now, row.id).run();
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
    }, 201), created.session.token,
    Math.max(0, Math.floor((Date.parse(created.session.expiresAt) - Date.now()) / 1000)));
  }
  if (request.method === "POST" && url.pathname === "/v1/login") {
    const result = await login(request, env);
    return setSessionCookie(response(result.payload), result.session.token,
      Math.max(0, Math.floor((Date.parse(result.session.expiresAt) - Date.now()) / 1000)));
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
    await issueActionToken(env, { userId: identity.userId, purpose: "VERIFY_EMAIL", locale: locale(body.locale), name: identity.displayName });
    return response({ accepted: true });
  }
  if (request.method === "POST" && url.pathname === "/v1/email-verification/confirm") {
    return response(await actionToken(request, env, "EMAIL_CONFIRM"));
  }
  if (request.method === "POST" && url.pathname === "/v1/password-reset/request") {
    requireIdempotencyKey(request);
    const body = await readJsonBody<Record<string, unknown>>(request, 4096);
    const email = normalizeEmail(body.email);
    const account = await env.DB.prepare(`SELECT a.user_id, p.display_name FROM auth_accounts a
      JOIN user_profiles p ON p.appwrite_user_id = a.user_id WHERE a.email = ? COLLATE NOCASE`)
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
    const account = await env.DB.prepare(`SELECT password_hash, password_salt, password_iterations FROM auth_accounts WHERE user_id = ?`)
      .bind(identity.userId).first<{ password_hash: string; password_salt: string; password_iterations: number }>();
    if (!account || typeof body.password !== "string" || !await verifyPassword(body.password, account.password_hash, account.password_salt, account.password_iterations)) {
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
