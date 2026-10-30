// Intentionally bounded to the existing exclusive production stack. Credentials
// stay in the Actions environment; raw Wrangler output is never published.
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(root, "cloudflare");
const wrangler = resolve(backend, "node_modules/wrangler/bin/wrangler.js");
const database = "exclusive-membership";
const pagesProject = "shadows-temptation";
const siteOrigin = "https://exclusive.jason-shadow.com";
const workers = ["identity-projection", "auth-api", "membership-api", "admin-api", "maintenance-jobs"];
const allowedMigrations = new Set([
  "0027_order_of_shadows_music_membership.sql", "0028_membership_benefits_vip_area.sql",
  "0029_remove_telegram_music_perks.sql",
]);
const operation = process.env.PRODUCTION_OPERATION || "inspect";
const expectedCommit = process.env.EXPECTED_COMMIT || "";
const restoreOwner = process.env.RESTORE_OWNER_ADMIN === "true";
let newslettersPaused = false;

export function numericCloudflareErrorCodes(errors) {
  if (!Array.isArray(errors)) return [];
  return [...new Set(errors.flatMap((error) => [
    ...(Number.isSafeInteger(error?.code) && error.code >= 0 ? [error.code] : []),
    ...numericCloudflareErrorCodes(error?.error_chain),
  ]))];
}

export function safeWranglerErrorCodes(output) {
  const named = output.match(/OWNER_ADMIN_[A-Z_]+|\[code:\s*\d+\]/g) || [];
  const numeric = [...output.matchAll(/"code"\s*:\s*(\d{1,9})(?=[,\s}])/g)].map((match) => `Cloudflare code ${match[1]}`);
  return [...new Set([...named, ...numeric])];
}

function note(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function run(label, command, args, { cwd = backend, production = true } = {}) {
  const env = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" };
  if (!production) {
    delete env.CLOUDFLARE_API_TOKEN;
    delete env.CLOUDFLARE_ACCOUNT_ID;
  }
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 12 * 1024 * 1024, timeout: 900_000 });
  if (result.status !== 0) {
    // Print only known error identifiers, never credentials, SQL results, API
    // bodies, signed backup URLs, account addresses or arbitrary provider text.
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const codes = safeWranglerErrorCodes(output);
    throw new Error(`${label} failed (exit ${result.status ?? "unavailable"})${codes.length ? `; ${codes.join(", ")}` : ""}. Raw output withheld; check configured permissions and private provider diagnostics.`);
  }
  return result.stdout || "";
}

function wr(label, args, options) {
  return run(label, process.execPath, [wrangler, ...args], options);
}

function json(output, label) {
  try { return JSON.parse(output); } catch { throw new Error(`${label} returned unexpected output; no raw response was logged.`); }
}

function sqlRows(fileOrCommand, isFile = false) {
  // Remote --file uses Wrangler's bulk-import path, whose progress output is
  // not the query JSON contract. Read our fixed, reviewed SELECT file and use
  // --command so bounded status checks return rows without a bulk import.
  const statement = isFile ? readFileSync(resolve(backend, fileOrCommand), "utf8") : fileOrCommand;
  const output = wr("Read bounded D1 metadata", ["d1", "execute", database, "--remote", "--config", "wrangler.membership-api.jsonc",
    // Preserve a leading SQL comment as part of this value, not a CLI option.
    `--command=${statement}`, "--json"]);
  const statements = json(output, "D1");
  requireCondition(Array.isArray(statements) && statements.every((item) => item.success !== false), "D1 metadata read failed.");
  return statements.flatMap((item) => item.results || []);
}

async function readCloudflareMetadata(path, label) {
  let response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error(`${label}: network request failed; no response or credential details logged.`); }
  const payload = await response.json().catch(() => null);
  const codes = numericCloudflareErrorCodes(payload?.errors);
  requireCondition(response.ok && payload?.success === true,
    `${label}: HTTP ${response.status}; numeric Cloudflare error codes ${codes.join(", ") || "unavailable"}. Raw response withheld.`);
  return payload.result;
}

async function readPagesProject() {
  const project = await readCloudflareMetadata(`/pages/projects/${pagesProject}`, "Pages project inspection");
  requireCondition(project?.name === pagesProject && project.production_branch === "main", "Existing Pages project/main-branch configuration does not match the reviewed target.");
  requireCondition(Array.isArray(project.domains) && project.domains.includes("exclusive.jason-shadow.com"), "Existing Pages project does not own exclusive.jason-shadow.com; refusing any replacement or DNS changes.");
  note(`Existing Pages project verified: ${pagesProject}; production branch main; exclusive.jason-shadow.com.`);
  return project;
}

