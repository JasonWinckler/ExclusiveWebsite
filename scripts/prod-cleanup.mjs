// One-time owner-requested D1 inventory/reset. Credentials and customer data are
// never logged. Inspection does not create tables, exports, or recovery copies.
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {buildCleanupPlan,identitySnapshotSql,cleanupRunId,cleanupGuardTable,cleanupTrigger} from './prod-cleanup-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, 'cloudflare');
const database = 'exclusive-membership';
const databaseId = 'fc38b1d0-2e77-42a5-ac5c-72603fcb95ab';
const reviewedBaselineSchema = '6371f4fc9cb55254a79406989e6e0d7bcbedeb6d5c8d47b5f30db35097ff0a63';
const wrangler = resolve(backend, 'node_modules/wrangler/bin/wrangler.js');
export const expectedTables = [
  'admin_audit_events', 'admin_sessions', 'age_verification_cases', 'age_verification_uploads',
  'analytics_daily_events', 'analytics_daily_sessions', 'auth_accounts', 'auth_action_tokens',
  'auth_email_tokens', 'auth_recovery_codes', 'auth_sessions', 'bank_statement_imports',
  'bank_transactions', 'content_comments', 'content_items', 'content_uploads', 'deletion_jobs',
  'entitlements', 'invoices', 'label_sync_attempts', 'maintenance_locks', 'newsletter_action_tokens',
  'newsletter_campaigns', 'newsletter_deliveries', 'newsletter_subscriptions', 'privacy_requests',
  'products', 'registered_devices', 'subscriptions', 'system_job_runs', 'telegram_connections',
  'telegram_daily_metrics', 'telegram_invites', 'telegram_link_tokens', 'tier_perks', 'user_profiles',
];
const keeper = "SELECT a.user_id FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id=a.user_id WHERE a.email='business@jason-shadow.com' COLLATE NOCASE AND p.email='business@jason-shadow.com' COLLATE NOCASE AND a.role='ADMIN' AND a.mfa_required=1 AND p.email_verified=1 AND p.account_status='ACTIVE' AND p.administrative_hold=0 AND p.deletion_job_hold=0";
export function assert(condition, message) { if (!condition) throw new Error(message); }
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function note(value) {
  console.log(value);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${value}\n\n`);
}
function run(label, args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: backend, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, timeout: 120000,
  });
  const raw = `${result.stdout || ''}\n${result.stderr || ''}`;
  const codes = [...new Set([...raw.matchAll(/(?:\[code:\s*|"code"\s*:\s*)(\d{1,9})/g)].map(match => match[1]))];
  const knownReasons = ['too many terms in compound SELECT', 'too many SQL variables', 'SQLITE_ERROR', 'SQLITE_AUTH', 'SQLITE_BUSY', 'Too many subrequests', 'authorization failed', 'D1_ERROR', ...[...raw.matchAll(/\bCLEANUP_[A-Z_]+\b/g)].map(match=>match[0])].filter(reason => raw.includes(reason));
  assert(result.status === 0, `${label} failed; numeric codes ${codes.join(',') || 'none'}; known diagnostics ${knownReasons.join(',') || 'none'}. Raw provider output withheld.`);
  try { return JSON.parse(result.stdout); } catch { throw new Error(`${label} returned unexpected metadata. Raw provider output withheld.`); }
}
function query(sql) {
  const results = run('D1 bounded query', ['d1', 'execute', database, '--remote', '--config', 'wrangler.membership-api.jsonc', `--command=${sql}`, '--json']);
  assert(Array.isArray(results) && results.every(row => row.success !== false), 'D1 bounded query failed.');
  return results.flatMap(row => row.results || []);
}
export function assertSchemaTables(tables) {
  const filtered = tables.filter(name => !['_cf_METADATA', 'd1_migrations', 'sqlite_sequence'].includes(name)).sort();
  assert(JSON.stringify(filtered) === JSON.stringify([...expectedTables].sort()), 'Unexpected application table schema; no deletion is permitted.');
}
export const countSql = `SELECT ${expectedTables.map(name => `(SELECT count(*) FROM ${name}) AS ${name}`).join(', ')}`;
export const inventorySql = `SELECT
  (SELECT count(*) FROM auth_accounts WHERE email='business@jason-shadow.com' COLLATE NOCASE) AS matching_auth_accounts,
  (SELECT count(*) FROM user_profiles WHERE email='business@jason-shadow.com' COLLATE NOCASE) AS matching_profiles,
  (SELECT count(*) FROM (${keeper})) AS verified_admin_keepers,
  (SELECT count(*) FROM content_items) AS retained_posts,
  (SELECT count(*) FROM content_items WHERE content_status='ACTIVE' AND content_scope='VIP_ADULT' AND required_tier='EXCLUSIVE_VIP') AS active_vip_posts,
  (SELECT count(*) FROM content_items WHERE content_status <> 'RETIRED') AS nonretired_posts,
  (SELECT count(*) FROM content_uploads u WHERE NOT EXISTS(SELECT 1 FROM content_items c WHERE c.id=u.content_item_id)) AS orphan_content_uploads,
  (SELECT count(*) FROM age_verification_uploads WHERE deleted_at IS NULL) AS live_evidence_object_references,
  (SELECT count(*) FROM invoices WHERE archive_object_key IS NOT NULL) AS invoice_archive_references,
  (SELECT count(*) FROM telegram_connections WHERE status='ACTIVE') AS active_telegram_connections,
  (SELECT count(*) FROM user_profiles WHERE legal_retention_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS future_account_retention_holds,
  (SELECT count(*) FROM subscriptions WHERE retention_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS future_order_retention_holds,
  (SELECT count(*) FROM maintenance_locks WHERE locked_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS active_maintenance_locks`;
export function assertKeepers(status) {
  assert(status?.matching_auth_accounts === 1 && status?.matching_profiles === 1 && status?.verified_admin_keepers === 1, 'Exactly one verified active ADMIN/MFA keeper must exist.');
  assert(status.active_vip_posts === 1 && status.nonretired_posts === 1 && status.orphan_content_uploads === 0, 'Exactly one existing content post with consistent attachment references must exist.');
}
async function main() {
  const operation = process.env.CLEANUP_OPERATION || 'inspect';
  assert(['inspect','reset'].includes(operation), 'Operation must be inspect or reset.');
  if(operation==='reset') assert(process.env.GITHUB_ACTIONS==='true', 'Reset is limited to the reviewed GitHub Actions workflow.');
  const expectedCommit = process.env.EXPECTED_COMMIT || '';
  assert(/^[a-f0-9]{40}$/.test(expectedCommit), 'An exact commit is required.');
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  assert(git.status === 0 && git.stdout.trim() === expectedCommit, 'Checkout does not match exact reviewed commit.');
  assert(Boolean(process.env.CLOUDFLARE_API_TOKEN), 'CLOUDFLARE_API_TOKEN is not configured.');
  const config = JSON.parse(readFileSync(resolve(backend, 'wrangler.membership-api.jsonc'), 'utf8'));
  assert(config.d1_databases?.length === 1 && config.d1_databases[0].database_id === databaseId && config.d1_databases[0].database_name === database, 'Unexpected production D1 target.');
  note(`D1 ${operation}; exact revision ${expectedCommit}.`);
  const schema = query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type,name");
  assertSchemaTables(schema.filter(row => row.type === 'table').map(row => row.name));
  const schemaDigest = digest(schema);
  note(`Schema fingerprint: ${schemaDigest}; application tables: ${expectedTables.length}.`);
  assert(schemaDigest === reviewedBaselineSchema, 'Production schema differs from the explicitly reviewed pre-release 0029 baseline; stop before any reset.');
  // FK definitions are already included in sqlite_master's schema digest.
  // Use the single integrity check below rather than 36 separate CLI reads.
  const countRows = query(countSql);
  assert(countRows.length === 1, 'Invalid count query row count.');
  const counts = Object.entries(countRows[0]).map(([table_name,row_count]) => ({table_name,row_count}));
  assert(counts.length === expectedTables.length && counts.every(row => Number.isSafeInteger(row.row_count) && row.row_count >= 0), 'Invalid table-count metadata.');
  note(`Application table counts: ${JSON.stringify(Object.fromEntries(counts.map(row => [row.table_name,row.row_count])))}.`);
  const status = query(inventorySql)[0];
  note(`Keeper and dependency status: ${JSON.stringify(status)}.`);
  const contentStates = query('SELECT content_status,content_scope,required_tier,count(*) AS row_count FROM content_items GROUP BY content_status,content_scope,required_tier ORDER BY content_status,content_scope,required_tier');
  note(`Content status counts: ${JSON.stringify(contentStates)}.`);
  const attachmentStates = query('SELECT status,count(*) AS row_count FROM content_uploads GROUP BY status ORDER BY status');
  note(`Content attachment status counts: ${JSON.stringify(attachmentStates)}.`);
  const invoiceStates = query('SELECT status,count(*) AS row_count FROM invoices GROUP BY status ORDER BY status');
  const orderStates = query('SELECT status,count(*) AS row_count FROM subscriptions GROUP BY status ORDER BY status');
  note(`Invoice status counts: ${JSON.stringify(invoiceStates)}. Order status counts: ${JSON.stringify(orderStates)}.`);
  assertKeepers(status);
  const violations = query('PRAGMA foreign_key_check');
  assert(violations.length === 0, 'Existing foreign-key violations found; stop before a reset.');
  const applied = query('SELECT name FROM d1_migrations ORDER BY id').map(row=>row.name);
  const model = new DatabaseSync(':memory:');
  for(const name of applied) {
    assert(/^00(0[1-9]|[12][0-9])_[A-Za-z0-9_-]+\.sql$/.test(name), 'Unexpected applied migration outside reviewed baseline.');
    model.exec(readFileSync(resolve(backend,'migrations',name),'utf8'));
  }
  const columns=Object.fromEntries(expectedTables.map(table=>[table,model.prepare(`PRAGMA table_info(${table})`).all()]));
  model.close();
  const identity = query(identitySnapshotSql(columns))[0]?.snapshot;
  assert(typeof identity === 'string', 'Invalid bounded identity snapshot.');
  // Only digests leave this process. Primary IDs and record timestamps remain
  // in memory for one atomic guard; no customer fields or secret values read.
  const inventoryDigest = digest({schemaDigest,identity});
  note(`Reviewed cleanup inventory digest: ${inventoryDigest}.`);
  const already = query(`SELECT count(*) AS recorded FROM admin_audit_events WHERE id='${cleanupRunId}'`)[0]?.recorded;
  assert(already === 0, 'The one-time production cleanup is already recorded; never repeat it against later registrations.');
  if(operation==='inspect') {
    note('Read-only inventory completed. No customer fields, private media, credentials, database backups, email, payment or external memberships were accessed or changed.');
    return;
  }
  assert(process.env.EXPECTED_INVENTORY === inventoryDigest, 'Inventory differs from the exact reviewed digest; stop without deletion.');
  assert(status.live_evidence_object_references === 0 && status.invoice_archive_references === 0 && status.active_telegram_connections === 0,
    'New live external-object/membership dependencies need review; stop without deletion.');
  assert(status.future_account_retention_holds === 0 && status.future_order_retention_holds === 0, 'New explicit retention holds need review; stop without deletion.');
  assert(status.active_maintenance_locks === 0, 'Maintenance is active; stop without deletion.');
  const schemaSnapshot = JSON.stringify(schema.map(row=>[row.type,row.name,row.tbl_name,row.sql]));
  const plan = buildCleanupPlan({columns,expectedIdentity:identity,expectedSchema:schemaSnapshot});
  assert([...plan.setup,plan.apply,...plan.teardown].every(sql=>Buffer.byteLength(sql,'utf8')<90_000), 'Guard SQL exceeds the conservative D1 statement-size budget.');
  const bookmark=run('Record recovery bookmark',['d1','time-travel','info',database,'--config','wrangler.membership-api.jsonc','--json']).bookmark;
  assert(typeof bookmark==='string' && /^[A-Za-z0-9:-]{1,160}$/.test(bookmark),'No valid recovery bookmark returned.');
  note(`Pre-cleanup D1 Time Travel bookmark: ${bookmark}. No database export or backup file was created.`);
  let appliedSuccessfully=false;
  try {
    query(plan.setup[0]);
    query(plan.setup[1]);
    try {
      query(plan.apply);appliedSuccessfully=true;
    } catch(error) {
      // Never retry a mutation after an unknown network result. The bounded
      // audit marker answers whether the atomic statement committed.
      const marker=query(`SELECT count(*) AS recorded FROM admin_audit_events WHERE id='${cleanupRunId}'`)[0]?.recorded;
      if(marker===1) { appliedSuccessfully=true;note('The atomic cleanup committed despite an ambiguous client result; no mutation retry was attempted.'); }
      else throw error;
    }
  } finally {
    // The exact baseline proved these objects absent before this workflow.
    // Even setup requests may time out after committing: remove both owned
    // objects independently, without repeating the destructive INSERT.
    for(const sql of [`DROP TRIGGER IF EXISTS ${cleanupTrigger}`,`DROP TABLE IF EXISTS ${cleanupGuardTable}`]) {
      try { query(sql); } catch { note('A guard teardown request had an ambiguous result; checking exact object absence.'); }
    }
    const left=query(`SELECT count(*) AS remaining FROM sqlite_master WHERE name IN ('${cleanupTrigger}','${cleanupGuardTable}')`)[0]?.remaining;
    assert(left===0,'Temporary cleanup guard objects remain; operator review required, do not rerun reset.');
  }
  assert(appliedSuccessfully,'Cleanup did not commit.');
  const afterCounts=query(countSql)[0];
  const afterStatus=query(inventorySql)[0];
  assertKeepers(afterStatus);
  assert(afterCounts.user_profiles===1 && afterCounts.auth_accounts===1 && afterCounts.content_items===1 && afterCounts.invoices===0 && afterCounts.subscriptions===0 && afterCounts.privacy_requests===0,'Cleanup postconditions failed; do not automatically restore or retry.');
  assert(query('PRAGMA foreign_key_check').length===0,'Cleanup foreign-key verification failed.');
  assert(digest(query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type,name"))===schemaDigest,'Temporary guard objects were not fully removed.');
  note(`Post-cleanup application counts: ${JSON.stringify(afterCounts)}.`);
  note('One-time cleanup completed atomically. Sole verified ADMIN account, exact credentials/MFA/recovery/session/device/profile rows, sole active VIP post and all its attachment history, owner-role repair audit marker and catalog preserved byte-for-byte inside D1. Old customer/privacy/billing records and retired post metadata removed. Anonymous aggregates/operational summaries retained. R2 objects, external memberships, email and payments untouched.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Bounded production inventory failed.');
  process.exitCode = 1;
});
