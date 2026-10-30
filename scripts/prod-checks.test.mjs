import assert from "node:assert/strict";
import test from "node:test";
import { assertBuiltFrontend, assertCanonicalDeployment, assertMembershipReleaseSettings, assertPublicCatalog, assertReviewedMigrations, assertWhatsAppSecretConfigured, numericCloudflareErrorCodes, safeWranglerErrorCodes, verifyPublicCatalog } from "./prod-rollout.mjs";
import { membershipTermsVersion, productCatalogPath } from "../src/lib/membership-policy.js";

test("Cloudflare diagnostics expose only numeric codes, including nested errors", () => {
  assert.deepEqual(numericCloudflareErrorCodes([{ code: 10000, message: "private provider text", error_chain: [{ code: 9109, message: "private nested text" }] }, { code: "secret" }]), [10000, 9109]);
});
test("Wrangler diagnostics discard bodies and retain bounded error identifiers", () => {
  assert.deepEqual(safeWranglerErrorCodes('{"code":10000,"message":"private provider text"} OWNER_ADMIN_AUTH_PROFILE_MISMATCH'), ["OWNER_ADMIN_AUTH_PROFILE_MISMATCH", "Cloudflare code 10000"]);
});

const catalog = () => ({
  products: [
    { tier: "EXCLUSIVE_BASIC", displayName: "Basic Shadow · 30 days" },
    { tier: "EXCLUSIVE_PREMIUM", displayName: "Premium Shadow · 30 days" },
    { tier: "EXCLUSIVE_VIP", displayName: "VIP Shadow · 30 days" },
  ],
  tierPerks: {
    EXCLUSIVE_BASIC: [{ id: "bts", title: "Behind the scenes", description: "Music updates" }],
    EXCLUSIVE_PREMIUM: [{ id: "discount", title: "15% off all services", description: "Music and voice services" }],
    EXCLUSIVE_VIP: [{ id: "discount", title: "15 % off services", description: "Music and voice services" }],
  },
});

test("accepts complete new tier names and benefits", () => assert.doesNotThrow(() => assertPublicCatalog(catalog())));
test("checks both frontend catalog URLs with normal caching and no release-only cachebuster", async () => {
  const requested = [];
  await verifyPublicCatalog(async (url, options) => {
    requested.push(url);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Accept, "application/json");
    assert.equal(options.cache, undefined);
    assert.equal(options.redirect, "error");
    assert.equal(new URL(url).searchParams.get("catalog"), membershipTermsVersion);
    assert.deepEqual([...new URL(url).searchParams.keys()], ["locale", "catalog"]);
    const value = catalog();
    if (new URL(url).searchParams.get("locale") === "de") {
      for (const product of value.products) product.displayName = product.displayName.replace("30 days", "30 Tage");
      value.tierPerks.EXCLUSIVE_PREMIUM[0].title = "15 % Rabatt auf alle Dienstleistungen";
      value.tierPerks.EXCLUSIVE_VIP[0].title = "15 % Rabatt auf alle Dienstleistungen";
    }
    return new Response(JSON.stringify(value));
  });
  assert.deepEqual(requested, ["de", "en"].map((locale) => `https://exclusive.jason-shadow.com/api/member${productCatalogPath(locale)}`));
});

for (const locale of ["de", "en"]) {
  test(`rejects a stale Telegram benefit in the ${locale} frontend catalog response`, async () => {
    await assert.rejects(verifyPublicCatalog(async (url) => {
      const value = catalog();
      if (new URL(url).searchParams.get("locale") === locale) {
        value.tierPerks.EXCLUSIVE_PREMIUM.push({ id: "legacy-telegram", title: "Private channel", description: "Access" });
      }
      return new Response(JSON.stringify(value));
    }), /Telegram/);
  });
}

test("rejects old tier display names even when new labels appear in unrelated data", () => {
  const value = catalog(); value.products[0].displayName = "Exclusive Basic";
  value.tierPerks.EXCLUSIVE_BASIC[0].description = "Basic Shadow";
  assert.throws(() => assertPublicCatalog(value), /Basic Shadow/);
});
test("rejects missing benefits", () => {
  const value = catalog(); value.tierPerks.EXCLUSIVE_PREMIUM = [];
  assert.throws(() => assertPublicCatalog(value), /benefits are missing/);
});
test("requires both Premium and VIP service discounts", () => {
  const value = catalog(); value.tierPerks.EXCLUSIVE_VIP[0].title = "Behind the scenes";
  assert.throws(() => assertPublicCatalog(value), /discount is missing/);
});
for (const tier of ["EXCLUSIVE_BASIC", "EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP", "FUTURE_TIER"]) {
  test(`rejects Telegram benefits in ${tier}`, () => {
    const value = catalog();
    (value.tierPerks[tier] ||= []).push({ id: "legacy-telegram", title: "Private channel", description: "Access" });
    assert.throws(() => assertPublicCatalog(value), /Telegram/);
  });
}

test("allows the reviewed Telegram-removal migration but rejects any unrelated migration", () => {
  assert.doesNotThrow(() => assertReviewedMigrations([
    "0027_order_of_shadows_music_membership.sql", "0028_membership_benefits_vip_area.sql",
    "0029_remove_telegram_music_perks.sql",
  ]));
  assert.doesNotThrow(() => assertReviewedMigrations([]));
  assert.throws(() => assertReviewedMigrations(["0030_unreviewed.sql"]), /Unreviewed/);
  assert.throws(() => assertReviewedMigrations(["0026_auth_policy.sql"]), /Unreviewed/);
});

