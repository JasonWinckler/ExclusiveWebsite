import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/database";

const migration = readFileSync(
  new URL("../migrations/0028_membership_benefits_vip_area.sql", import.meta.url), "utf8",
);
const now = "2026-10-30T12:00:00.000Z";

function seededDatabase() {
  const { sqlite } = testDatabase("0028");
  sqlite.prepare(`INSERT INTO user_profiles (
    appwrite_user_id, email, display_name, account_status, email_verified,
    age_status, created_at, updated_at
  ) VALUES ('member-a', 'member@example.test', 'Test Member', 'ACTIVE', 1, 'APPROVED', ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO auth_accounts (user_id, email, created_at, updated_at)
    VALUES ('member-a', 'member@example.test', ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO subscriptions (
    id, appwrite_user_id, product_id, payment_method, transfer_reference,
    amount_minor, currency, status, payment_due_at, idempotency_key,
    terms_version, terms_accepted_at, billing_name, created_at, updated_at
  ) VALUES ('order-a', 'member-a', 'exclusive_vip_30d', 'SEPA_CREDIT_TRANSFER',
    'test-reference', 4999, 'EUR', 'ACTIVE', ?, 'order-a-key',
    'ORDER-2026-10-30-V1', ?, 'Test Member', ?, ?)`)
    .run(now, now, now, now);
  sqlite.prepare(`INSERT INTO invoices (
    id, subscription_id, invoice_number, billing_name, billing_street,
    billing_postal_code, billing_city, billing_country_code, seller_name,
    seller_address, seller_email, amount_minor, currency,
    issued_at, due_at, created_at, updated_at
  ) VALUES ('invoice-a', 'order-a', 'TEST-001', 'Test Member', 'Test Street',
    '00000', 'Test City', 'DE', 'Test Seller', 'Test Address', 'seller@example.test',
    4999, 'EUR', ?, ?, ?, ?)`)
    .run(now, now, now, now);
  sqlite.prepare(`INSERT INTO entitlements (
    id, appwrite_user_id, product_id, subscription_id, tier, status,
    starts_at, expires_at, created_at, updated_at
  ) VALUES ('entitlement-a', 'member-a', 'exclusive_vip_30d', 'order-a',
    'EXCLUSIVE_VIP', 'ACTIVE', ?, '2027-12-31T00:00:00.000Z', ?, ?)`)
    .run(now, now, now);
  const insertContent = sqlite.prepare(`INSERT INTO content_items (
    id, slug, title, content_status, required_tier, content_scope,
    creation_idempotency_key, body_text, published_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Test description', ?, ?, ?)`);
  insertContent.run("legacy-a", "legacy-a", "Legacy item", "DISABLED", "EXCLUSIVE_VIP", "LEGACY_ADULT", "legacy-a-key", now, now, now);
  insertContent.run("music-a", "music-a", "Music item", "ACTIVE", "EXCLUSIVE_PREMIUM", "MUSIC", "music-a-key", now, now, now);
  for (const id of ["legacy-a", "music-a"]) {
    sqlite.prepare(`INSERT INTO content_uploads (
      id, content_item_id, r2_object_key, content_type, size_bytes, object_etag,
      uploaded_by_appwrite_user_id, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, 'image/png', 1, 'test-etag', 'test-admin', ?, ?, ?)`)
      .run(`upload-${id}`, id, `test/${id}`, `upload-${id}-key`, now, now);
    sqlite.prepare(`INSERT INTO content_comments (
      id, content_item_id, appwrite_user_id, body, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, 'member-a', 'Test comment', ?, ?, ?)`)
      .run(`comment-${id}`, id, `comment-${id}-key`, now, now);
    sqlite.prepare(`INSERT INTO newsletter_campaigns (
      id, content_item_id, subject_de, subject_en, preview_de, preview_en,
      status, created_by_appwrite_user_id, created_at, updated_at
    ) VALUES (?, ?, 'Test', 'Test', 'Test', 'Test', 'COMPLETED', 'test-admin', ?, ?)`)
      .run(`campaign-${id}`, id, now, now);
  }
  return sqlite;
}

function applyMigration(sqlite: ReturnType<typeof seededDatabase>) {
  // D1 migration execution keeps foreign keys enabled inside a transaction.
  sqlite.exec("BEGIN");
  try { sqlite.exec(migration); sqlite.exec("COMMIT"); }
  catch (error) { sqlite.exec("ROLLBACK"); throw error; }
}

