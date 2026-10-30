import { afterEach, describe, expect, it, vi } from "vitest";
import membership from "../src/workers/membership-api";
import type { MembershipEnv } from "../src/shared/types";
import { testDatabase } from "./helpers/database";

afterEach(() => vi.unstubAllGlobals());

const origin = "https://exclusive.jason-shadow.com";

describe("catalog cache across offer revisions", () => {
  it.each(["de", "en"])("ignores the previous Telegram offer cache in %s and caches the current catalog", async (locale) => {
    const { DB, sqlite } = testDatabase();
    const stores = new Map<string, Map<string, Response>>();
    const previous = new Map<string, Response>();
    for (const oldLocale of ["de", "en"]) {
      const query = new URLSearchParams({ locale: oldLocale, origin });
      previous.set(`https://membership.internal/__edge-cache/products?${query}`, Response.json({
        products: [{ displayName: "Premium Shadow", tier: "EXCLUSIVE_PREMIUM" }],
        tierPerks: { EXCLUSIVE_PREMIUM: [{ id: "perk-premium-telegram", title: "Telegram", description: "Previous offer" }] },
      }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } }));
    }
    stores.set("order-of-shadows-products-v3", previous);
    const open = vi.fn(async (name: string) => {
      let store = stores.get(name);
      if (!store) { store = new Map(); stores.set(name, store); }
      return {
        match: async (key: Request) => store.get(key.url)?.clone(),
        put: async (key: Request, value: Response) => { store.set(key.url, value.clone()); },
      };
    });
    vi.stubGlobal("caches", { open });
    const prepare = vi.fn((sql: string) => DB.prepare(sql));
    const env = { DB: { prepare }, SITE_ORIGINS: origin,
      USER_RATE_LIMITER: { limit: async () => ({ success: true }) } } as unknown as MembershipEnv;
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext;
    const request = (release: string) => membership.fetch(new Request(
      `https://membership.internal/v1/products?locale=${locale}&release=${release}`,
      { headers: { Origin: origin } },
    ), env, ctx);

    const fresh = await request("current-release");
    expect(fresh.status).toBe(200);
    const current = await fresh.json() as { products: { tier: string }[]; tierPerks: Record<string, unknown[]> };
    expect(new Set(current.products.map((product) => product.tier))).toEqual(new Set([
      "EXCLUSIVE_BASIC", "EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP",
    ]));
    expect(JSON.stringify(current.tierPerks)).not.toMatch(/telegram/i);
    expect(fresh.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(fresh.headers.get("Cache-Control")).toContain("s-maxage=900");
    expect(prepare).toHaveBeenCalledTimes(1);
    await Promise.all(pending);

    // New request IDs and deployment probe parameters must not bypass the
    // current public cache or force a catalog database query on every request.
    const cached = await request("another-release-probe");
    expect(cached.status).toBe(200);
    expect(await cached.json()).toEqual(current);
    expect(cached.headers.get("X-Request-Id")).not.toBe(fresh.headers.get("X-Request-Id"));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(previous.size).toBe(2);
    sqlite.close();
  });
});
