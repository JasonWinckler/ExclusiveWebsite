import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateAdministrator,
  authenticateUser,
} from "../src/shared/auth";
import type { BaseEnv } from "../src/shared/types";

function fakeDb(): D1Database {
  const statement = {
    bind: () => statement,
    run: async () => ({ success: true, meta: { changes: 1 } }),
  };
  return { prepare: () => statement } as unknown as D1Database;
}

function env(): BaseEnv {
  return {
    DB: fakeDb(),
    APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
    APPWRITE_PROJECT_ID: "project",
  };
}

function request(token = "header.payload.signature"): Request {
  return new Request("https://membership.example/v1/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Appwrite JWT authentication", () => {
  it("rejects a malformed or missing bearer token", async () => {
    await expect(authenticateUser(
      new Request("https://membership.example/v1/status"),
      env(),
      { projectUser: false },
    )).rejects.toMatchObject({ status: 401, code: "VALID_BEARER_TOKEN_REQUIRED" });
  });

  it("rejects an unverified identity on protected operations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      $id: "user-a",
      email: "user@example.test",
      name: "User",
      emailVerification: false,
      status: true,
      labels: [],
      accessedAt: "2026-07-01T00:00:00.000Z",
    })));
    await expect(authenticateUser(
      request(),
      env(),
      { projectUser: false, requireVerifiedEmail: true },
    )).rejects.toMatchObject({ status: 403, code: "EMAIL_NOT_VERIFIED" });
  });

  it("rejects an ordinary user from administrator authorization", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      $id: "user-a",
      email: "user@example.test",
      name: "User",
      emailVerification: true,
      status: true,
      labels: ["age_verified", "active_vip"],
      mfa: false,
      accessedAt: "2026-07-01T00:00:00.000Z",
    })));
    await expect(authenticateAdministrator(request(), env(), "admin"))
      .rejects.toMatchObject({ status: 403, code: "ADMINISTRATOR_REQUIRED" });
  });

  it("requires MFA for an administrator", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      $id: "admin-a",
      email: "admin@example.test",
      name: "Administrator",
      emailVerification: true,
      status: true,
      labels: ["admin"],
      mfa: false,
      accessedAt: "2026-07-01T00:00:00.000Z",
    })));
    await expect(authenticateAdministrator(request(), env(), "admin"))
      .rejects.toMatchObject({ status: 403, code: "ADMIN_MFA_REQUIRED" });
  });

  it("authorizes an administrator with MFA enabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      $id: "admin-a",
      email: "admin@example.test",
      name: "Administrator",
      emailVerification: true,
      status: true,
      labels: ["admin"],
      mfa: true,
      accessedAt: "2026-07-01T00:00:00.000Z",
    })));
    await expect(authenticateAdministrator(request(), env(), "admin"))
      .resolves.toMatchObject({ userId: "admin-a", mfaEnabled: true });
  });

  it("fails closed when Appwrite cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));
    await expect(authenticateUser(request(), env(), { projectUser: false }))
      .rejects.toEqual(expect.objectContaining({
        status: 503,
        code: "IDENTITY_PROVIDER_UNAVAILABLE",
      }));
  });
});
