import { vi } from "vitest";
import membership from "../../src/workers/membership-api";
import { sha256Hex } from "../../src/shared/security";
import type { MembershipEnv } from "../../src/shared/types";
import { testDatabase } from "./database";

export async function membershipFixture(options: {
  tier?: "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP" | null;
  age?: string; held?: boolean; emailVerified?: boolean; expired?: boolean; device?: boolean; paused?: boolean;
} = {}) {
  const { sqlite, DB } = testDatabase();
  const now = new Date().toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const userId = "test-user";
  const sessionToken = "a".repeat(43);
  const deviceToken = "d".repeat(43);
  const tier = options.tier === undefined ? "EXCLUSIVE_BASIC" : options.tier;
  sqlite.prepare(`INSERT INTO user_profiles (appwrite_user_id, email, display_name, account_status,
    email_verified, age_status, administrative_hold, jurisdiction_code, country_code, privacy_regime,
    privacy_notice_acknowledged_at, created_at, updated_at)
    VALUES (?, 'member@example.test', 'Fixture Member', 'ACTIVE', ?, ?, ?, 'EU-EEA-DE', 'DE', 'EU_GDPR', ?, ?, ?)`)
    .run(userId, options.emailVerified === false ? 0 : 1, options.age ?? "NOT_STARTED", options.held ? 1 : 0, now, now, now);
  sqlite.prepare(`INSERT INTO auth_accounts (user_id, email, created_at, updated_at)
    VALUES (?, 'member@example.test', ?, ?)`).run(userId, now, now);
  sqlite.prepare(`INSERT INTO auth_sessions (id, user_id, token_sha256, created_at, last_seen_at, expires_at)
    VALUES ('test-session', ?, ?, ?, ?, ?)`).run(userId, await sha256Hex(sessionToken), now, now, future);
  if (tier) sqlite.prepare(`INSERT INTO entitlements (id, appwrite_user_id, product_id, tier, status,
    starts_at, expires_at, paused_at, created_at, updated_at)
    VALUES ('test-entitlement', ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`)
    .run(userId, `${tier.toLowerCase()}_30d`, tier, past, options.expired ? past : future, options.paused ? now : null, now, now);
  if (options.device !== false) sqlite.prepare(`INSERT INTO registered_devices (id, appwrite_user_id,
    device_token_hash, registration_idempotency_key, status, first_seen_at, last_seen_at, created_at, updated_at)
    VALUES ('test-device', ?, ?, 'test-device-registration', 'ACTIVE', ?, ?, ?, ?)`)
    .run(userId, await sha256Hex(deviceToken), now, now, now, now);
  const contentIds: Record<string, string> = {};
  for (const [slug, scope, requiredTier] of [["music", "MUSIC", "EXCLUSIVE_VIP"], ["adult", "VIP_ADULT", "FREE"], ["legacy", "LEGACY_ADULT", "FREE"]]) {
    const id = crypto.randomUUID(); contentIds[slug!] = id;
    sqlite.prepare(`INSERT INTO content_items (id, slug, title, body_text, content_scope, content_status,
      required_tier, creation_idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'Private fixture metadata', ?, 'ACTIVE', ?, ?, ?, ?)`)
      .run(id, slug!, scope === "MUSIC" ? "Music fixture" : "PRIVATE_TITLE_SENTINEL", scope!, requiredTier!, `create-${slug}`, now, now);
    sqlite.prepare(`INSERT INTO content_uploads (id, content_item_id, r2_object_key, content_type, size_bytes,
      object_etag, uploaded_by_appwrite_user_id, idempotency_key, status, created_at, updated_at)
      VALUES (?, ?, ?, 'image/png', 18, 'test-etag', 'test-admin', ?, 'ACTIVE', ?, ?)`)
      .run(crypto.randomUUID(), id, `fixture/${slug}`, `upload-${slug}`, now, now);
  }
  const queries: string[] = [];
  const trackedDB = new Proxy(DB, { get(target, key) {
    if (key === "prepare") return (sql: string) => { queries.push(sql); return target.prepare(sql); };
    return Reflect.get(target, key);
  } });
  const mediaGet = vi.fn(async () => ({ body: "TEST_FIXTURE_MEDIA", etag: "test-etag", size: 18 }));
  const env = {
    DB: trackedDB, SITE_ORIGINS: "https://exclusive.jason-shadow.com", DEVICE_LIMIT: "3",
    USER_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PROTECTED_CONTENT_MODE: "private-r2-v1", AGE_REVIEW_MODE: "manual-r2-v1",
    CONTENT_MEDIA: { get: mediaGet, head: async () => ({ etag: "test-etag", size: 18 }) },
    VIP_WHATSAPP_MUSIC_REVIEWED: "true", MUSIC_TELEGRAM_REVIEWED: "false",
    TELEGRAM_BOT_TOKEN: "x".repeat(40), TELEGRAM_CHAT_ID: "-123",
    TELEGRAM_BOT_USERNAME: "TestBot", TELEGRAM_INVITE_ENCRYPTION_KEY: "test-key",
  } as unknown as MembershipEnv;
  const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;
  async function request(path: string, method = "GET", body?: unknown) {
    return membership.fetch(new Request(`https://membership.internal${path}`, {
      method, headers: { Cookie: `__Host-shadow_session=${sessionToken}`, Origin: "https://exclusive.jason-shadow.com",
        "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-Device-Token": deviceToken },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, ctx);
  }
  return { sqlite, env, request, queries, mediaGet, userId, contentIds, now, future, sessionToken, deviceToken };
}