async function readMembershipSettings() {
  return readCloudflareMetadata("/workers/scripts/exclusive-membership-api/settings", "Membership release configuration inspection");
}

async function inspectWhatsAppSecret() {
  const configured = assertWhatsAppSecretConfigured(await readMembershipSettings());
  note(`Membership preflight configuration: ${JSON.stringify({ whatsappNumberSecretConfigured: configured })}. Secret value and phone validity were not inspected; approval flags are checked after deployment.`);
}

function verifyCredentials() {
  requireCondition(Boolean(process.env.CLOUDFLARE_API_TOKEN), "GitHub Actions secret CLOUDFLARE_API_TOKEN is missing.");
  requireCondition(/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID || ""), "GitHub Actions variable CLOUDFLARE_ACCOUNT_ID is missing or invalid.");
  wr("Cloudflare identity validation", ["whoami"]);
  note("Cloudflare credential validation succeeded; credential and account details were not printed.");
}

async function inspect() {
  verifyCredentials();
  const failures = [];
  let pending = [];
  // `wrangler d1 migrations list` initializes its tracking table, so use this
  // fixed SELECT instead. Inspection must not create or change database state.
  try {
    const applied = sqlRows("SELECT name FROM d1_migrations ORDER BY id").map((row) => row.name);
    requireCondition(applied.every((name) => typeof name === "string" && /^\d{4}_[A-Za-z0-9_-]+\.sql$/.test(name)), "Unexpected migration metadata.");
    const files = readdirSync(resolve(backend, "migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
    pending = files.filter((name) => !applied.includes(name));
    note(`Applied migration filenames: ${applied.join(", ") || "none"}.`);
    note(`Pending migration filenames: ${pending.join(", ") || "none"}.`);
  } catch (error) { failures.push(error.message); }
  // Each service is checked independently; a denied Worker endpoint must not
  // hide a different Pages permission/configuration result.
  const results = await Promise.allSettled([...workers.map(async (name) => {
    const result = await readCloudflareMetadata(`/workers/scripts/exclusive-${name}/deployments`, `Worker exclusive-${name} deployment inspection`);
    requireCondition(Array.isArray(result?.deployments), `Unexpected deployment metadata for exclusive-${name}.`);
    const deployments = [...result.deployments].sort((left, right) => String(left.created_on).localeCompare(String(right.created_on)));
    const latest = deployments.at(-1);
    const id = latest?.id;
    const created = latest?.created_on;
    requireCondition(typeof id === "string" && /^[A-Za-z0-9-]{1,80}$/.test(id) && typeof created === "string" && !Number.isNaN(Date.parse(created)), `No valid production deployment metadata for ${name}.`);
    note(`Worker exclusive-${name}: deployment ${id}; created ${new Date(created).toISOString()}.`);
  }), readPagesProject(), inspectWhatsAppSecret()]);
  for (const result of results) if (result.status === "rejected") failures.push(result.reason.message);
  for (const failure of failures) note(`Inspection failed: ${failure}`);
  requireCondition(failures.length === 0, `${failures.length} production metadata checks failed. No writes were performed; inspect the individual HTTP/numeric-code results above.`);
  return pending;
}

function deployWorker(name, pauseNewsletters = false) {
  // Preserve existing dashboard-only operational variables. Reviewed config
  // and the explicit newsletter pause override still take precedence.
  wr(`Deploy exclusive-${name}`, ["deploy", "--config", `wrangler.${name}.jsonc`, "--keep-vars", "--message", `Reviewed membership revision ${expectedCommit}`,
    ...(pauseNewsletters ? ["--var", "NEWSLETTER_DELIVERY_ENABLED:false"] : [])]);
  note(`Deployed exclusive-${name}${pauseNewsletters ? " with newsletter delivery paused" : ""}.`);
}

function ownerStatus() {
  const rows = sqlRows("operations/owner-admin-check.sql", true);
  requireCondition(rows.length === 1, "Owner verification returned an unexpected row count.");
  const status = rows[0];
  const keys = ["matching_verified_active_accounts", "owner_admin_with_mfa_required", "unrevoked_auth_sessions", "unrevoked_admin_sessions", "operation_recorded"];
  requireCondition(keys.every((key) => Number.isSafeInteger(status[key]) && status[key] >= 0), "Owner verification returned invalid scalar metadata.");
  return status;
}

function restoreOwnerRole() {
  const before = ownerStatus();
  requireCondition(before.matching_verified_active_accounts === 1, "Owner repair requires exactly one existing verified active matching account; no user data was printed.");
  if (before.operation_recorded === 1) {
    requireCondition(before.owner_admin_with_mfa_required === 1, "Owner repair was previously recorded but required role/MFA policy is inconsistent; refusing to reapply.");
    note("The one-time owner repair is already recorded and the admin/MFA policy is correct; skipped.");
    return;
  }
  requireCondition(before.operation_recorded === 0, "Unexpected owner operation count.");
  wr("Apply guarded existing-owner role repair", ["d1", "execute", database, "--remote", "--config", "wrangler.auth-api.jsonc", "--file", "operations/owner-admin-business.sql", "--yes"]);
  const after = ownerStatus();
  requireCondition(after.matching_verified_active_accounts === 1 && after.owner_admin_with_mfa_required === 1 && after.operation_recorded === 1 && after.unrevoked_auth_sessions === 0 && after.unrevoked_admin_sessions === 0,
    `Owner repair postconditions failed; ${operation === "owner-admin" ? "no application deployment was attempted" : "the application rollout remains complete"}. No credentials or account records were printed.`);
  note("Existing-owner admin repair verified: exact account match, admin role, MFA required, prior sessions revoked, one audit event. No passwords or MFA secrets changed.");
}

export function assertPublicCatalog(catalog) {
  requireCondition(Array.isArray(catalog?.products), "Public product catalog is missing.");
  for (const [tier, label] of [["EXCLUSIVE_BASIC", "Basic Shadow"], ["EXCLUSIVE_PREMIUM", "Premium Shadow"], ["EXCLUSIVE_VIP", "VIP Shadow"]]) {
    const products = catalog.products.filter((item) => item.tier === tier);
    requireCondition(products.length > 0 && products.every((item) => typeof item.displayName === "string" && item.displayName.startsWith(label)), `Public catalog has not adopted ${label}; stop before resuming newsletters.`);
    requireCondition(Array.isArray(catalog.tierPerks?.[tier]) && catalog.tierPerks[tier].length > 0, `Public ${label} benefits are missing.`);
  }
  for (const tier of ["EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"]) {
    requireCondition(catalog.tierPerks[tier].some((perk) => /15\s*%/.test(`${perk.title} ${perk.description}`)), `Public ${tier} service discount is missing.`);
  }
  requireCondition(Object.values(catalog.tierPerks).every((perks) => Array.isArray(perks) &&
    !perks.some((perk) => /telegram/i.test(`${perk.id} ${perk.title} ${perk.description}`))),
  "Public music catalog still advertises the removed Telegram benefit.");
}

export function assertReviewedMigrations(pending) {
  requireCondition(Array.isArray(pending) && pending.every((name) => allowedMigrations.has(name)),
    "Unreviewed or older pending migrations detected; refusing production changes.");
}

function membershipBinding(settings, name) {
  requireCondition(Array.isArray(settings?.bindings), "Membership Worker settings do not contain binding metadata.");
  const matches = settings.bindings.filter((item) => item?.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

export function assertWhatsAppSecretConfigured(settings) {
  // Settings expose a secret's name and type. Do not inspect any value or
  // request the authenticated perk endpoint to retrieve the private number.
  const configured = membershipBinding(settings, "VIP_WHATSAPP_NUMBER")?.type === "secret_text";
  requireCondition(configured, "Membership Worker WhatsApp number secret binding is missing or has an unexpected type.");
  return configured;
}

export function assertMembershipReleaseSettings(settings) {
  const whatsappReview = membershipBinding(settings, "VIP_WHATSAPP_MUSIC_REVIEWED");
  const telegramReview = membershipBinding(settings, "MUSIC_TELEGRAM_REVIEWED");
  const status = {
    whatsappMusicReviewed: whatsappReview?.type === "plain_text" && whatsappReview.text === "true",
    telegramMusicDisabled: telegramReview?.type === "plain_text" && telegramReview.text === "false",
    whatsappNumberSecretConfigured: assertWhatsAppSecretConfigured(settings),
  };
  requireCondition(status.whatsappMusicReviewed, "Membership Worker WhatsApp music approval flag is not enabled.");
  requireCondition(status.telegramMusicDisabled, "Membership Worker Telegram music approval flag is not explicitly disabled.");
  return status;
}

export function assertBuiltFrontend(builtHtml, liveHtml) {
  const entries = [...builtHtml.matchAll(/(?:src|href)="(\/assets\/index-[A-Za-z0-9_-]+\.(?:js|css))"/g)].map((match) => match[1]);
  requireCondition(entries.some((entry) => entry.endsWith(".js")), "Built frontend has no identifiable hashed main JavaScript entry.");
  requireCondition(entries.every((entry) => liveHtml.includes(`"${entry}"`)), "Canonical frontend still references a different build; newsletters remain paused.");
}

export function assertCanonicalDeployment(project, commit) {
  const deployment = project?.canonical_deployment;
  requireCondition(deployment?.environment === "production" && deployment?.latest_stage?.status === "success" &&
    deployment?.deployment_trigger?.metadata?.commit_hash === commit,
  "Pages has not confirmed the exact reviewed commit as its successful canonical production deployment.");
}

async function drainMaintenance() {
  const deadline = Date.now() + 21 * 60_000;
  let announced = false;
  for (;;) {
    const rows = sqlRows("SELECT count(*) AS active_runs FROM maintenance_locks WHERE job_name = 'daily-maintenance' AND locked_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    requireCondition(rows.length === 1 && [0, 1].includes(rows[0].active_runs), "Unexpected maintenance lock metadata; refusing migration.");
    if (rows[0].active_runs === 0) break;
    requireCondition(Date.now() < deadline, "Maintenance invocation did not drain within 21 minutes; migration was not attempted and newsletters remain paused.");
    if (!announced) note("Waiting for the existing scheduled maintenance invocation to finish before schema changes (maximum 21 minutes). No queue/customer records are read.");
    announced = true;
    await new Promise((resolveDrain) => setTimeout(resolveDrain, 15_000));
  }
  // The existing job holds a 20-minute lease for its entire invocation. That
  // exceeds the platform's 15-minute scheduled-event lifetime, so an expired
  // lease cannot represent a still-running legacy newsletter sender.
  note("Scheduled maintenance lock is drained; no existing active invocation remains.");
}

async function verifyPublicRelease() {
  const health = await fetch(`${siteOrigin}/api/health`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  requireCondition(health.ok, `Canonical API health failed (HTTP ${health.status}).`);
  const healthPayload = await health.json().catch(() => { throw new Error("Public health returned invalid JSON."); });
  requireCondition(healthPayload.status === "ok" && healthPayload.services === true, "Canonical API service bindings are not healthy.");
  const response = await fetch(`${siteOrigin}/api/member/v1/products?locale=en&release=${expectedCommit}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  requireCondition(response.ok, `Public catalog failed (HTTP ${response.status}).`);
  const catalog = await response.json().catch(() => { throw new Error("Public catalog returned invalid JSON."); });
  assertPublicCatalog(catalog);
  const page = await fetch(siteOrigin, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  requireCondition(page.ok, "Canonical frontend verification failed.");
  assertBuiltFrontend(readFileSync(resolve(root, "dist/index.html"), "utf8"), await page.text());
  assertCanonicalDeployment(await readPagesProject(), expectedCommit);
  const membershipStatus = assertMembershipReleaseSettings(await readMembershipSettings());
  note(`Membership release configuration: ${JSON.stringify(membershipStatus)}. Secret value and phone validity were not inspected.`);
  note("Canonical health, service bindings, renamed tiers, service discounts, Telegram absence across all music tiers, exact frontend asset hashes and Pages production commit verified. No email, payment or authenticated member operation was invoked.");
}

async function main() {
  requireCondition(["inspect", "deploy", "owner-admin"].includes(operation), "Operation must be inspect, deploy or owner-admin.");
  requireCondition(/^[a-f0-9]{40}$/.test(expectedCommit), "EXPECTED_COMMIT must be a full reviewed commit SHA.");
  const actual = run("Verify checkout", "git", ["rev-parse", "HEAD"], { cwd: root, production: false }).trim();
  requireCondition(actual === expectedCommit, "Checked-out commit does not match EXPECTED_COMMIT.");
  for (const name of workers) {
    const config = json(readFileSync(resolve(backend, `wrangler.${name}.jsonc`), "utf8"), "Worker source configuration");
    requireCondition(config.name === `exclusive-${name}` && config.workers_dev === false, `Unexpected production target for ${name}.`);
  }
  requireCondition(json(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"), "Pages source configuration").name === pagesProject, "Unexpected Pages deployment target.");
  note(`Operation ${operation}; exact revision ${expectedCommit}.`);
  if (operation !== "inspect") {
    requireCondition(process.env.GITHUB_ACTIONS === "true", "Production mutations are restricted to the reviewed GitHub Actions workflow.");
    run("Rollout verification guard tests", process.execPath, ["--test", "scripts/prod-checks.test.mjs"], { cwd: root, production: false });
    run("Backend typecheck and tests", "pnpm", ["run", "check"], { production: false });
  }
  if (operation === "owner-admin") {
    verifyCredentials();
    restoreOwnerRole();
    note("Independent existing-owner admin operation completed. No migrations, Worker/Pages deployments, newsletter changes, mail or transactions were performed.");
    return;
  }
  if (operation === "deploy") {
    run("Frontend production build", "npm", ["run", "build"], { cwd: root, production: false });
    run("Frontend browser regression tests", "npm", ["test"], { cwd: root, production: false });
    requireCondition(existsSync(resolve(root, "dist/index.html")), "Built frontend is missing.");
    note("Backend checks, frontend build and browser regression tests passed without production credentials in their environment.");
  }
  const pending = await inspect();
  if (operation === "inspect") {
    note("Read-only inspection completed. No migrations, role changes, deployments, mail or transactions were performed.");
    return;
  }
  assertReviewedMigrations(pending);
  deployWorker("maintenance-jobs", true);
  newslettersPaused = true;
  await drainMaintenance();
  const bookmark = json(wr("Record D1 recovery bookmark", ["d1", "time-travel", "info", database, "--config", "wrangler.membership-api.jsonc", "--json"]), "Time Travel").bookmark;
  requireCondition(typeof bookmark === "string" && /^[A-Za-z0-9:-]{1,160}$/.test(bookmark), "No valid D1 recovery bookmark returned.");
  note(`Pre-migration D1 Time Travel bookmark after maintenance drain: ${bookmark}. This is a recovery identifier, not a database export.`);
  if (pending.length) wr("Apply reviewed membership migrations", ["d1", "migrations", "apply", database, "--remote", "--config", "wrangler.membership-api.jsonc"]);
  note(`Reviewed migrations applied: ${pending.join(", ") || "already current"}.`);
  for (const name of workers.filter((name) => name !== "maintenance-jobs")) deployWorker(name);
  wr("Deploy existing Pages project", ["pages", "deploy", "dist", "--project-name", pagesProject, "--branch", "main", "--commit-hash", expectedCommit, "--commit-message", `Reviewed membership revision ${expectedCommit}`], { cwd: root });
  note(`Deployed existing Pages project ${pagesProject}; DNS and domain ownership unchanged.`);
  for (let attempt = 1; ; attempt += 1) {
    try { await verifyPublicRelease(); break; }
    catch (error) {
      if (attempt >= 6) throw error;
      note(`Public release verification pending; retry ${attempt}/5 in five seconds. Newsletter delivery remains paused.`);
      await new Promise((resolveRetry) => setTimeout(resolveRetry, 5_000));
    }
  }
  deployWorker("maintenance-jobs");
  newslettersPaused = false;
  note("Production rollout completed; ordinary opted-in newsletter delivery resumed. No test message was sent.");
  // An unverified/mismatched owner account must not strand the whole site on
  // mixed frontend/backend versions. Repair is separately bounded and follows
  // the fully verified application rollout; its guard is never bypassed.
  if (restoreOwner) {
    try { restoreOwnerRole(); }
    catch (error) {
      note("Application rollout is complete. Existing-owner admin repair remains unresolved; its verification guard was retained.");
      throw error;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  // Error messages above are deliberately fixed/sanitized; never dump a child
  // process, environment, fetch response or database result here.
  const message = error instanceof Error ? error.message : "Unknown rollout failure.";
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Rollout stopped: ${message}\n\n`);
  if (newslettersPaused) note("Newsletter delivery remains paused after failure. Retention jobs continue. After correcting and verifying the release, resume with: cd cloudflare && pnpm run deploy:maintenance. Do not restore D1 automatically after production writes.");
  process.exitCode = 1;
});