const membershipSettings = () => ({ bindings: [
  { name: "VIP_WHATSAPP_MUSIC_REVIEWED", type: "plain_text", text: "true" },
  { name: "MUSIC_TELEGRAM_REVIEWED", type: "plain_text", text: "false" },
  { name: "VIP_WHATSAPP_NUMBER", type: "secret_text" },
] });

test("preflight accepts the existing secret without expecting newly deployed review flags", () => {
  const settings = membershipSettings();
  settings.bindings = settings.bindings.slice(2);
  settings.bindings.push({ name: "MUSIC_COMMUNITY_REVIEWED", type: "plain_text", text: "false" });
  Object.defineProperty(settings.bindings[0], "text", { get() { throw new Error("Phone value must not be read"); } });
  assert.equal(assertWhatsAppSecretConfigured(settings), true);
  assert.throws(() => assertMembershipReleaseSettings(settings), /WhatsApp music approval/);
});

test("preflight fails closed for missing, duplicate or non-secret phone bindings", () => {
  assert.throws(() => assertWhatsAppSecretConfigured({}), /binding metadata/);
  assert.throws(() => assertWhatsAppSecretConfigured({ bindings: [] }), /number secret binding/);
  const duplicate = membershipSettings(); duplicate.bindings.push({ ...duplicate.bindings[2] });
  assert.throws(() => assertWhatsAppSecretConfigured(duplicate), /number secret binding/);
  const plaintext = membershipSettings(); plaintext.bindings[2].type = "plain_text";
  Object.defineProperty(plaintext.bindings[2], "text", { get() { throw new Error("Phone value must not be read"); } });
  assert.throws(() => assertWhatsAppSecretConfigured(plaintext), /number secret binding/);
});

test("returns only selected booleans and never accesses secret or unrelated binding values", () => {
  const settings = membershipSettings();
  const failOnValueRead = { get() { throw new Error("Secret value must not be read"); } };
  Object.defineProperty(settings.bindings[2], "text", failOnValueRead);
  Object.defineProperty(settings.bindings[2], "value", failOnValueRead);
  settings.bindings.push({ name: "UNRELATED_PRIVATE_SETTING", type: "plain_text", get text() { throw new Error("Unrelated value must not be read"); } });
  assert.deepEqual(assertMembershipReleaseSettings(settings), {
    whatsappMusicReviewed: true, telegramMusicDisabled: true, whatsappNumberSecretConfigured: true,
  });
});

for (const [index, expectedError] of [[0, /WhatsApp music approval/], [1, /Telegram music approval/]]) {
  test(`requires explicit reviewed string value for ${index === 0 ? "WhatsApp" : "Telegram"}`, () => {
    for (const value of [undefined, "", "TRUE", "FALSE", true, false]) {
      const settings = membershipSettings(); settings.bindings[index].text = value;
      assert.throws(() => assertMembershipReleaseSettings(settings), expectedError);
    }
    const settings = membershipSettings(); settings.bindings[index].text = index === 0 ? "false" : "true";
    assert.throws(() => assertMembershipReleaseSettings(settings), expectedError);
    settings.bindings[index].type = "json"; settings.bindings[index].text = index === 0 ? "true" : "false";
    assert.throws(() => assertMembershipReleaseSettings(settings), expectedError);
  });
}

test("rejects missing or ambiguous membership release bindings", () => {
  assert.throws(() => assertMembershipReleaseSettings({}), /binding metadata/);
  for (let index = 0; index < 3; index += 1) {
    const missing = membershipSettings(); missing.bindings.splice(index, 1);
    assert.throws(() => assertMembershipReleaseSettings(missing));
    const duplicate = membershipSettings(); duplicate.bindings.push({ ...duplicate.bindings[index] });
    assert.throws(() => assertMembershipReleaseSettings(duplicate));
  }
});

test("rejects a plaintext phone binding without reading or disclosing its value", () => {
  const settings = membershipSettings(); settings.bindings[2].type = "plain_text";
  Object.defineProperty(settings.bindings[2], "text", { get() { throw new Error("Phone value must not be read"); } });
  assert.throws(() => assertMembershipReleaseSettings(settings), /number secret binding/);
});
const built = '<script src="/assets/index-NEW123.js"></script><link href="/assets/index-NEW456.css">';
test("accepts matching hashed frontend entries", () => assert.doesNotThrow(() => assertBuiltFrontend(built, built)));
test("rejects stale frontend even when its page title matches", () => {
  assert.throws(() => assertBuiltFrontend(built, '<title>Order of Shadows</title><script src="/assets/index-OLD123.js"></script>'), /different build/);
});
test("requires the exact reviewed successful canonical production deployment", () => {
  const commit = "a".repeat(40);
  const project = { canonical_deployment: { environment: "production", latest_stage: { status: "success" }, deployment_trigger: { metadata: { commit_hash: commit } } } };
  assert.doesNotThrow(() => assertCanonicalDeployment(project, commit));
  assert.throws(() => assertCanonicalDeployment(project, "b".repeat(40)), /exact reviewed commit/);
  project.canonical_deployment.latest_stage.status = "active";
  assert.throws(() => assertCanonicalDeployment(project, commit), /exact reviewed commit/);
});
