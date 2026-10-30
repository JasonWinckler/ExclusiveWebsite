import { describe, expect, it, vi } from "vitest";
import admin from "../src/workers/admin-api";
import { processNewsletterDeliveries } from "../src/workers/maintenance-jobs";
import { sha256Hex } from "../src/shared/security";
import type { AdminEnv, MaintenanceEnv } from "../src/shared/types";
import { membershipFixture } from "./helpers/membership-fixture";

async function adminFixture() {
  const f = await membershipFixture({ tier: "EXCLUSIVE_VIP", age: "APPROVED" });
  const adminToken = "b".repeat(43);
  f.sqlite.prepare("UPDATE auth_accounts SET role = 'ADMIN', mfa_enabled = 1 WHERE user_id = ?").run(f.userId);
  f.sqlite.prepare(`INSERT INTO admin_sessions (id, administrator_appwrite_user_id, session_token_sha256,
    device_token_sha256, created_at, expires_at, last_seen_at) VALUES ('fixture-admin', ?, ?, ?, ?, ?, ?)`)
    .run(f.userId, await sha256Hex(adminToken), await sha256Hex(f.deviceToken), f.now, f.future, f.now);
  const env = { ...f.env, ADMIN_RATE_LIMITER: { limit: async () => ({ success: true }) } } as unknown as AdminEnv;
  async function request(path: string, method = "GET", body?: unknown, activeSession = true) {
    return admin.fetch(new Request(`https://admin.internal${path}`, {
      method, headers: { Cookie: `__Host-shadow_session=${f.sessionToken}`, "X-Device-Token": f.deviceToken,
        "X-Admin-Session": activeSession ? adminToken : "", Origin: "https://exclusive.jason-shadow.com",
        "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
  }
  return { ...f, adminRequest: request };
}

describe("explicit adult publication and newsletter separation", () => {
  it("requires the active admin session to preview and records the private media review", async () => {
    const f = await adminFixture();
    const path = `/v1/content/items/${f.contentIds.legacy}/media`;
    expect((await f.adminRequest(path, "GET", undefined, false)).status).toBe(401);
    const response = await f.adminRequest(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(f.sqlite.prepare("SELECT action FROM admin_audit_events WHERE target_id = ?").get(f.contentIds.legacy!))
      .toMatchObject({ action: "CONTENT_MEDIA_REVIEWED" });
    f.sqlite.close();
  });

  it("publishes exactly one reviewed legacy item to VIP_ADULT, never to the music catalog", async () => {
    const f = await adminFixture();
    const path = `/v1/content/items/${f.contentIds.legacy}/publish-adult`;
    expect((await f.adminRequest(path, "POST", { adultContentReviewed: false, reason: "Test review only" })).status).toBe(400);
    expect(f.sqlite.prepare("SELECT content_scope FROM content_items WHERE id = ?").get(f.contentIds.legacy!))
      .toMatchObject({ content_scope: "LEGACY_ADULT" });
    const response = await f.adminRequest(path, "POST", { adultContentReviewed: true, reason: "Fixture owner reviewed this individual item" });
    expect(response.status).toBe(200);
    expect(f.sqlite.prepare("SELECT content_scope, required_tier, content_status FROM content_items WHERE id = ?").get(f.contentIds.legacy!))
      .toMatchObject({ content_scope: "VIP_ADULT", required_tier: "EXCLUSIVE_VIP", content_status: "ACTIVE" });
    expect(await (await f.request("/v1/content")).json()).toMatchObject({ items: [{ slug: "music" }] });
    expect((await f.adminRequest("/v1/newsletter/new-drop", "POST", { contentItemId: f.contentIds.legacy })).status).toBe(409);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS count FROM newsletter_campaigns").get()).toMatchObject({ count: 0 });
    f.sqlite.close();
  });

  it("requires new adult content review and normalizes music publishing to shared paid access", async () => {
    const f = await adminFixture();
    const body = { slug: "new-private", title: "Private fixture", bodyText: "Fixture only", allowComments: true,
      tier: "EXCLUSIVE_VIP", contentScope: "VIP_ADULT" };
    expect((await f.adminRequest("/v1/content/items", "POST", body)).status).toBe(400);
    expect((await f.adminRequest("/v1/content/items", "POST", { ...body, adultContentReviewed: true })).status).toBe(200);
    expect((await f.adminRequest("/v1/content/items", "POST", { ...body, slug: "new-music", contentScope: "MUSIC" })).status).toBe(200);
    expect(f.sqlite.prepare("SELECT required_tier FROM content_items WHERE slug = 'new-music'").get())
      .toMatchObject({ required_tier: "EXCLUSIVE_BASIC" });
    expect((await f.adminRequest(`/v1/content/items/${f.contentIds.adult}/media`, "PUT", {})).status).toBe(400);
    f.sqlite.close();
  });

  it("pauses newsletter delivery before reading the queue when deployment disables it", async () => {
    const prepare = vi.fn(() => { throw new Error("Queue must not be read during deployment"); });
    const send = vi.fn();
    const env = { NEWSLETTER_DELIVERY_ENABLED: "false", DB: { prepare }, IDENTITY_PROJECTION: { fetch: send } } as unknown as MaintenanceEnv;
    expect(await processNewsletterDeliveries(env, new Date().toISOString(), 10)).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("never delivers an adult post through the general music newsletter queue", async () => {
    const f = await membershipFixture({ tier: "EXCLUSIVE_VIP", age: "APPROVED" });
    f.sqlite.prepare(`INSERT INTO newsletter_subscriptions (appwrite_user_id, status, consent_text_version, created_at, updated_at)
      VALUES (?, 'SUBSCRIBED', 'newsletter-music-v2', ?, ?)`).run(f.userId, f.now, f.now);
    f.sqlite.prepare(`INSERT INTO newsletter_campaigns (id, content_item_id, subject_de, subject_en, preview_de,
      preview_en, status, created_by_appwrite_user_id, created_at, updated_at)
      VALUES ('adult-test-campaign', ?, 'PRIVATE', 'PRIVATE', 'PRIVATE', 'PRIVATE', 'QUEUED', 'test-admin', ?, ?)`)
      .run(f.contentIds.adult!, f.now, f.now);
    f.sqlite.prepare(`INSERT INTO newsletter_deliveries (id, campaign_id, appwrite_user_id, locale, status, created_at, updated_at)
      VALUES ('adult-test-delivery', 'adult-test-campaign', ?, 'en', 'PENDING', ?, ?)`)
      .run(f.userId, f.now, f.now);
    const send = vi.fn();
    const env = { ...f.env, IDENTITY_PROJECTION: { fetch: send } } as unknown as MaintenanceEnv;
    expect(await processNewsletterDeliveries(env, f.future, 10)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    f.sqlite.close();
  });
});
