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

  it("requires consent, both ID sides, a one-time challenge, and live video review", () => {
    const migration = read("cloudflare/migrations/0001_initial.sql");
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const frontend = read("src/App.jsx");
    expect(migration).toContain("'DOCUMENT_FRONT', 'DOCUMENT_BACK', 'VIDEO'");
    expect(migration).toContain("liveness_challenge_json TEXT NOT NULL");
    expect(migration).toContain("consented_at TEXT NOT NULL");
    expect(membership).toContain("AGE_REVIEW_CONSENT_REQUIRED");
    expect(membership).toContain("!kinds.has(\"VIDEO\")");
    expect(admin).toContain("AGE_APPROVAL_CHECKLIST_INCOMPLETE");
    expect(frontend).toContain("navigator.mediaDevices.getUserMedia");
    expect(frontend).toContain("new MediaRecorder");
    expect(frontend).not.toMatch(/name="video"\s+type="file"/);
    expect(frontend).toContain("prepareIdCopy");
  });
});
