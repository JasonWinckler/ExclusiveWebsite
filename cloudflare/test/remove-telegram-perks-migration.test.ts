import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/database";

const migration = readFileSync(
  new URL("../migrations/0029_remove_telegram_music_perks.sql", import.meta.url), "utf8",
);
const now = "2026-10-30T12:00:00.000Z";

function seededDatabase() {
  const { sqlite } = testDatabase("0029");
  // Cover all tier labels and both identifier- and display-name-based catalog entries.
  sqlite.prepare(`INSERT INTO tier_perks (
    id, tier, title, title_en, active, created_at, updated_at
  ) VALUES ('custom-community', 'EXCLUSIVE_BASIC', 'Telegram-Zugang', 'Private community', 1, ?, ?)`)
    .run(now, now);
  sqlite.prepare(`INSERT INTO tier_perks (
    id, tier, title, title_en, active, created_at, updated_at
  ) VALUES ('custom-vip-community', 'EXCLUSIVE_VIP', 'Zusätzliche Community', 'Telegram channel', 1, ?, ?)`)
    .run(now, now);
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
  ) VALUES ('order-a', 'member-a', 'exclusive_premium_30d', 'SEPA_CREDIT_TRANSFER',
    'test-reference', 1999, 'EUR', 'ACTIVE', ?, 'order-a-key',
    'ORDER-2026-10-30-V1', ?, 'Test Member', ?, ?)`)
    .run(now, now, now, now);
  sqlite.prepare(`INSERT INTO invoices (
    id, subscription_id, invoice_number, billing_name, billing_street,
    billing_postal_code, billing_city, billing_country_code, seller_name,
    seller_address, seller_email, amount_minor, currency,
    issued_at, due_at, created_at, updated_at
  ) VALUES ('invoice-a', 'order-a', 'TEST-001', 'Test Member', 'Test Street',
    '00000', 'Test City', 'DE', 'Test Seller', 'Test Address', 'seller@example.test',
    1999, 'EUR', ?, ?, ?, ?)`)
    .run(now, now, now, now);
  sqlite.prepare(`INSERT INTO entitlements (
    id, appwrite_user_id, product_id, subscription_id, tier, status,
    starts_at, expires_at, created_at, updated_at
  ) VALUES ('entitlement-a', 'member-a', 'exclusive_premium_30d', 'order-a',
    'EXCLUSIVE_PREMIUM', 'ACTIVE', ?, '2027-12-31T00:00:00.000Z', ?, ?)`)
    .run(now, now, now);
  sqlite.prepare(`INSERT INTO telegram_connections (
    appwrite_user_id, telegram_user_id, entitlement_id, status,
    linked_at, joined_at, last_synced_at, created_at, updated_at
  ) VALUES ('member-a', '12345', 'entitlement-a', 'ACTIVE', ?, ?, ?, ?, ?)`)
    .run(now, now, now, now, now);
  sqlite.prepare(`INSERT INTO telegram_invites (
    id, appwrite_user_id, entitlement_id, invite_ciphertext, expires_at,
    created_at, telegram_user_id, invite_link_sha256, status, updated_at
  ) VALUES ('invite-a', 'member-a', 'entitlement-a', 'test-ciphertext',
    '2027-12-31T00:00:00.000Z', ?, '12345', ?, 'ISSUED', ?)`)
    .run(now, "b".repeat(64), now);
  sqlite.prepare(`INSERT INTO telegram_link_tokens (
    id, appwrite_user_id, entitlement_id, token_sha256, expires_at, created_at
  ) VALUES ('token-a', 'member-a', 'entitlement-a', ?, '2027-12-31T00:00:00.000Z', ?)`)
    .run("c".repeat(64), now);
  return sqlite;
}

function applyMigration(sqlite: ReturnType<typeof seededDatabase>) {
  sqlite.exec("BEGIN");
  try { sqlite.exec(migration); sqlite.exec("COMMIT"); }
  catch (error) { sqlite.exec("ROLLBACK"); throw error; }
}

describe("retire Telegram from music membership catalog", () => {
  it("deactivates Telegram entries across all tiers without deleting their catalog history", () => {
    const sqlite = seededDatabase();
    const before = sqlite.prepare("SELECT * FROM tier_perks ORDER BY id").all();
    applyMigration(sqlite);
    const after = sqlite.prepare("SELECT * FROM tier_perks ORDER BY id").all();
    expect(after).toHaveLength(before.length);
    for (let index = 0; index < before.length; index += 1) {
      const previous = before[index]!;
      const current = after[index]!;
      const telegram = [previous.id, previous.title, previous.title_en]
        .some((value) => String(value ?? "").toLowerCase().includes("telegram"));
      if (telegram) {
        expect(current.active).toBe(0);
        expect({ ...current, active: previous.active, updated_at: previous.updated_at }).toEqual(previous);
      } else {
        expect(current).toEqual(previous);
      }
    }
    expect(sqlite.prepare("SELECT active FROM tier_perks WHERE id = 'custom-community'").get())
      .toMatchObject({ active: 0 });
    expect(sqlite.prepare("SELECT active FROM tier_perks WHERE id = 'custom-vip-community'").get())
      .toMatchObject({ active: 0 });
    expect(sqlite.prepare("SELECT count(*) AS total FROM tier_perks WHERE active = 1 AND id LIKE 'perk-vip-whatsapp-%'").get())
      .toMatchObject({ total: 1 });
    sqlite.close();
  });

  it("leaves customer, payment, pricing and existing Telegram state byte-for-byte unchanged", () => {
    const sqlite = seededDatabase();
    const tables = ["products", "user_profiles", "auth_accounts", "subscriptions", "invoices", "entitlements",
      "telegram_connections", "telegram_invites", "telegram_link_tokens"];
    const snapshots = new Map(tables.map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]));
    applyMigration(sqlite);
    for (const table of tables) expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(snapshots.get(table));
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.close();
  });
});
