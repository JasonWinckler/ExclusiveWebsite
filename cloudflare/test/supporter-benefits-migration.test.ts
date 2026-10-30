import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/database";

const migration = readFileSync(new URL("../migrations/0031_supporter_membership_benefits.sql", import.meta.url), "utf8");
const now = "2026-10-30T12:00:00.000Z";

function fixture() {
  const { sqlite } = testDatabase("0031");
  sqlite.prepare(`INSERT INTO user_profiles (appwrite_user_id, email, display_name,
    account_status, email_verified, created_at, updated_at)
    VALUES ('supporter', 'supporter@example.test', 'Synthetic Supporter', 'ACTIVE', 1, ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO auth_accounts (user_id, email, created_at, updated_at)
    VALUES ('supporter', 'supporter@example.test', ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO subscriptions (id, appwrite_user_id, product_id,
    payment_method, transfer_reference, amount_minor, currency, status, payment_due_at,
    idempotency_key, terms_version, terms_accepted_at, created_at, updated_at)
    VALUES ('order', 'supporter', 'exclusive_vip_30d', 'SEPA_CREDIT_TRANSFER',
    'synthetic-reference', 4999, 'EUR', 'ACTIVE', ?, 'synthetic-order',
    'ORDER-2026-10-30-V3', ?, ?, ?)`)
    .run(now, now, now, now);
  sqlite.prepare(`INSERT INTO entitlements (id, appwrite_user_id, product_id,
    subscription_id, tier, status, starts_at, expires_at, created_at, updated_at)
    VALUES ('entitlement', 'supporter', 'exclusive_vip_30d', 'order',
    'EXCLUSIVE_VIP', 'ACTIVE', ?, '2027-01-01T00:00:00.000Z', ?, ?)`)
    .run(now, now, now);
  sqlite.prepare(`INSERT INTO invoices (id, subscription_id, invoice_number,
    billing_name, billing_street, billing_postal_code, billing_city, billing_country_code,
    seller_name, seller_address, seller_email, amount_minor, currency,
    issued_at, due_at, created_at, updated_at)
    VALUES ('invoice', 'order', 'SYNTHETIC-001', 'Synthetic Supporter', 'Test Street',
    '00000', 'Test City', 'DE', 'Test Seller', 'Test Address', 'seller@example.test',
    4999, 'EUR', ?, ?, ?, ?)`)
    .run(now, now, now, now);
  sqlite.prepare(`INSERT INTO content_items (id, slug, title, content_status,
    required_tier, content_scope, creation_idempotency_key, published_at, created_at, updated_at)
    VALUES ('post', 'synthetic-post', 'Synthetic preparation insight', 'ACTIVE',
    'EXCLUSIVE_BASIC', 'MUSIC', 'synthetic-post', ?, ?, ?)`)
    .run(now, now, now);
  sqlite.prepare(`INSERT INTO content_comments (id, content_item_id, appwrite_user_id,
    body, idempotency_key, created_at, updated_at)
    VALUES ('comment', 'post', 'supporter', 'Synthetic question', 'synthetic-comment', ?, ?)`)
    .run(now, now);
  return sqlite;
}

describe("service supporter benefits migration", () => {
  it("changes only catalog benefits, retaining accounts, content, billing and previous accepted terms", () => {
    const sqlite = fixture();
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'tier_perks'").all()
      .map((row) => String(row.name));
    const before = new Map(tables.map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]));
    sqlite.exec("BEGIN");
    sqlite.exec(migration);
    sqlite.exec("COMMIT");
    for (const table of tables) expect(sqlite.prepare(`SELECT * FROM ${table}`).all(), table).toEqual(before.get(table));
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.close();
  });

  it("gives every tier one shared content benefit and one conversation benefit without duplicate or stale promises", () => {
    const sqlite = fixture();
    const retired = sqlite.prepare("SELECT id, title, title_en FROM tier_perks WHERE id LIKE '%drops-%' OR id LIKE '%voting-%' OR id LIKE '%priority-replies-%' OR lower(id) LIKE '%telegram%'").all();
    sqlite.exec(migration);
    for (const [tier, count] of [["EXCLUSIVE_BASIC", 2], ["EXCLUSIVE_PREMIUM", 3], ["EXCLUSIVE_VIP", 6]] as const) {
      const rows = sqlite.prepare("SELECT title, title_en, description, description_en FROM tier_perks WHERE tier = ? AND active = 1 ORDER BY sort_order").all(tier);
      expect(rows).toHaveLength(count);
      expect(rows[0]).toMatchObject({ title_en: "Behind the scenes: preparation and craft" });
      expect(rows[1]).toMatchObject({ title_en: "Questions, ideas and conversation" });
      expect(new Set(rows.map((row) => row.title)).size).toBe(count);
      expect(new Set(rows.map((row) => row.title_en)).size).toBe(count);
      expect(JSON.stringify(rows)).not.toMatch(/telegram|voting|votings|priority replies|new behind-the-scenes posts/i);
    }
    expect(sqlite.prepare("SELECT COUNT(DISTINCT description) AS de, COUNT(DISTINCT description_en) AS en FROM tier_perks WHERE active = 1 AND id LIKE 'supporter-%-bts'").get()).toMatchObject({ de: 1, en: 1 });
    expect(sqlite.prepare("SELECT tier FROM tier_perks WHERE active = 1 AND title_en = '15% off all services' ORDER BY tier").all())
      .toEqual([{ tier: "EXCLUSIVE_PREMIUM" }, { tier: "EXCLUSIVE_VIP" }]);
    expect(sqlite.prepare("SELECT tier, title, title_en, description, description_en FROM tier_perks WHERE active = 1 AND id = 'supporter-vip-secret'").get())
      .toMatchObject({ tier: "EXCLUSIVE_VIP", title: "Psst... Discover Shadow's Temptation 😏", title_en: "Psst... Discover Shadow's Temptation 😏", description: expect.stringContaining("bestätigter Altersverifikation"), description_en: expect.stringContaining("approved age verification") });
    for (const row of retired) expect(sqlite.prepare("SELECT id, title, title_en, active FROM tier_perks WHERE id = ?").get(String(row.id)))
      .toEqual({ ...row, active: 0 });
    sqlite.close();
  });
});
