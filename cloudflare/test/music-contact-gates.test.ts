import { afterEach, describe, expect, it, vi } from "vitest";
import { administerTelegramConnection, createTelegramClaim, handleTelegramWebhook, syncTelegramAccess, telegramPerkStatus } from "../src/shared/telegram";
import type { MembershipEnv } from "../src/shared/types";
import { membershipFixture } from "./helpers/membership-fixture";

afterEach(() => vi.unstubAllGlobals());

// Reserved fictional number; never use a configured production contact in tests.
const fictionalNumber = "+1 202 555 0107";

describe("independent music contact permissions", () => {
  it("lets an active verified VIP use reviewed WhatsApp without age approval while Telegram remains disabled", async () => {
    const f = await membershipFixture({ tier: "EXCLUSIVE_VIP", age: "NOT_STARTED" });
    f.env.VIP_WHATSAPP_NUMBER = fictionalNumber;
    const external = vi.fn(() => { throw new Error("No external contact request expected"); });
    vi.stubGlobal("fetch", external);
    const response = await f.request("/v1/perks/vip-whatsapp");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: true, phoneNumber: fictionalNumber, whatsappUrl: "https://wa.me/12025550107" });
    expect((await f.request("/v1/perks/telegram")).status).toBe(503);
    expect((await f.request("/v1/perks/telegram/claim", "POST", {})).status).toBe(503);
    expect(external).not.toHaveBeenCalled();
    f.sqlite.close();
  });

  it.each([
    { tier: null }, { tier: "EXCLUSIVE_BASIC" }, { tier: "EXCLUSIVE_PREMIUM" },
    { tier: "EXCLUSIVE_VIP", held: true }, { tier: "EXCLUSIVE_VIP", emailVerified: false },
    { tier: "EXCLUSIVE_VIP", expired: true }, { tier: "EXCLUSIVE_VIP", paused: true },
  ] as const)("denies WhatsApp without current verified unheld VIP access: %j", async (options) => {
    const f = await membershipFixture(options);
    f.env.VIP_WHATSAPP_NUMBER = fictionalNumber;
    const response = await f.request("/v1/perks/vip-whatsapp");
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("phoneNumber");
    f.sqlite.close();
  });

  it.each(["false", undefined])("requires its own WhatsApp approval even if other and legacy gates are true: %s", async (approval) => {
    const f = await membershipFixture({ tier: "EXCLUSIVE_VIP" });
    Object.assign(f.env, { VIP_WHATSAPP_NUMBER: fictionalNumber, VIP_WHATSAPP_MUSIC_REVIEWED: approval,
      MUSIC_TELEGRAM_REVIEWED: "true", MUSIC_COMMUNITY_REVIEWED: "true" });
    const response = await f.request("/v1/perks/vip-whatsapp");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "VIP_WHATSAPP_MUSIC_REVIEW_REQUIRED" } });
    f.sqlite.close();
  });

  it.each(["false", undefined])("never authorizes Telegram through WhatsApp or the retired shared gate: %s", async (approval) => {
    const prepare = vi.fn(() => { throw new Error("Enrollment must stop before querying account data"); });
    const external = vi.fn(() => { throw new Error("No external Telegram request expected"); });
    vi.stubGlobal("fetch", external);
    const env = { DB: { prepare }, MUSIC_TELEGRAM_REVIEWED: approval, VIP_WHATSAPP_MUSIC_REVIEWED: "true",
      MUSIC_COMMUNITY_REVIEWED: "true", TELEGRAM_WEBHOOK_SECRET: "test-secret" } as unknown as MembershipEnv;
    await expect(telegramPerkStatus(env, "test-user")).rejects.toMatchObject({ code: "PREMIUM_TELEGRAM_MUSIC_REVIEW_REQUIRED" });
    await expect(createTelegramClaim(env, "test-user")).rejects.toMatchObject({ code: "PREMIUM_TELEGRAM_MUSIC_REVIEW_REQUIRED" });
    const webhook = await handleTelegramWebhook(new Request("https://membership.internal/v1/telegram/webhook", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
      body: JSON.stringify({ update_id: 7, message: { chat: { type: "private" }, from: { id: 12345 }, text: `/start ${"a".repeat(43)}` } }),
    }), env);
    expect(webhook).toEqual({ ok: true });
    expect(prepare).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
  });
});

async function legacyConnection(status = "ACTIVE", expired = false) {
  const f = await membershipFixture({ tier: "EXCLUSIVE_PREMIUM", expired });
  f.sqlite.prepare(`INSERT INTO telegram_connections (appwrite_user_id, telegram_user_id, entitlement_id,
    status, linked_at, last_synced_at, created_at, updated_at)
    VALUES (?, '12345', 'test-entitlement', ?, ?, ?, ?, ?)`).run(f.userId, status, f.now, f.now, f.now, f.now);
  return f;
}

describe("existing Telegram lifecycle without music enrollment", () => {
  it.each(["ACTIVE", "MEMBERSHIP_INACTIVE"])("does not remove or restore a current legacy connection merely because catalog access is disabled: %s", async (status) => {
    const f = await legacyConnection(status);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS count FROM tier_perks WHERE active = 1 AND lower(id) LIKE '%telegram%'").get())
      .toMatchObject({ count: 0 });
    const external = vi.fn(() => { throw new Error("No new external membership action expected"); });
    vi.stubGlobal("fetch", external);
    expect(await syncTelegramAccess(f.env)).toEqual({ checked: 1, removed: 0, restored: 0, deleted: 0 });
    expect(f.sqlite.prepare("SELECT status, last_error_code FROM telegram_connections").get()).toMatchObject({ status, last_error_code: null });
    expect(external).not.toHaveBeenCalled();
    f.sqlite.close();
  });

  it("denies an administrator restore without issuing an invitation or changing its legacy status", async () => {
    const f = await legacyConnection("ADMIN_SUSPENDED");
    const external = vi.fn(() => { throw new Error("No new external invitation expected"); });
    vi.stubGlobal("fetch", external);
    await expect(administerTelegramConnection(f.env, "test-admin", f.userId, "RESTORE", "Test restore request", "test-correlation"))
      .rejects.toMatchObject({ code: "PREMIUM_TELEGRAM_MUSIC_REVIEW_REQUIRED" });
    expect(f.sqlite.prepare("SELECT status FROM telegram_connections").get()).toMatchObject({ status: "ADMIN_SUSPENDED" });
    expect(external).not.toHaveBeenCalled();
    f.sqlite.close();
  });

  it.each(["expired", "deleted"])("retains existing account-expiry/deletion revocation behavior: %s", async (condition) => {
    const f = await legacyConnection("ACTIVE", condition === "expired");
    if (condition === "deleted") f.sqlite.prepare("UPDATE user_profiles SET account_status = 'DELETED'").run();
    const external = vi.fn(async () => Response.json({ ok: true, result: true }));
    vi.stubGlobal("fetch", external);
    const result = await syncTelegramAccess(f.env);
    expect(result).toMatchObject({ checked: 1, removed: condition === "expired" ? 1 : 0, deleted: condition === "deleted" ? 1 : 0, restored: 0 });
    expect(external.mock.calls).toHaveLength(2);
    if (condition === "deleted") expect(f.sqlite.prepare("SELECT * FROM telegram_connections").all()).toEqual([]);
    else expect(f.sqlite.prepare("SELECT status FROM telegram_connections").get()).toMatchObject({ status: "MEMBERSHIP_INACTIVE" });
    f.sqlite.close();
  });
});
