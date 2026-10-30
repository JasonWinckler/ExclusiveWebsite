import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import identityWorker from "../src/workers/identity-projection";
import { sendTransactionalEmail } from "../src/shared/identity-service";
import { MEMBERSHIP_EMAIL_SENDER_NAME } from "../src/shared/microsoft-graph";
import type { IdentityProjectionEnv } from "../src/shared/types";

const labelSecret = "test-membership-mail-secret";
const authSecret = "test-auth-mail-secret";
const logo = readFileSync(new URL("../../assets/music/logo.png", import.meta.url));
const mail = {
  userId: "member-test", messageId: "nc-0123456789abcdef0123456789abcdef",
  subject: "Confirm your music newsletter", html: '<img src="cid:shadow-brand-banner"><p>Music updates</p>',
};

function fixture(overrides: Partial<IdentityProjectionEnv> = {}) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ token_type: "Bearer", access_token: "a".repeat(64) }))
    .mockResolvedValueOnce(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ email: "member@example.test", name: "Member" }) }) }) },
    EMAIL_ASSETS: { fetch: async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/logo.png");
      return new Response(logo, { headers: { "Content-Type": "image/png" } });
    } },
    GRAPH_TENANT_ID: "11111111-1111-4111-8111-111111111111",
    GRAPH_CLIENT_ID: "22222222-2222-4222-8222-222222222222",
    GRAPH_CLIENT_SECRET: "test-only-graph-secret",
    GRAPH_SENDER_MAILBOX: "info@example.test",
    GRAPH_SENDER_NAME: MEMBERSHIP_EMAIL_SENDER_NAME,
    LABEL_SYNC_SERVICE_SECRET: labelSecret,
    AUTH_EMAIL_SERVICE_SECRET: authSecret,
    ACCOUNT_LIFECYCLE_SERVICE_SECRET: "test-lifecycle-secret",
    ...overrides,
  } as unknown as IdentityProjectionEnv;
  const request = (secret: string, path = "/send-transactional-email") => identityWorker.fetch(new Request(`https://identity.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Service-Secret": secret, "cf-ray": "test-ray-FRA" },
    body: JSON.stringify(mail),
  }), env);
  return { fetchMock, env, request };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("private music email delivery", () => {
  it.each([labelSecret, authSecret])("accepts each authorized mail caller when their secrets differ", async (secret) => {
    const { fetchMock, request } = fixture();
    const response = await request(secret);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(fetchMock.mock.calls[1]![1].body));
    expect(payload.message.from.emailAddress.name).toBe(MEMBERSHIP_EMAIL_SENDER_NAME);
    expect(payload.message.replyTo[0].emailAddress.name).toBe(MEMBERSHIP_EMAIL_SENDER_NAME);
    expect(payload.message.attachments[0]).toMatchObject({
      name: "jason-shadow-membership-logo.png", contentId: "shadow-brand-banner", contentType: "image/png",
      contentBytes: Buffer.from(logo).toString("base64"),
    });
    expect(JSON.stringify(payload)).not.toContain("Temptation");
  });

  it("keeps the membership caller working when no separate auth email key is configured", async () => {
    const { request } = fixture({ AUTH_EMAIL_SERVICE_SECRET: undefined });
    expect((await request(labelSecret)).status).toBe(200);
  });

  it.each(["", "wrong-secret", "test-lifecycle-secret"])("rejects unauthorized email access", async (secret) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { request, fetchMock } = fixture();
    const response = await request(secret);
    expect(response.status).toBe(403);
    expect(response.headers.get("X-Request-Id")).toBe("test-ray-FRA");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not grant the auth email key access to other identity operations", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { request, fetchMock } = fixture();
    expect((await request(authSecret, "/verify-user-email")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a missing deployed logo safely and never calls Graph", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const { request, fetchMock } = fixture({
      EMAIL_ASSETS: { fetch: async () => new Response(null, { status: 404 }) } as unknown as Fetcher,
    });
    const response = await request(labelSecret);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "EMAIL_BRAND_ASSET_INVALID" }, requestId: "test-ray-FRA" });
    expect(String(logger.mock.calls)).toContain("EMAIL_BRAND_ASSET_INVALID");
    expect(String(logger.mock.calls)).not.toContain(labelSecret);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records an allowlisted upstream diagnosis while keeping the caller error generic", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = { fetch: async () => Response.json({ error: {
      code: "GRAPH_EMAIL_NOT_CONFIGURED", message: "private provider detail",
    } }, { status: 503, headers: { "X-Request-Id": "identity-ref-123" } }) } as unknown as Service;
    await expect(sendTransactionalEmail(service, labelSecret, mail))
      .rejects.toMatchObject({ code: "IDENTITY_PROJECTION_FAILED", status: 503 });
    const logged = String(logger.mock.calls);
    expect(logged).toContain("GRAPH_EMAIL_NOT_CONFIGURED");
    expect(logged).toContain("identity-ref-123");
    expect(logged).not.toContain("private provider detail");
    expect(logged).not.toContain(labelSecret);
  });

  it("never logs an arbitrary upstream error code or non-JSON body", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const response of [
      Response.json({ error: { code: "private-token-value" } }, { status: 500 }),
      new Response("private-html-body", { status: 500 }),
    ]) {
      const service = { fetch: async () => response } as unknown as Service;
      await expect(sendTransactionalEmail(service, labelSecret, mail)).rejects.toMatchObject({ code: "IDENTITY_PROJECTION_FAILED" });
    }
    expect(String(logger.mock.calls)).not.toContain("private-token-value");
    expect(String(logger.mock.calls)).not.toContain("private-html-body");
  });
});
