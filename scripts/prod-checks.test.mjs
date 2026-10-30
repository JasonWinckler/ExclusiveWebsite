import assert from "node:assert/strict";
import test from "node:test";
import { assertBuiltFrontend, assertCanonicalDeployment, assertPublicCatalog } from "./prod-rollout.mjs";

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
test("rejects the removed VIP Telegram benefit", () => {
  const value = catalog(); value.tierPerks.EXCLUSIVE_VIP.push({ id: "old-vip-telegram", title: "Private channel", description: "Access" });
  assert.throws(() => assertPublicCatalog(value), /Telegram/);
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
