import { describe, expect, it } from "vitest";
import { telegramPerkStatus } from "../src/shared/telegram";
import { membershipFixture } from "./helpers/membership-fixture";

const tiers = ["EXCLUSIVE_BASIC", "EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"] as const;
const ageRequest = { consent: true, instructionsVersion: "manual-age-v6", documentType: "PASSPORT", verificationRoute: "MANUAL_DOCUMENT_VIDEO" };

describe("Shadow membership access", () => {
  it.each(tiers)("gives %s the same BTS feed and media without age evidence", async (tier) => {
    const f = await membershipFixture({ tier });
    const list = await f.request("/v1/content");
    expect(list.status).toBe(200);
    const payload = await list.json() as { items: { slug: string; accessible: boolean }[] };
    expect(payload.items).toEqual([expect.objectContaining({ slug: "music", accessible: true, contentScope: "MUSIC" })]);
    expect((await f.request("/v1/content/music")).status).toBe(200);
    expect(f.mediaGet).toHaveBeenCalledTimes(1);
    f.sqlite.close();
  });

  it.each([null, "EXCLUSIVE_BASIC", "EXCLUSIVE_PREMIUM"] as const)("denies %s adult metadata, media, comments and age uploads even after historical approval", async (tier) => {
    const f = await membershipFixture({ tier, age: "APPROVED" });
    const list = await f.request("/v1/content?scope=VIP_ADULT");
    expect(list.status).toBe(403);
    expect(await list.text()).not.toContain("PRIVATE_TITLE_SENTINEL");
    expect(f.queries.some((sql) => sql.includes("FROM content_items c"))).toBe(false);
    for (const path of ["/v1/content/adult", "/v1/content/adult/comments"]) {
      const response = await f.request(path); expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("PRIVATE_TITLE_SENTINEL");
    }
    expect((await f.request("/v1/age-verification/cases", "POST", ageRequest)).status).toBe(403);
    expect((await f.request(`/v1/age-verification/cases/${crypto.randomUUID()}/evidence/VIDEO`, "PUT", {})).status).toBe(403);
    expect((await f.request(`/v1/age-verification/cases/${crypto.randomUUID()}/submit`, "POST", {})).status).toBe(403);
    expect(f.mediaGet).not.toHaveBeenCalled();
    f.sqlite.close();
  });

  it.each([
    { age: "NOT_STARTED" }, { age: "PENDING" }, { age: "REJECTED" }, { age: "APPROVED", held: true },
    { age: "APPROVED", expired: true }, { age: "APPROVED", paused: true },
    { age: "APPROVED", emailVerified: false }, { age: "APPROVED", device: false },
  ])("denies VIP adult access when readiness fails: %j", async (options) => {
    const f = await membershipFixture({ tier: "EXCLUSIVE_VIP", ...options });
    expect((await f.request("/v1/content?scope=VIP_ADULT")).status).toBe(403);
    expect((await f.request("/v1/content/adult")).status).toBe(403);
    expect((await f.request("/v1/content/adult/comments")).status).toBe(403);
    expect(f.mediaGet).not.toHaveBeenCalled();
    f.sqlite.close();
  });

  it("admits a verified active VIP only to explicitly published adult scope, never legacy", async () => {
    const f = await membershipFixture({ tier: "EXCLUSIVE_VIP", age: "APPROVED" });
    const result = await f.request("/v1/content?scope=VIP_ADULT");
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ scope: "VIP_ADULT", items: [{ slug: "adult", accessible: true, contentScope: "VIP_ADULT" }] });
    expect((await f.request("/v1/content/adult")).status).toBe(200);
    expect((await f.request("/v1/content/legacy")).status).toBe(403);
    expect((await f.request("/v1/content?scope=LEGACY_ADULT")).status).toBe(400);
    f.sqlite.close();
  });

  it("lets only an eligible VIP start the retained private age review", async () => {
    const f = await membershipFixture({ tier: "EXCLUSIVE_VIP" });
    const response = await f.request("/v1/age-verification/cases", "POST", ageRequest);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "PENDING", requiredEvidence: ["DOCUMENT_FRONT", "VIDEO"] });
    expect(f.sqlite.prepare("SELECT age_status FROM user_profiles").get()).toMatchObject({ age_status: "PENDING" });
    f.sqlite.close();
  });

  it.each(tiers)("reports truthful server discount and separate adult readiness for %s", async (tier) => {
    const f = await membershipFixture({ tier });
    const result = await f.request("/v1/membership/status");
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      benefits: { serviceDiscountPercent: tier === "EXCLUSIVE_BASIC" ? 0 : 15, telegramAvailable: false },
      entitlement: { serviceDiscountPercent: tier === "EXCLUSIVE_BASIC" ? 0 : 15 },
      adultArea: { eligible: tier === "EXCLUSIVE_VIP", available: false, ageStatus: "NOT_STARTED" },
    });
    f.sqlite.close();
  });

  it("does not include Telegram in music membership even with Premium and VIP records", async () => {
    const premium = await membershipFixture({ tier: "EXCLUSIVE_PREMIUM" });
    await expect(telegramPerkStatus(premium.env, premium.userId)).rejects.toMatchObject({ code: "PREMIUM_TELEGRAM_MUSIC_REVIEW_REQUIRED" });
    premium.sqlite.prepare(`INSERT INTO entitlements (id, appwrite_user_id, product_id, tier, status,
      starts_at, expires_at, created_at, updated_at) VALUES ('also-vip', ?, 'exclusive_vip_30d', 'EXCLUSIVE_VIP',
      'ACTIVE', ?, ?, ?, ?)`)
      .run(premium.userId, premium.now, premium.future, premium.now, premium.now);
    await expect(telegramPerkStatus(premium.env, premium.userId)).rejects.toMatchObject({ code: "PREMIUM_TELEGRAM_MUSIC_REVIEW_REQUIRED" });
    premium.sqlite.close();
  });
});
