import { afterEach, describe, expect, it, vi } from "vitest";
import auth from "../src/workers/auth-api";
import { randomBase64Url, sha256Hex } from "../src/shared/security";
import type { AuthEnv } from "../src/shared/types";
import { testDatabase } from "./helpers/database";

const origin = "https://exclusive.jason-shadow.com";
const passwordCredential = { verifier: "v".repeat(43), salt: "s".repeat(22), iterations: 600_000 };
const quietLogs = () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

function fixture() {
  const { sqlite, DB } = testDatabase();
  let pendingBatch: Promise<unknown> = Promise.resolve();
  const serializedDB = { ...DB, batch(statements: D1PreparedStatement[]) {
    const operation = pendingBatch.then(() => DB.batch(statements));
    pendingBatch = operation.catch(() => {});
    return operation;
  } } as D1Database;
  const messages: { userId: string; messageId: string; subject: string; html: string; emailChangeTokenId?: string }[] = [];
  const send = vi.fn(async (_url: string, options: RequestInit) => {
    messages.push(JSON.parse(String(options.body)));
    return Response.json({ ok: true });
  });
  const env = {
    DB: serializedDB, SITE_ORIGINS: origin, AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_PASSWORD_PEPPER: randomBase64Url(32), AUTH_PASSWORD_PEPPER_VERSION: "v1",
    AUTH_EMAIL_SERVICE_SECRET: "test-only-email-secret", AUTH_ENCRYPTION_KEY: randomBase64Url(32),
    IDENTITY_PROJECTION: { fetch: send },
  } as unknown as AuthEnv;
  async function request(path: string, body?: unknown, cookie?: string, method = "POST") {
    return auth.fetch(new Request(`https://auth.internal${path}`, {
      method, headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(),
        "CF-Connecting-IP": "192.0.2.1", ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
  }
  async function register(email = "member@example.test", locale = "en", name = "Member <b>Test</b>") {
    const response = await request("/v1/register", { email, name, passwordCredential, countryCode: "DE",
      privacyNoticeAccepted: true, privacyNoticeVersion: "TEST", locale });
    const result = await response.json() as any;
    expect(response.status).toBe(201);
    return { result, cookie: response.headers.get("Set-Cookie")!.split(";")[0]!, response };
  }
  function challenge(index = messages.length - 1) {
    const email = messages[index]!;
    const code = /<span>(\d{6})<\/span>/.exec(email.html)?.[1];
    const token = /token=([A-Za-z0-9_-]{43})/.exec(email.html)?.[1];
    return { code, token, email };
  }
  return { sqlite, env, request, register, challenge, send, messages };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("registration email codes and fallback links", () => {
  it("sends a six-digit code and same-challenge fallback, stores keyed digests, and escapes the name", async () => {
    const { register, challenge, sqlite, env } = fixture();
    const { result, cookie } = await register();
    const { code, token, email } = challenge();
    expect(code).toMatch(/^\d{6}$/);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(email.html).toContain("15 minutes");
    expect(email.html).toContain("Member &lt;b&gt;Test&lt;/b&gt;");
    expect(email.html).not.toContain("Member <b>Test</b>");
    expect(email.subject).toContain("Jason Shadow");
    expect(result.verification.delivery).toBe("sent");
    expect(Date.parse(result.verification.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(Date.parse(result.verification.resendAfter) - Date.now()).toBeGreaterThan(55_000);
    expect(result.user.emailVerification).toBe(false);
    const row = sqlite.prepare("SELECT * FROM auth_action_tokens").get()!;
    expect(row.code_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(row.code_sha256).not.toBe(await sha256Hex(code!));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(row.pending_email).toBe("member@example.test");
    expect(row.code_attempts).toBe(0);
    expect(cookie).toMatch(/^__Host-shadow_session=/);
    expect(JSON.stringify(result)).not.toContain(env.AUTH_PASSWORD_PEPPER);
  });

  it("accepts leading zeroes, rotates the session, verifies the user and invalidates the fallback", async () => {
    quietLogs();
    const realRandom = crypto.getRandomValues.bind(crypto);
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      if (array instanceof Uint32Array) { array[0] = 42; return array; }
      return realRandom(array);
    });
    const { register, challenge, request, sqlite } = fixture();
    const { cookie, result } = await register();
    const { code, token } = challenge();
    expect(code).toBe("000042");
    const response = await request("/v1/email-verification/confirm", { code }, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Strict");
    const refreshedCookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    expect(refreshedCookie).not.toBe(cookie);
    expect(await response.json()).toMatchObject({ ok: true, emailVerified: true, sessionReady: true,
      user: { $id: result.user.$id, emailVerification: true } });
    expect((await request("/v1/account", undefined, cookie, "GET")).status).toBe(401);
    expect((await request("/v1/account", undefined, refreshedCookie, "GET")).status).toBe(200);
    expect((await request("/v1/email-verification/confirm", { token })).status).toBe(400);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL").get()!.n).toBe(1);
  });

  it("does not expose an anonymous code oracle or accept one member's code for another", async () => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    const first = await register("first@example.test");
    const firstCode = challenge().code;
    await register("second@example.test");
    const secondCode = challenge().code;
    expect((await request("/v1/email-verification/confirm", { code: firstCode })).status).toBe(401);
    const invalid = firstCode === secondCode ? (firstCode === "111111" ? "222222" : "111111") : secondCode;
    const response = await request("/v1/email-verification/confirm", { code: invalid }, first.cookie);
    expect(response.status).toBe(400);
    expect(sqlite.prepare("SELECT email_verified FROM user_profiles WHERE appwrite_user_id = ?").get(first.result.user.$id)!.email_verified).toBe(0);
  });

  it("limits code guesses to five atomically while retaining the high-entropy fallback", async () => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    const { cookie } = await register();
    const { code, token } = challenge();
    const wrong = code === "111111" ? "222222" : "111111";
    const responses = await Promise.all(Array.from({ length: 8 }, () => request("/v1/email-verification/confirm", { code: wrong }, cookie)));
    expect(responses.every((response) => [400, 429].includes(response.status))).toBe(true);
    expect(sqlite.prepare("SELECT code_attempts FROM auth_action_tokens").get()!.code_attempts).toBe(5);
    const blocked = await request("/v1/email-verification/confirm", { code }, cookie);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: "EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED" } });
    const fallback = await request("/v1/email-verification/confirm", { token });
    expect(fallback.status).toBe(200);
    expect(await fallback.json()).toMatchObject({ emailVerified: true, sessionReady: true });
  });

  it("allows only one concurrent code or link confirmation to issue a session", async () => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    const { cookie } = await register();
    const { code, token } = challenge();
    const responses = await Promise.all([
      request("/v1/email-verification/confirm", { code }, cookie),
      request("/v1/email-verification/confirm", { token }),
      request("/v1/email-verification/confirm", { token }),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.headers.has("Set-Cookie"))).toHaveLength(1);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL").get()!.n).toBe(1);
    expect(sqlite.prepare("SELECT version FROM user_profiles").get()!.version).toBe(2);
  });

  it("rolls back verification and revocations when session persistence fails", async () => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    const { cookie } = await register();
    sqlite.exec(`CREATE TRIGGER fail_new_session BEFORE INSERT ON auth_sessions
      BEGIN SELECT RAISE(ABORT, 'test session storage failure'); END`);
    const response = await request("/v1/email-verification/confirm", { code: challenge().code }, cookie);
    expect(response.status).toBe(500);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(sqlite.prepare("SELECT email_verified FROM user_profiles").get()!.email_verified).toBe(0);
    expect(sqlite.prepare("SELECT used_at, consumed_by, code_attempts FROM auth_action_tokens").get()).toMatchObject({
      used_at: null, consumed_by: null, code_attempts: 0,
    });
    expect(sqlite.prepare("SELECT revoked_at FROM auth_sessions").get()!.revoked_at).toBeNull();
    sqlite.exec("DROP TRIGGER fail_new_session");
    expect((await request("/v1/email-verification/confirm", { code: challenge().code }, cookie)).status).toBe(200);
  });

  it("enforces the resend cooldown and makes both old mechanisms unusable after a resend", async () => {
    quietLogs();
    const { register, challenge, request, sqlite, messages } = fixture();
    const { cookie } = await register();
    const old = challenge();
    expect((await request("/v1/email-verification/request", { locale: "de" }, cookie)).status).toBe(429);
    expect(messages).toHaveLength(1);
    sqlite.prepare("UPDATE auth_action_tokens SET created_at = ?").run(new Date(Date.now() - 61_000).toISOString());
    const responses = await Promise.all([
      request("/v1/email-verification/request", { locale: "de" }, cookie),
      request("/v1/email-verification/request", { locale: "de" }, cookie),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 429]);
    expect(messages).toHaveLength(2);
    expect(challenge().email.html).toContain("sechsstelligen Code");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM auth_action_tokens WHERE used_at IS NULL").get()!.n).toBe(1);
    expect((await request("/v1/email-verification/confirm", { token: old.token })).status).toBe(400);
    if (old.code !== challenge().code) expect((await request("/v1/email-verification/confirm", { code: old.code }, cookie)).status).toBe(400);
    expect((await request("/v1/email-verification/confirm", { code: challenge().code }, cookie)).status).toBe(200);
  });

  it("reports failed email delivery without losing the pending account", async () => {
    quietLogs();
    const { register, send, sqlite } = fixture();
    send.mockResolvedValueOnce(Response.json({ error: { code: "GRAPH_EMAIL_DELIVERY_FAILED" } }, { status: 503 }));
    const { result } = await register();
    expect(result.verification.delivery).toBe("failed");
    expect(result.user.emailVerification).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM auth_accounts").get()!.n).toBe(1);
  });

  it.each(["code", "token"])("rejects an expired %s without issuing a session", async (method) => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    const { cookie } = await register();
    const input = challenge();
    sqlite.prepare("UPDATE auth_action_tokens SET expires_at = ?").run(new Date(Date.now() - 1_000).toISOString());
    const response = await request("/v1/email-verification/confirm", { [method]: input[method as "code" | "token"] }, cookie);
    expect(response.status).toBe(400);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(sqlite.prepare("SELECT email_verified FROM user_profiles").get()!.email_verified).toBe(0);
  });

  it("keeps old native email links usable when their address snapshot is NULL", async () => {
    const { register, challenge, request, sqlite } = fixture();
    await register();
    sqlite.prepare("UPDATE auth_action_tokens SET pending_email = NULL, code_sha256 = NULL, code_pepper_version = NULL").run();
    const response = await request("/v1/email-verification/confirm", { token: challenge().token });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ emailVerified: true, sessionReady: true });
  });

  it("rejects a stale verification address snapshot", async () => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    await register();
    sqlite.prepare("UPDATE auth_accounts SET email = 'changed@example.test'").run();
    const response = await request("/v1/email-verification/confirm", { token: challenge().token });
    expect(response.status).toBe(400);
    expect(sqlite.prepare("SELECT email_verified FROM user_profiles").get()!.email_verified).toBe(0);
  });

  it.each(["RESTRICTED", "DELETION_PENDING", "DELETED"])("cannot authenticate a %s account through a link", async (status) => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    await register();
    sqlite.prepare("UPDATE user_profiles SET account_status = ?").run(status);
    const response = await request("/v1/email-verification/confirm", { token: challenge().token });
    expect(response.status).toBe(400);
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  it("never downgrades an MFA-enabled account to an active session", async () => {
    quietLogs();
    const { register, challenge, request, sqlite } = fixture();
    await register();
    sqlite.prepare("UPDATE auth_accounts SET mfa_enabled = 1, mfa_required = 1, role = 'ADMIN'").run();
    const response = await request("/v1/email-verification/confirm", { token: challenge().token });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ emailVerified: true, sessionReady: false, mfaRequired: true });
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    expect((await request("/v1/account", undefined, cookie, "GET")).status).toBe(401);
    expect(sqlite.prepare("SELECT state FROM auth_sessions WHERE revoked_at IS NULL").get()!.state).toBe("MFA_PENDING");
  });

  it("verifies an unenrolled admin but requires password sign-in instead of issuing a session", async () => {
    const { register, challenge, request, sqlite } = fixture();
    await register();
    sqlite.prepare("UPDATE auth_accounts SET mfa_required = 1, role = 'ADMIN'").run();
    const response = await request("/v1/email-verification/confirm", { token: challenge().token });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ emailVerified: true, sessionReady: false, loginRequired: true });
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL").get()!.n).toBe(0);
  });

  it("does not offer verification codes as a login method for verified accounts", async () => {
    quietLogs();
    const { register, challenge, request, messages } = fixture();
    await register();
    const confirm = await request("/v1/email-verification/confirm", { token: challenge().token });
    const cookie = confirm.headers.get("Set-Cookie")!.split(";")[0]!;
    expect((await request("/v1/email-verification/request", { locale: "en" }, cookie)).status).toBe(409);
    expect(messages).toHaveLength(1);
  });

  it("keeps password-reset responses generic for a restricted account", async () => {
    const { register, request, messages, sqlite } = fixture();
    await register();
    sqlite.prepare("UPDATE user_profiles SET account_status = 'RESTRICTED'").run();
    const response = await request("/v1/password-reset/request", { email: "member@example.test" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true });
    expect(messages).toHaveLength(1);
  });

  it("keeps password-reset tokens purpose-bound and one-use", async () => {
    quietLogs();
    const { register, request, challenge, sqlite } = fixture();
    await register();
    expect((await request("/v1/password-reset/request", { email: "member@example.test" })).status).toBe(200);
    const { token, code } = challenge();
    expect(code).toBeUndefined();
    expect((await request("/v1/email-verification/confirm", { token })).status).toBe(400);
    expect((await request("/v1/password-reset/confirm", { token, passwordCredential })).status).toBe(200);
    expect((await request("/v1/password-reset/confirm", { token, passwordCredential })).status).toBe(400);
    expect(sqlite.prepare("SELECT email_verified FROM user_profiles").get()!.email_verified).toBe(0);
  });

  it("sends email-change confirmation to a bounded challenge destination and verifies the new address", async () => {
    const { register, request, challenge, sqlite } = fixture();
    const { cookie } = await register();
    const response = await request("/v1/account/email", {
      email: "new@example.test", passwordVerifier: passwordCredential.verifier, locale: "en",
    }, cookie, "PATCH");
    expect(response.status).toBe(200);
    const { token, code, email } = challenge();
    expect(code).toBeUndefined();
    expect(email.emailChangeTokenId).toBe(email.messageId);
    expect(email).not.toHaveProperty("recipientEmail");
    expect((await request("/v1/email-verification/confirm", { token })).status).toBe(200);
    expect(sqlite.prepare("SELECT email, email_verified FROM user_profiles").get()).toMatchObject({
      email: "new@example.test", email_verified: 1,
    });
  });
});
