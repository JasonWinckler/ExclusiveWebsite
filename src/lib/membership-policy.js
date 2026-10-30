// Keep checkout acceptance and cached public benefits on the same offer revision.
// This module is also imported by the production verifier; it has no browser dependencies.
export const membershipTermsVersion = "ORDER-2026-10-30-V3";

export function productCatalogPath(locale = "de") {
  return `/v1/products?locale=${locale === "en" ? "en" : "de"}&catalog=${encodeURIComponent(membershipTermsVersion)}`;
}
