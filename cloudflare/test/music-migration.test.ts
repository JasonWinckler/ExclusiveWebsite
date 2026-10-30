import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/database";

const migration = readFileSync(new URL("../migrations/0027_order_of_shadows_music_membership.sql", import.meta.url), "utf8");

describe("music membership cutover", () => {
  it("quarantines existing posts and newsletters while preserving account, billing and pricing state", () => {
    const { sqlite } = testDatabase(true);
    const now = "2026-10-01T00:00:00.000Z";
    sqlite.prepare(`INSERT INTO user_profiles (appwrite_user_id, email, display_name, account_status,
      email_verified, age_status, created_at, updated_at) VALUES ('test-user', 'test@example.test',
      'Test Supporter', 'ACTIVE', 1, 'APPROVED', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO entitlements (id, appwrite_user_id, product_id, tier, status,
      starts_at, expires_at, created_at, updated_at) VALUES ('test-entitlement', 'test-user',
      'exclusive_basic_30d', 'EXCLUSIVE_BASIC', 'ACTIVE', ?, '2027-01-01T00:00:00.000Z', ?, ?)`)
      .run(now, now, now);
    sqlite.prepare(`INSERT INTO content_items (id, slug, title, content_status, required_tier,
      creation_idempotency_key, created_at, updated_at) VALUES ('legacy', 'legacy', 'Legacy post',
      'ACTIVE', 'FREE', 'legacy-create', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO newsletter_subscriptions (appwrite_user_id, status, consent_text_version,
      consented_at, confirmed_at, created_at, updated_at) VALUES ('test-user', 'SUBSCRIBED',
      'newsletter-v1', ?, ?, ?, ?)`).run(now, now, now, now);
    sqlite.prepare(`INSERT INTO newsletter_campaigns (id, subject_de, subject_en, preview_de, preview_en,
      status, created_by_appwrite_user_id, created_at, updated_at) VALUES ('old-campaign', 'Alt', 'Old',
      'Alt', 'Old', 'QUEUED', 'test-admin', ?, ?)`).run(now, now);
    sqlite.prepare(`INSERT INTO newsletter_deliveries (id, campaign_id, appwrite_user_id, locale, status,
      created_at, updated_at) VALUES ('old-delivery', 'old-campaign', 'test-user', 'en', 'PENDING', ?, ?)`).run(now, now);
    const profile = sqlite.prepare("SELECT * FROM user_profiles").all();
    const entitlement = sqlite.prepare("SELECT * FROM entitlements").all();
    const prices = sqlite.prepare("SELECT id, sku, amount_minor, currency, duration_unit, duration_value FROM products ORDER BY id").all();
    sqlite.exec(migration);
    expect(sqlite.prepare("SELECT * FROM user_profiles").all()).toEqual(profile);
    expect(sqlite.prepare("SELECT * FROM entitlements").all()).toEqual(entitlement);
    expect(sqlite.prepare("SELECT id, sku, amount_minor, currency, duration_unit, duration_value FROM products ORDER BY id").all()).toEqual(prices);
    expect(sqlite.prepare("SELECT content_scope, content_status FROM content_items WHERE id = 'legacy'").get())
      .toMatchObject({ content_scope: "LEGACY_ADULT", content_status: "DISABLED" });
    expect(sqlite.prepare("SELECT status, confirmed_at FROM newsletter_subscriptions").get())
      .toMatchObject({ status: "PENDING", confirmed_at: now });
    expect(sqlite.prepare("SELECT status FROM newsletter_campaigns").get()).toMatchObject({ status: "CANCELLED" });
    expect(sqlite.prepare("SELECT status FROM newsletter_deliveries").get()).toMatchObject({ status: "SKIPPED" });
    // Accidental SQL inserts also fail closed until explicitly classified as music.
    sqlite.prepare(`INSERT INTO content_items (id, slug, title, content_status, required_tier,
      creation_idempotency_key, created_at, updated_at) VALUES ('unknown', 'unknown', 'Unclassified',
      'ACTIVE', 'FREE', 'unknown-create', ?, ?)`).run(now, now);
    expect(sqlite.prepare("SELECT content_scope FROM content_items WHERE id = 'unknown'").get())
      .toMatchObject({ content_scope: "LEGACY_ADULT" });
    sqlite.close();
  });
});
