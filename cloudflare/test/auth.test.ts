import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_NAME,
  authenticateAdministrator,
  authenticateUser,
} from "../src/shared/auth";
import type { BaseEnv } from "../src/shared/types";

interface SessionIdentity {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  email_verified: number;
  account_status: string;
  age_status: string;
  role: "USER" | "ADMIN";
  mfa_enabled: number;
  last_seen_at: string;
}

function fakeDb(identity: SessionIdentity | null, tier: string | null = null): D1Database {
  return {
    prepare: (sql: string) => {
      const statement = {
        bind: () => statement,
        first: async () => {
          if (sql.includes("FROM auth_sessions")) return identity;
          if (sql.includes("FROM entitlements")) return tier ? { tier } : null;
          return null;
        },
        run: async () => ({ success: true, meta: { changes: 1 } }),
      };
      return statement;
    },
  } as unknown as D1Database;
}

function sessionIdentity(overrides: Partial<SessionIdentity> = {}): SessionIdentity {
  return {
    session_id: "session-a",
    user_id: "user-a",
    email: "user@example.test",
    display_name: "User",
    email_verified: 1,
    account_status: "ACTIVE",
    age_status: "APPROVED",
    role: "USER",
    mfa_enabled: 0,
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

function env(identity: SessionIdentity | null, tier: string | null = null): BaseEnv {
  return { DB: fakeDb(identity, tier) };
}

const sessionToken = "a".repeat(43);

function request(token = sessionToken): Request {
  return new Request("https://membership.example/v1/status", {
    headers: { Cookie: `${AUTH_COOKIE_NAME}=${token}` },
  });
}

describe("Cloudflare-native session authentication", () => {
  it("requires the host-bound session cookie", async () => {
    await expect(authenticateUser(
      new Request("https://membership.example/v1/status"),
      env(null),
    )).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });

  it("rejects a missing or expired D1 session", async () => {
    await expect(authenticateUser(request(), env(null)))
      .rejects.toMatchObject({ status: 401, code: "INVALID_OR_EXPIRED_IDENTITY" });
  });

  it("rejects an unverified identity on protected operations", async () => {
    await expect(authenticateUser(
      request(),
      env(sessionIdentity({ email_verified: 0 })),
      { requireVerifiedEmail: true },
    )).rejects.toMatchObject({ status: 403, code: "EMAIL_NOT_VERIFIED" });
  });

  it("rejects an ordinary user from administrator authorization", async () => {
    await expect(authenticateAdministrator(request(), env(sessionIdentity()), "admin"))
      .rejects.toMatchObject({ status: 403, code: "ADMINISTRATOR_REQUIRED" });
  });

  it("requires MFA for an administrator", async () => {
    await expect(authenticateAdministrator(
      request(),
      env(sessionIdentity({ role: "ADMIN", mfa_enabled: 0 })),
      "admin",
    )).rejects.toMatchObject({ status: 403, code: "ADMIN_MFA_REQUIRED" });
  });

  it("authorizes an administrator with MFA enabled", async () => {
    await expect(authenticateAdministrator(
      request(),
      env(sessionIdentity({ role: "ADMIN", mfa_enabled: 1 })),
      "admin",
    )).resolves.toMatchObject({ userId: "user-a", mfaEnabled: true });
  });

  it("derives membership labels from D1", async () => {
    await expect(authenticateUser(request(), env(sessionIdentity(), "EXCLUSIVE_VIP")))
      .resolves.toMatchObject({ labels: ["age_verified", "active_vip"] });
  });
});
