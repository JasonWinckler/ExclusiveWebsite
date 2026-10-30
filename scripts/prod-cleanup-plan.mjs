// SQL construction only. Never executes or logs customer rows. Keeper snapshots
// are evaluated and compared inside SQLite, so secrets never leave production.
export const cleanupRunId = 'owner-requested-production-cleanup-2026-10-30';
export const cleanupGuardTable = 'exclusive_owner_cleanup_guard';
export const cleanupTrigger = 'exclusive_owner_cleanup_apply';
export const ownerPredicate = "email='business@jason-shadow.com' COLLATE NOCASE";
export const ownerIdQuery = `SELECT user_id FROM auth_accounts WHERE ${ownerPredicate}`;
export const postPredicate = "content_status='ACTIVE' AND content_scope='VIP_ADULT' AND required_tier='EXCLUSIVE_VIP'";
export const postIdQuery = `SELECT id FROM content_items WHERE ${postPredicate}`;
// FK children always precede their parents. These historical tables are reset
// in full, including the retained administrator's former transactions.
export const clearTables = [
  'newsletter_deliveries', 'newsletter_action_tokens', 'newsletter_subscriptions', 'newsletter_campaigns',
  'telegram_link_tokens', 'telegram_invites', 'telegram_connections', 'content_comments',
  'invoices', 'bank_transactions', 'bank_statement_imports', 'entitlements', 'subscriptions',
  'privacy_requests', 'age_verification_uploads', 'age_verification_cases', 'deletion_jobs',
  'label_sync_attempts', 'auth_email_tokens', 'auth_action_tokens',
];
export const scopedTables = {
  admin_audit_events: "id <> 'owner-admin-business-2026-10-30'",
  auth_sessions: `user_id NOT IN (${ownerIdQuery})`,
  admin_sessions: `administrator_appwrite_user_id NOT IN (${ownerIdQuery})`,
  registered_devices: `appwrite_user_id NOT IN (${ownerIdQuery})`,
  auth_recovery_codes: `user_id NOT IN (${ownerIdQuery})`,
  auth_accounts: `user_id NOT IN (${ownerIdQuery})`,
  user_profiles: `appwrite_user_id NOT IN (${ownerIdQuery})`,
  content_uploads: `content_item_id NOT IN (${postIdQuery})`,
  content_items: `id NOT IN (${postIdQuery})`,
};
export const protectedTables = {
  admin_audit_events: "id = 'owner-admin-business-2026-10-30'",
  user_profiles: `appwrite_user_id IN (${ownerIdQuery})`,
  auth_accounts: `user_id IN (${ownerIdQuery})`,
  auth_recovery_codes: `user_id IN (${ownerIdQuery})`,
  auth_sessions: `user_id IN (${ownerIdQuery})`,
  admin_sessions: `administrator_appwrite_user_id IN (${ownerIdQuery})`,
  registered_devices: `appwrite_user_id IN (${ownerIdQuery})`,
  content_items: postPredicate,
  content_uploads: `content_item_id IN (${postIdQuery})`,
  products: '1=1', tier_perks: '1=1',
};
export function quoteSql(value) { return `'${String(value).replaceAll("'", "''")}'`; }
export function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsafe SQL identifier.');
  return `"${value}"`;
}
export function rowSnapshot(table, columns, predicate, full = false) {
  const metadata = columns[table];
  if (!Array.isArray(metadata) || metadata.length === 0) throw new Error('Missing reviewed table columns.');
  const primary = metadata.filter(column => column.pk).sort((a,b) => a.pk-b.pk).map(column => column.name);
  if (primary.length === 0) throw new Error('Snapshot table lacks a primary key.');
  const fields = full ? metadata.map(column => column.name) : [...new Set([...primary,
    ...metadata.filter(column => ['created_at', 'updated_at', 'version', 'status'].includes(column.name)).map(column => column.name)])];
  return `(SELECT json_group_array(json_array(${fields.map(identifier).join(',')})) FROM (SELECT * FROM ${identifier(table)} WHERE ${predicate} ORDER BY ${primary.map(identifier).join(',')}))`;
}
export function identitySnapshotSql(columns) {
  const predicates = {...Object.fromEntries(clearTables.map(table => [table,'1=1'])),...scopedTables};
  // Also bind the two explicit keepers, without returning their names/content.
  const entries = Object.entries(predicates).map(([table,predicate]) => `${quoteSql(table)},json(${rowSnapshot(table,columns,predicate)})`);
  return `SELECT json_object(${entries.join(',')},'keeper',(${ownerIdQuery}),'post',(${postIdQuery})) AS snapshot`;
}
export function protectedSnapshotExpression(columns) {
  return `json_object(${Object.entries(protectedTables).map(([table,predicate]) => `${quoteSql(table)},json(${rowSnapshot(table,columns,predicate,true)})`).join(',')})`;
}
export function buildCleanupPlan({columns, expectedIdentity, expectedSchema}) {
  if (typeof expectedIdentity !== 'string' || expectedIdentity.length < 2) throw new Error('Expected inventory snapshot required.');
  if (typeof expectedSchema !== 'string' || expectedSchema.length < 2) throw new Error('Expected schema snapshot required.');
  const identity = identitySnapshotSql(columns).replace(/^SELECT /,'').replace(/ AS snapshot$/,'');
  const protectedSnapshot = protectedSnapshotExpression(columns);
  const schemaExpression = `(SELECT json_group_array(json_array(type,name,tbl_name,sql)) FROM (SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' AND name NOT IN (${quoteSql(cleanupGuardTable)},${quoteSql(cleanupTrigger)}) ORDER BY type,name))`;
  const allPredicates = {...Object.fromEntries(clearTables.map(table => [table,'1=1'])),...scopedTables};
  const deletedChecks = Object.entries(allPredicates).map(([table,predicate]) => `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ${identifier(table)} WHERE ${predicate}) THEN 1 ELSE RAISE(ABORT,'CLEANUP_POSTCONDITION_ROWS_REMAIN') END;`).join('\n');
  return {
    setup: [
      `CREATE TABLE ${cleanupGuardTable}(id TEXT PRIMARY KEY, protected_snapshot TEXT NOT NULL)`,
      `CREATE TRIGGER ${cleanupTrigger} AFTER INSERT ON ${cleanupGuardTable} BEGIN
SELECT CASE WHEN NEW.id=${quoteSql(cleanupRunId)} THEN 1 ELSE RAISE(ABORT,'CLEANUP_WRONG_OPERATION') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_audit_events WHERE id=${quoteSql(cleanupRunId)}) THEN 1 ELSE RAISE(ABORT,'CLEANUP_ALREADY_RECORDED') END;
SELECT CASE WHEN ${schemaExpression}=${quoteSql(expectedSchema)} THEN 1 ELSE RAISE(ABORT,'CLEANUP_SCHEMA_CHANGED') END;
SELECT CASE WHEN (${identity})=${quoteSql(expectedIdentity)} THEN 1 ELSE RAISE(ABORT,'CLEANUP_INVENTORY_CHANGED') END;
SELECT CASE WHEN (SELECT count(*) FROM auth_accounts WHERE ${ownerPredicate})=1
 AND (SELECT count(*) FROM user_profiles WHERE ${ownerPredicate})=1
 AND EXISTS(SELECT 1 FROM auth_accounts a JOIN user_profiles p ON p.appwrite_user_id=a.user_id WHERE a.user_id IN (${ownerIdQuery}) AND a.role='ADMIN' AND a.mfa_required=1 AND p.email_verified=1 AND p.account_status='ACTIVE' AND p.administrative_hold=0 AND p.deletion_job_hold=0)
 THEN 1 ELSE RAISE(ABORT,'CLEANUP_KEEPER_CHANGED') END;
SELECT CASE WHEN (SELECT count(*) FROM content_items WHERE ${postPredicate})=1 AND (SELECT count(*) FROM content_items WHERE content_status <> 'RETIRED')=1 THEN 1 ELSE RAISE(ABORT,'CLEANUP_POST_KEEPER_AMBIGUOUS') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM age_verification_uploads WHERE deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM invoices WHERE archive_object_key IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM telegram_connections WHERE status='ACTIVE') THEN 1 ELSE RAISE(ABORT,'CLEANUP_EXTERNAL_DEPENDENCY') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_profiles WHERE legal_retention_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE retention_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN 1 ELSE RAISE(ABORT,'CLEANUP_RETENTION_HOLD') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM maintenance_locks WHERE locked_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN 1 ELSE RAISE(ABORT,'CLEANUP_MAINTENANCE_ACTIVE') END;
INSERT OR REPLACE INTO maintenance_locks(job_name,owner_id,locked_until,updated_at) VALUES('audit-retention-delete',${quoteSql(cleanupRunId)},strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
${clearTables.map(table => `DELETE FROM ${identifier(table)};`).join('\n')}
${Object.entries(scopedTables).map(([table,predicate]) => `DELETE FROM ${identifier(table)} WHERE ${predicate};`).join('\n')}
${deletedChecks}
SELECT CASE WHEN (SELECT count(*) FROM user_profiles)=1 AND (SELECT count(*) FROM auth_accounts)=1 AND (SELECT count(*) FROM content_items)=1 THEN 1 ELSE RAISE(ABORT,'CLEANUP_KEEPER_COUNTS_WRONG') END;
SELECT CASE WHEN ${protectedSnapshot}=NEW.protected_snapshot THEN 1 ELSE RAISE(ABORT,'CLEANUP_PROTECTED_RECORD_CHANGED') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE RAISE(ABORT,'CLEANUP_FOREIGN_KEY_FAILED') END;
INSERT INTO admin_audit_events(id,administrator_appwrite_user_id,action,target_type,target_id,subject_appwrite_user_id,reason,correlation_id,created_at) VALUES(${quoteSql(cleanupRunId)},'operator:owner-authorized-d1','OWNER_DATA_CLEANUP','SYSTEM','exclusive-membership',NULL,'Owner-requested removal of former customer, privacy and billing records; admin account and one post retained.',${quoteSql(cleanupRunId)},strftime('%Y-%m-%dT%H:%M:%fZ','now'));
DELETE FROM maintenance_locks WHERE job_name='audit-retention-delete' AND owner_id=${quoteSql(cleanupRunId)};
DELETE FROM ${cleanupGuardTable} WHERE id=NEW.id;
END`,
    ],
    apply: `INSERT INTO ${cleanupGuardTable}(id,protected_snapshot) SELECT ${quoteSql(cleanupRunId)},${protectedSnapshot}`,
    teardown: [`DROP TRIGGER ${cleanupTrigger}`,`DROP TABLE ${cleanupGuardTable}`],
  };
}
