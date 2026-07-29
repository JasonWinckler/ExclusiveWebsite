import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const cloudflareRoot = join(repositoryRoot, "cloudflare");

function read(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function filesRecursively(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === "node_modules" || name === ".wrangler" || name === ".git") return [];
    return statSync(path).isDirectory() ? filesRecursively(path) : [path];
  });
}

describe("browser and repository security contract", () => {
  it("keeps Appwrite labels and another user's ID outside browser-controlled API bodies", () => {
    const frontend = read("src/lib/appwrite.js");
    expect(frontend).not.toContain("Functions");
    expect(frontend).not.toContain("TablesDB");
    expect(frontend).not.toMatch(/\b(?:new\s+)?Storage\s*\(/);
    expect(frontend).not.toContain("updateLabels");
    expect(frontend).not.toMatch(/cloudflareRequest\([^)]*\{[^}]*userId/s);
    expect(read("cloudflare/src/workers/membership-api.ts"))
      .toContain("identity.userId");
  });

  it("does not expose Appwrite server secrets or obsolete resource IDs to Vite", () => {
    const example = read(".env.example");
    expect(example).toContain("VITE_CLOUDFLARE_API_BASE_URL");
    expect(example).not.toMatch(/VITE_.*(?:KEY|SECRET|DATABASE|BUCKET|FUNCTION|COLLECTION)/);
    expect(read("src/lib/appwrite.js")).not.toContain("APPWRITE_SERVER_API_KEY");
    const wranglerConfigs = filesRecursively(cloudflareRoot)
      .filter((path) => /wrangler\..*\.jsonc$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(wranglerConfigs).not.toMatch(/(?:API_KEY|WEBHOOK_SECRET|SERVER_API_KEY)\s*":\s*"/);
  });

  it("routes authentication email exclusively through the private custom mail service", () => {
    const frontend = read("src/lib/appwrite.js");
    const membershipConfig = read("cloudflare/wrangler.membership-api.jsonc");
    const membershipWorker = read("cloudflare/src/workers/membership-api.ts");
    const identityConfig = read("cloudflare/wrangler.identity-projection.jsonc");
    expect(frontend).not.toContain("account.createVerification");
    expect(frontend).not.toContain("account.createRecovery");
    expect(membershipConfig).toMatch(/"AUTH_EMAIL_MODE": "CUSTOM"/);
    expect(membershipConfig).toContain("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
    expect(membershipConfig).not.toContain("INVOICE_TAX_IDENTIFIER");
    expect(membershipWorker).toContain('src="cid:shadow-brand-banner"');
    expect(membershipWorker).toContain("INVOICE_TAX_IDENTIFIER_NOT_CONFIGURED");
    expect(read("cloudflare/migrations/0013_invoice_tax_identifier.sql"))
      .toContain("seller_tax_identifier");
    expect(membershipWorker).toContain("https://exclusive.jason-shadow.com/legal/");
    expect(membershipWorker).toContain("https://exclusive.jason-shadow.com/legal/eu/");
    expect(membershipWorker).toContain("https://exclusive.jason-shadow.com/legal/us/");
    expect(identityConfig).toContain('"binding": "EMAIL_ASSETS"');
  });

  it("uses owner-operated review and private R2 without a public storage URL builder", () => {
    expect(read("cloudflare/wrangler.membership-api.jsonc"))
      .toMatch(/"AGE_REVIEW_MODE": "manual-r2-v1"/);
    expect(read("cloudflare/wrangler.membership-api.jsonc"))
      .toMatch(/"SEPA_TRANSFER_MODE": "epc-qr-credit-transfer-v1"/);
    expect(read("cloudflare/wrangler.membership-api.jsonc"))
      .toMatch(/"PROTECTED_CONTENT_MODE": "private-r2-v1"/);
    expect(read("src/lib/appwrite.js")).not.toMatch(/(?:bucketId|r2ObjectKey|protectedUrl)/i);
  });

  it("uses unique upload, order, bank transaction, and import idempotency keys", () => {
    const migration = read("cloudflare/migrations/0001_initial.sql");
    expect(migration).toContain("external_transaction_id TEXT NOT NULL UNIQUE");
    expect(migration).toContain("creation_idempotency_key TEXT NOT NULL UNIQUE");
    expect(migration).toContain("submission_idempotency_key TEXT UNIQUE");
    expect(read("cloudflare/src/workers/admin-api.ts"))
      .toContain("N26_CSV_EXACT_MATCH");
  });

  it("requires consent, only document-specific pages, a one-time challenge, and live video review", () => {
    const migration = read("cloudflare/migrations/0001_initial.sql");
    const ageRouteMigration = read("cloudflare/migrations/0014_localized_catalog_and_age_routes.sql");
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const frontend = read("src/App.jsx");
    expect(migration).toContain("'DOCUMENT_FRONT', 'DOCUMENT_BACK', 'VIDEO'");
    expect(migration).toContain("liveness_challenge_json TEXT NOT NULL");
    expect(migration).toContain("consented_at TEXT NOT NULL");
    expect(ageRouteMigration).toContain("'NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENCE'");
    expect(ageRouteMigration).toContain("verification_route = 'MANUAL_DOCUMENT_VIDEO'");
    expect(ageRouteMigration).not.toMatch(/bundid/i);
    expect(membership).toContain("AGE_REVIEW_CONSENT_REQUIRED");
    expect(membership).toContain('documentType === "PASSPORT"');
    expect(membership).toContain("requiredAgeEvidence(ageCase.document_type)");
    expect(admin).toContain("AGE_APPROVAL_CHECKLIST_INCOMPLETE");
    expect(admin).toContain("deleteAgeEvidenceImmediately");
    expect(frontend).toContain("navigator.mediaDevices.getUserMedia");
    expect(frontend).toContain("new MediaRecorder");
    expect(frontend).not.toMatch(/name="video"\s+type="file"/);
    expect(frontend).toContain("prepareIdCopy");
  });

  it("localizes the product catalog server-side and supports manual admin membership grants", () => {
    const migration = read("cloudflare/migrations/0014_localized_catalog_and_age_routes.sql");
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const frontendApi = read("src/lib/appwrite.js");
    expect(migration).toContain("display_name_en");
    expect(migration).toContain("title_en");
    expect(migration).toContain("description_en");
    expect(membership).toContain("COALESCE(k.title_en, k.title)");
    expect(frontendApi).toContain('locale=${locale === "en" ? "en" : "de"}');
    expect(admin).toContain('action: "MEMBERSHIP_MANUALLY_GRANTED"');
    expect(admin).toContain('/^\\/v1\\/users\\/([^/]+)\\/membership$/');
    expect(frontendApi).toContain("adminGrantMembership");
  });

  it("sends a localized confirmation only from a newly activated entitlement", () => {
    const migration = read("cloudflare/migrations/0015_membership_activation_email.sql");
    const email = read("cloudflare/src/shared/membership-email.ts");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const maintenance = read("cloudflare/src/workers/maintenance-jobs.ts");
    expect(migration).toContain("preferred_locale");
    expect(migration).toContain("activation_email_status");
    expect(email).toContain("membership is confirmed");
    expect(email).toContain("Membership wurde bestätigt");
    expect(email).toContain('src="cid:shadow-brand-banner"');
    expect(email).toContain("sendTransactionalEmail");
    expect(admin).toContain("'PENDING'");
    expect(admin).toContain("sendMembershipActivationConfirmation");
    expect(maintenance).toContain("retryMembershipActivationEmails");
  });

  it("enforces residence-based privacy controls server-side", () => {
    const migration = read("cloudflare/migrations/0012_privacy_rights.sql");
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const http = read("cloudflare/src/shared/http.ts");
    const frontendApi = read("src/lib/appwrite.js");
    expect(migration).toContain("country_code TEXT");
    expect(migration).toContain("privacy_notice_acknowledged_at TEXT");
    expect(migration).toContain("CREATE TABLE privacy_requests");
    expect(migration).toContain("sale_share_opt_out INTEGER NOT NULL DEFAULT 0");
    expect(membership).toContain('requestUrl.pathname === "/v1/privacy/export"');
    expect(membership).toContain("PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED");
    expect(membership).toContain("body.gpcSignal === true");
    expect(admin).toContain("PRIVACY_REQUEST_UPDATED");
    expect(admin).toContain('url.pathname === "/v1/privacy/requests"');
    expect(http).toContain("GET, POST, PUT, PATCH, DELETE, OPTIONS");
    expect(http).toContain("Content-Disposition, X-Request-Id");
    expect(frontendApi).toContain("privacyNoticeAccepted");
    expect(frontendApi).toContain("fetchPrivacyExport");
  });

  it("finishes a successful self-deletion without reusing the disabled session", () => {
    const frontend = read("src/App.jsx");
    const deletionFlow = frontend.slice(
      frontend.indexOf("const deleteAccountFromPrivacyCenter"),
      frontend.indexOf("const downloadPrivacyData"),
    );
    expect(deletionFlow).toContain("await requestAccountDeletion(reason)");
    expect(deletionFlow).toContain("await logout().catch(() => null)");
    expect(deletionFlow).not.toContain("refresh()");
    expect(deletionFlow).not.toContain("loadPrivacy()");
    expect(frontend).not.toContain("function messageFor");
  });

  it("revokes sessions before blocking accounts and recovers stale blocked browser state", () => {
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const frontendApi = read("src/lib/appwrite.js");
    expect(membership).toContain("await revokeAppwriteSessions(");
    expect(admin.match(/await revokeAppwriteSessions\(/g)).toHaveLength(2);
    expect(frontendApi).toContain("clearAppwriteFallbackSession");
    expect(frontendApi).toContain('error?.type !== "user_blocked"');
    expect(frontendApi).toContain("await discardBlockedSession()");
    expect(frontendApi).toContain("return account.createEmailPasswordSession({ email, password })");
    expect(frontendApi).toContain("return account.create({ userId: ID.unique(), email, password, name })");
    const currentUserFlow = frontendApi.slice(
      frontendApi.indexOf("export async function getCurrentUser"),
      frontendApi.indexOf("export async function registerAccount"),
    );
    expect(currentUserFlow.indexOf('error?.type === "user_blocked"'))
      .toBeLessThan(currentUserFlow.indexOf("error?.code === 401"));
  });

  it("keeps the SEPA subscription insert aligned with its database columns", () => {
    const membershipWorker = read("cloudflare/src/workers/membership-api.ts");
    const insert = membershipWorker.match(
      /INSERT INTO subscriptions\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*`\)\.bind\(/,
    );
    if (!insert?.[1] || !insert[2]) throw new Error("SEPA subscription insert not found");
    const columns = insert[1].split(",").map((column) => column.trim()).filter(Boolean);
    const values = insert[2].split(",").map((value) => value.trim()).filter(Boolean);
    expect(columns).toHaveLength(22);
    expect(values).toHaveLength(columns.length);
    expect(values.every((value) => value === "?")).toBe(true);
  });

  it("does not reset modal focus when controlled form fields rerender", () => {
    const frontend = read("src/App.jsx");
    const modalComponent = frontend.slice(
      frontend.indexOf("function Modal"),
      frontend.indexOf("function QrImage"),
    );
    expect(modalComponent).toContain("const onCloseRef = useRef(onClose)");
    expect(modalComponent).toContain("closeRef.current?.focus({ preventScroll: true })");
    expect(modalComponent).toContain("event.key === \"Escape\" && onCloseRef.current()");
    expect(modalComponent).not.toMatch(
      /closeRef\.current\?\.focus[\s\S]*?document\.body\.classList\.remove[\s\S]*?\}, \[onClose\]\);/,
    );
  });

  it("keeps login and logout feedback distinct", () => {
    const translations = read("assets/js/translations.js");
    const frontend = read("src/App.jsx");
    expect(translations).toContain("loginSuccess: 'You are now logged in.'");
    expect(translations).toContain("logoutSuccess: 'You are now logged out.'");
    expect(frontend).toContain("const handleLogout = async () =>");
    expect(frontend).toContain("setNotice(t.logoutSuccess)");
    expect(frontend).toContain("onClick={handleLogout}");
    expect(frontend).not.toContain("run(logout, t.logoutSuccess");
  });

  it("enforces username changes server-side and re-verifies changed email addresses", () => {
    const migration = read("cloudflare/migrations/0016_profile_change_controls.sql");
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const identity = read("cloudflare/src/workers/identity-projection.ts");
    const maintenance = read("cloudflare/src/workers/maintenance-jobs.ts");
    const frontendApi = read("src/lib/appwrite.js");
    const frontend = read("src/App.jsx");
    expect(migration).toContain("username_change_count");
    expect(migration).toContain("username_next_change_at");
    expect(migration).toContain("username_sync_status");
    expect(membership).toContain("14 * 86_400_000");
    expect(membership).toContain("USERNAME_CHANGE_COOLDOWN");
    expect(membership).toContain('/v1/account/profile/name');
    expect(identity).toContain('/update-user-name');
    expect(maintenance).toContain("retryUsernameSync");
    expect(frontendApi).toContain("account.updateEmail({ email, password })");
    expect(frontend).toContain("await resendVerification(language)");
    expect(frontend).toContain("geschützte Zugang pausiert");
  });

  it("shows truthful mobile verification security and deletion controls", () => {
    const frontend = read("src/App.jsx");
    const mobile = read("assets/css/adult-mobile.css");
    expect(frontend).toContain("Privater EU-Speicher");
    expect(frontend).toContain("Nachweis-Löschung ≤ 48h");
    expect(frontend).toContain("Cloudflare-R2-Bucket mit EU-Jurisdiktion");
    expect(frontend).toContain("<LivePhotoCapture");
    expect(frontend).toContain("existing files cannot be selected");
    expect(frontend).not.toContain('type="file" required={required}');
    expect(mobile).toContain("max-height: 100dvh");
    expect(mobile).toContain(".verification-primary");
    expect(mobile).toContain(".camera-frame");
  });

  it("limits administrator sessions to ten minutes and binds them to the current device", () => {
    const migration = read("cloudflare/migrations/0017_security_sessions_age_retention.sql");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const adminConfig = read("cloudflare/wrangler.admin-api.jsonc");
    const frontendApi = read("src/lib/appwrite.js");
    expect(migration).toContain("CREATE TABLE admin_sessions");
    expect(migration).toContain("device_token_sha256 TEXT NOT NULL");
    expect(adminConfig).toMatch(/"ADMIN_SESSION_MINUTES": "10"/);
    expect(admin).toContain('"X-Admin-Session"');
    expect(admin).toContain("ADMIN_SESSION_EXPIRED");
    expect(frontendApi).toContain("sessionStorage.setItem(adminSessionStorageKey");
    expect(frontendApi).not.toContain("localStorage.setItem(adminSessionStorageKey");
  });

  it("enforces three registered devices with self-service and administrator revocation", () => {
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const membershipConfig = read("cloudflare/wrangler.membership-api.jsonc");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const frontend = read("src/DeviceManager.jsx");
    expect(membershipConfig).toMatch(/"DEVICE_LIMIT": "3"/);
    expect(membership).toContain('requestUrl.pathname === "/v1/devices"');
    expect(membership).toContain("DEVICE_LIMIT_EXCEEDED");
    expect(admin).toContain("const userDevicesPath");
    expect(admin).toContain("const userDevicePath");
    expect(admin).toContain("USER_DEVICE_REMOVED");
    expect(admin).toContain("USER_DEVICE_LOCKED");
    expect(frontend).toContain("removeRegistered");
    expect(frontend).toContain("changeDeviceLock");
    expect(frontend).toContain("removeSession");
    expect(frontend).toContain('import React, { useCallback, useEffect, useState } from "react"');
  });

  it("uses a cryptographic six-digit paper challenge and expires unreviewed evidence", () => {
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const maintenance = read("cloudflare/src/workers/maintenance-jobs.ts");
    const membershipConfig = read("cloudflare/wrangler.membership-api.jsonc");
    const migration = read("cloudflare/migrations/0017_security_sessions_age_retention.sql");
    expect(membership).toContain('const AGE_INSTRUCTIONS_VERSION = "manual-age-v6"');
    expect(membership).toContain("100_000 +");
    expect(membership).toContain("crypto.getRandomValues");
    expect(membershipConfig).toMatch(/"AGE_REVIEW_WINDOW_HOURS": "48"/);
    expect(migration).toContain("review_expires_at TEXT");
    expect(maintenance).toContain("review_expires_at IS NOT NULL");
    expect(maintenance).toContain("cleanupRetainedEvidence");
  });

  it("ships transport-security headers and validates uploaded file signatures", () => {
    const headers = read("public/_headers");
    const media = read("cloudflare/src/shared/media.ts");
    expect(headers).toContain("Strict-Transport-Security: max-age=63072000");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(media).toContain("assertMediaSignature");
    expect(media).toContain("sniffMediaType");
    expect(read("cloudflare/src/workers/membership-api.ts"))
      .toContain("EVIDENCE_MEDIA_SIGNATURE_MISMATCH");
  });
});
