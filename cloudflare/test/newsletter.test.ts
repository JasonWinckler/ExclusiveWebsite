import { describe, expect, it } from "vitest";
import worker from "../src/workers/membership-api";
import { sha256Hex } from "../src/shared/security";
import type { MembershipEnv } from "../src/shared/types";
import { newsletterEmailHtml } from "../src/shared/newsletter-email";
import { testDatabase } from "./helpers/database";

async function fixture() {
  const { sqlite, DB } = testDatabase();
  const now = new Date().toISOString();
  const token = "a".repeat(43);
  sqlite.prepare(`INSERT INTO user_profiles (appwrite_user_id, email, display_name, account_status,
    email_verified, created_at, updated_at) VALUES ('test-user', 'test@example.test', 'Test Supporter', 'ACTIVE', 1, ?, ?)`).run(now, now);
  sqlite.prepare("INSERT INTO auth_accounts (user_id, email, created_at, updated_at) VALUES ('test-user', 'test@example.test', ?, ?)").run(now, now);
  sqlite.prepare(`INSERT INTO auth_sessions (id, user_id, token_sha256, created_at, last_seen_at, expires_at)
    VALUES ('test-session', 'test-user', ?, ?, ?, ?)`)
    .run(await sha256Hex(token), now, now, new Date(Date.now() + 86_400_000).toISOString());
  const emails: { messageId: string; subject: string; html: string }[] = [];
  const env = {
    DB,
    SITE_ORIGINS: "https://exclusive.jason-shadow.com",
    USER_RATE_LIMITER: { limit: async () => ({ success: true }) },
    LABEL_SYNC_SERVICE_SECRET: "test-secret",
    IDENTITY_PROJECTION: {
      async fetch(_url: string, init: RequestInit) {
        const email = JSON.parse(String(init.body));
        // Emulate the actual private mail service's identifier contract.
        if (!/^[A-Za-z0-9._-]{1,36}$/.test(email.messageId)) return new Response(null, { status: 400 });
        emails.push(email);
        return Response.json({ ok: true });
      },
    },
  } as unknown as MembershipEnv;
  const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;
  async function request(path: string, method = "GET", body?: unknown) {
    return worker.fetch(new Request(`https://membership.internal${path}`, {
      method,
      headers: {
        Cookie: `__Host-shadow_session=${token}`,
        Origin: "https://exclusive.jason-shadow.com",
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, ctx);
  }
  const confirmationPath = () => {
    const url = new URL(emails.at(-1)!.html.match(/href="(https:\/\/exclusive\.jason-shadow\.com\/api\/member\/v1\/newsletter\/action[^" ]+)"/)![1]!.replaceAll("&amp;", "&"));
    return url.pathname.replace("/api/member", "") + url.search;
  };
  return { sqlite, emails, request, confirmationPath };
}

describe("optional music newsletter", () => {
  it("requires consent, sends a valid branded confirmation, and activates only after the one-time link", async () => {
    const f = await fixture();
    expect((await f.request("/v1/newsletter/subscription", "POST", { consent: false, locale: "en" })).status).toBe(400);
    expect(f.emails).toHaveLength(0);
    const response = await f.request("/v1/newsletter/subscription", "POST", { consent: true, locale: "en" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "PENDING", confirmationSent: true });
    expect(f.emails).toHaveLength(1);
    expect(f.emails[0]!.messageId.length).toBeLessThanOrEqual(36);
    expect(f.emails[0]!.html).toContain("Jason Shadow · The Healing Shadow");
    expect(f.sqlite.prepare("SELECT status, consent_text_version FROM newsletter_subscriptions").get())
      .toMatchObject({ status: "PENDING", consent_text_version: "newsletter-music-v2" });
    const link = f.confirmationPath();
    expect((await f.request(link)).status).toBe(200);
    expect(f.sqlite.prepare("SELECT status FROM newsletter_subscriptions").get()).toMatchObject({ status: "SUBSCRIBED" });
    expect((await f.request(link)).status).toBe(400);
    f.sqlite.close();
  });

  it("does not let a pending confirmation undo a later unsubscribe", async () => {
    const f = await fixture();
    await f.request("/v1/newsletter/subscription", "POST", { consent: true, locale: "de" });
    const oldLink = f.confirmationPath();
    expect((await f.request("/v1/newsletter/subscription", "DELETE")).status).toBe(200);
    expect((await f.request(oldLink)).status).toBe(400);
    expect(f.sqlite.prepare("SELECT status FROM newsletter_subscriptions").get()).toMatchObject({ status: "UNSUBSCRIBED" });
    f.sqlite.close();
  });

  it("escapes creator text and includes an unsubscribe control on delivered posts", () => {
    const html = newsletterEmailHtml({ locale: "de", title: '<script>alert("x")</script>', intro: "Studio & Stimme",
      actionLabel: "Entdecken", actionUrl: "https://exclusive.jason-shadow.com/", unsubscribeUrl: "https://exclusive.jason-shadow.com/?unsubscribe=example" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("Studio &amp; Stimme");
    expect(html).toContain("Newsletter abbestellen");
    expect(html).toContain("Rechtliches & Datenschutz");
    expect(html).not.toContain("Temptation");
  });
});