describe("Shadow membership benefits migration", () => {
  it("extends scope without republishing legacy content or damaging dependent records", () => {
    const sqlite = seededDatabase();
    const tables = ["user_profiles", "auth_accounts", "subscriptions", "invoices", "entitlements", "content_uploads", "content_comments", "newsletter_campaigns"];
    const snapshots = new Map(tables.map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]));
    const contentColumns = "id, slug, title, content_status, required_tier, content_scope, storage_key, creation_idempotency_key, published_at, retired_at, version, created_at, updated_at, body_text, allow_comments";
    const contentSnapshot = sqlite.prepare(`SELECT ${contentColumns} FROM content_items ORDER BY id`).all();
    const pricingColumns = "id, sku, tier, currency, amount_minor, duration_unit, duration_value, purchase_limit_per_user, active, version, created_at";
    const priceSnapshot = sqlite.prepare(`SELECT ${pricingColumns} FROM products ORDER BY id`).all();
    applyMigration(sqlite);
    for (const table of tables) expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(snapshots.get(table));
    expect(sqlite.prepare(`SELECT ${contentColumns} FROM content_items ORDER BY id`).all()).toEqual(contentSnapshot);
    expect(sqlite.prepare(`SELECT ${pricingColumns} FROM products ORDER BY id`).all()).toEqual(priceSnapshot);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    for (const table of ["content_uploads", "content_comments", "newsletter_campaigns"]) {
      expect(sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all())
        .toEqual(expect.arrayContaining([expect.objectContaining({ table: "content_items" })]));
    }
    expect(sqlite.prepare("SELECT content_scope_before_vip, content_scope FROM content_items WHERE id = 'legacy-a'").get())
      .toMatchObject({ content_scope_before_vip: "LEGACY_ADULT", content_scope: "LEGACY_ADULT" });
    expect(sqlite.prepare("SELECT content_scope_before_vip, content_scope FROM content_items WHERE id = 'music-a'").get())
      .toMatchObject({ content_scope_before_vip: "MUSIC", content_scope: "MUSIC" });
    sqlite.close();
  });

  it("defaults new unclassified content to quarantine while allowing explicit VIP_ADULT scope", () => {
    const sqlite = seededDatabase();
    applyMigration(sqlite);
    sqlite.prepare(`INSERT INTO content_items (
      id, slug, title, required_tier, creation_idempotency_key, created_at, updated_at
    ) VALUES ('new-a', 'new-a', 'Unclassified', 'EXCLUSIVE_VIP', 'new-a-key', ?, ?)`)
      .run(now, now);
    expect(sqlite.prepare("SELECT content_scope FROM content_items WHERE id = 'new-a'").get())
      .toMatchObject({ content_scope: "LEGACY_ADULT" });
    sqlite.prepare("UPDATE content_items SET content_scope = 'VIP_ADULT' WHERE id = 'new-a'").run();
    expect(sqlite.prepare("SELECT content_scope_before_vip, content_scope FROM content_items WHERE id = 'new-a'").get())
      .toMatchObject({ content_scope_before_vip: "LEGACY_ADULT", content_scope: "VIP_ADULT" });
    expect(() => sqlite.prepare("UPDATE content_items SET content_scope = 'UNKNOWN' WHERE id = 'new-a'").run()).toThrow();
    sqlite.close();
  });

  it("presents equal BTS access, Premium-only Telegram, two service discounts and optional VIP adult access", () => {
    const sqlite = seededDatabase();
    applyMigration(sqlite);
    const names = { EXCLUSIVE_BASIC: "Basic Shadow", EXCLUSIVE_PREMIUM: "Premium Shadow", EXCLUSIVE_VIP: "VIP Shadow" };
    for (const row of sqlite.prepare("SELECT tier, display_name, display_name_en FROM products").all()) {
      expect(String(row.display_name)).toMatch(new RegExp(`^${names[row.tier as keyof typeof names]} – `));
      expect(String(row.display_name_en)).toMatch(new RegExp(`^${names[row.tier as keyof typeof names]} – `));
    }
    const galleries = sqlite.prepare("SELECT tier, title_en, description_en FROM tier_perks WHERE id LIKE 'perk-basic-gallery-%' OR id LIKE 'perk-premium-galleries-%' OR id LIKE 'perk-vip-galleries-%'").all();
    expect(galleries).toHaveLength(3);
    expect(new Set(galleries.map((row) => row.title_en)).size).toBe(1);
    expect(new Set(galleries.map((row) => row.description_en)).size).toBe(1);
    const telegram = sqlite.prepare("SELECT tier, active FROM tier_perks WHERE id LIKE '%telegram%'").all();
    expect(telegram).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "EXCLUSIVE_PREMIUM", active: 1 }),
      expect.objectContaining({ tier: "EXCLUSIVE_VIP", active: 0 }),
    ]));
    const discounts = sqlite.prepare("SELECT tier, title_en, description_en FROM tier_perks WHERE id LIKE '%services-discount' AND active = 1").all();
    expect(discounts).toHaveLength(2);
    expect(discounts.map((row) => row.tier).sort()).toEqual(["EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"]);
    for (const row of discounts) {
      expect(row.title_en).toBe("15% off all services");
      expect(String(row.description_en)).toContain("music, voice and other business services");
    }
    expect(sqlite.prepare("SELECT tier, active FROM tier_perks WHERE id = 'perk-vip-optional-adult-area'").get())
      .toMatchObject({ tier: "EXCLUSIVE_VIP", active: 1 });
    expect(sqlite.prepare("SELECT count(*) AS total FROM tier_perks WHERE tier = 'EXCLUSIVE_VIP' AND active = 1 AND (id LIKE 'perk-vip-meeting-%' OR id LIKE 'perk-vip-whatsapp-%')").get())
      .toMatchObject({ total: 2 });
    sqlite.close();
  });
});
