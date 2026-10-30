import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expectedTables,assertSchemaTables,assertKeepers} from './prod-cleanup.mjs';
import {buildCleanupPlan,identitySnapshotSql,protectedSnapshotExpression,cleanupGuardTable,cleanupTrigger,cleanupRunId,clearTables,quoteSql} from './prod-cleanup-plan.mjs';
const now = '2026-10-01T00:00:00.000Z';
function insert(db,table,row) { db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row)); }
function fixture() {
  const db=new DatabaseSync(':memory:');
  for(const file of readdirSync('cloudflare/migrations').filter(file=>/^00(0[1-9]|[12][0-9])_/.test(file)).sort()) db.exec(readFileSync(`cloudflare/migrations/${file}`,'utf8'));
  for (const [id,email] of [['owner','business@jason-shadow.com'],['old-a','former-a@example.invalid'],['old-b','former-b@example.invalid']]) {
    insert(db,'user_profiles',{appwrite_user_id:id,email,display_name:id,email_verified:1,account_status:'ACTIVE',created_at:now,updated_at:now});
    insert(db,'auth_accounts',{user_id:id,email,role:id==='owner'?'ADMIN':'USER',mfa_required:id==='owner'?1:0,mfa_enabled:id==='owner'?1:0,password_hash:`synthetic-hash-${id}`,password_salt:'synthetic-salt',totp_secret_ciphertext:id==='owner'?'synthetic-encrypted-totp':null,created_at:now,updated_at:now});
    insert(db,'auth_sessions',{id:`session-${id}`,user_id:id,token_sha256:(id==='owner'?'a':id==='old-a'?'b':'c').repeat(64),created_at:now,last_seen_at:now,expires_at:'2030-01-01T00:00:00.000Z'});
    insert(db,'auth_recovery_codes',{id:`recovery-${id}`,user_id:id,code_sha256:(id==='owner'?'d':id==='old-a'?'e':'f').repeat(64),created_at:now});
  }
  insert(db,'registered_devices',{id:'owner-device',appwrite_user_id:'owner',device_token_hash:'x'.repeat(64),registration_idempotency_key:'device',first_seen_at:now,last_seen_at:now,created_at:now,updated_at:now});
  for(const id of ['post-keeper','post-retired-a','post-retired-b']) {
    insert(db,'content_items',{id,slug:id,title:'Synthetic protected post',content_status:id==='post-keeper'?'ACTIVE':'RETIRED',required_tier:'EXCLUSIVE_VIP',creation_idempotency_key:id,created_at:now,updated_at:now,content_scope:id==='post-keeper'?'VIP_ADULT':'LEGACY_ADULT'});
    insert(db,'content_uploads',{id:`upload-${id}`,content_item_id:id,r2_object_key:`synthetic/${id}`,content_type:'image/jpeg',size_bytes:10,object_etag:'synthetic',uploaded_by_appwrite_user_id:'owner',idempotency_key:id,status:'ACTIVE',created_at:now,updated_at:now});
  }
  insert(db,'content_uploads',{id:'keeper-history',content_item_id:'post-keeper',r2_object_key:'synthetic/keeper-history',content_type:'image/jpeg',size_bytes:10,object_etag:'synthetic',uploaded_by_appwrite_user_id:'owner',idempotency_key:'keeper-history',status:'REPLACED',created_at:now,updated_at:now});
  insert(db,'content_comments',{id:'comment',content_item_id:'post-keeper',appwrite_user_id:'old-a',body:'Synthetic comment',idempotency_key:'comment',created_at:now,updated_at:now});
  for(const id of ['owner','old-a']) {
    insert(db,'subscriptions',{id:`order-${id}`,appwrite_user_id:id,product_id:'exclusive_basic_30d',payment_method:'SEPA_CREDIT_TRANSFER',transfer_reference:`ref-${id}`,amount_minor:499,currency:'EUR',status:'ACTIVE',payment_due_at:now,idempotency_key:`order-${id}`,created_at:now,updated_at:now});
    insert(db,'invoices',{id:`invoice-${id}`,subscription_id:`order-${id}`,invoice_number:`synthetic-${id}`,status:'PAID',billing_name:'Synthetic',billing_street:'Synthetic',billing_postal_code:'00000',billing_city:'Synthetic',billing_country_code:'DE',seller_name:'Synthetic',seller_address:'Synthetic',seller_email:'synthetic@example.invalid',amount_minor:499,currency:'EUR',issued_at:now,due_at:now,created_at:now,updated_at:now});
    insert(db,'entitlements',{id:`entitlement-${id}`,appwrite_user_id:id,product_id:'exclusive_basic_30d',subscription_id:`order-${id}`,tier:'EXCLUSIVE_BASIC',status:'ACTIVE',starts_at:now,expires_at:'2030-01-01T00:00:00.000Z',created_at:now,updated_at:now});
    insert(db,'privacy_requests',{id:`privacy-${id}`,appwrite_user_id:id,request_type:'ERASURE',request_note:'Synthetic',idempotency_key:`privacy-${id}`,privacy_regime:'GDPR',statutory_deadline_at:now,created_at:now,updated_at:now});
  }
  insert(db,'admin_audit_events',{id:'old-audit',administrator_appwrite_user_id:'owner',action:'TEST',target_type:'USER',target_id:'old-a',reason:'Synthetic',correlation_id:'test',created_at:now});
  insert(db,'admin_audit_events',{id:'owner-admin-business-2026-10-30',administrator_appwrite_user_id:'operator:owner-authorized-d1',action:'OWNER_ADMIN_ASSIGNED',target_type:'USER',target_id:'owner',subject_appwrite_user_id:'owner',reason:'Synthetic owner assignment',correlation_id:'owner-admin-business-2026-10-30',created_at:now});
  const columns=Object.fromEntries(expectedTables.map(table=>[table,db.prepare(`PRAGMA table_info(${table})`).all()]));
  return {db,columns};
}
function schemaSnapshot(db) { return db.prepare("SELECT json_group_array(json_array(type,name,tbl_name,sql)) AS value FROM (SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type,name)").get().value; }
function makePlan(db,columns) { return buildCleanupPlan({columns,expectedIdentity:db.prepare(identitySnapshotSql(columns)).get().snapshot,expectedSchema:schemaSnapshot(db)}); }
function setup(db,plan) { for(const sql of plan.setup)db.exec(sql); }
function execute(db,plan) { setup(db,plan);db.exec(plan.apply);for(const sql of plan.teardown)db.exec(sql); }
function rows(db,table) { return db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(); }

test('atomic reset preserves exact admin credential/MFA/profile/session/device/recovery and post history/catalog',()=>{
  const {db,columns}=fixture();const before=db.prepare(`SELECT ${protectedSnapshotExpression(columns)} AS value`).get().value;
  execute(db,makePlan(db,columns));
  assert.equal(db.prepare(`SELECT ${protectedSnapshotExpression(columns)} AS value`).get().value,before);
  assert.equal(rows(db,'user_profiles').length,1);assert.equal(rows(db,'auth_accounts').length,1);assert.equal(rows(db,'content_items').length,1);
  assert.equal(rows(db,'content_uploads').length,2);assert.equal(rows(db,'auth_sessions').length,1);assert.equal(rows(db,'auth_recovery_codes').length,1);
  for(const table of clearTables.filter(t=>t!=='admin_audit_events'))assert.equal(rows(db,table).length,0,table);
  assert.deepEqual(rows(db,'admin_audit_events').map(r=>r.id).sort(),['owner-admin-business-2026-10-30',cleanupRunId].sort());assert.equal(rows(db,'maintenance_locks').length,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sqlite_master WHERE name IN (?,?)').get(cleanupGuardTable,cleanupTrigger).n,0);
});
test('new account after review aborts before every customer deletion',()=>{
  const{db,columns}=fixture();const plan=makePlan(db,columns);
  insert(db,'user_profiles',{appwrite_user_id:'new',email:'new@example.invalid',created_at:now,updated_at:now});
  setup(db,plan);assert.throws(()=>db.exec(plan.apply),/CLEANUP_INVENTORY_CHANGED/);
  assert.equal(rows(db,'invoices').length,2);assert.equal(rows(db,'user_profiles').length,4);assert.equal(rows(db,cleanupGuardTable).length,0);
});
test('replacement with equal row count and changed order state both invalidate reviewed inventory',()=>{
  for(const mode of ['replacement','updated']){
    const{db,columns}=fixture();const plan=makePlan(db,columns);
    if(mode==='replacement')db.exec("UPDATE privacy_requests SET id='replacement' WHERE id='privacy-old-a'");
    else db.exec("UPDATE subscriptions SET status='CANCELLED',updated_at='2026-10-02' WHERE id='order-old-a'");
    setup(db,plan);assert.throws(()=>db.exec(plan.apply),/CLEANUP_INVENTORY_CHANGED/);assert.equal(rows(db,'invoices').length,2);
  }
});
test('unknown table or trigger blocks reset',()=>{
  const{db,columns}=fixture();const plan=makePlan(db,columns);db.exec('CREATE TABLE unexpected(id TEXT PRIMARY KEY)');
  assert.throws(()=>assertSchemaTables(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name)),/Unexpected application table/);
  setup(db,plan);assert.throws(()=>db.exec(plan.apply),/CLEANUP_SCHEMA_CHANGED/);assert.equal(rows(db,'privacy_requests').length,2);
});
test('compromised role or extra non-retired post fail closed',()=>{
  for(const mode of ['role','post']){
    const{db,columns}=fixture();
    if(mode==='role')db.exec("UPDATE auth_accounts SET mfa_required=0 WHERE user_id='owner'");
    else db.exec("UPDATE content_items SET content_status='DISABLED' WHERE id='post-retired-a'");
    const plan=makePlan(db,columns);setup(db,plan);assert.throws(()=>db.exec(plan.apply),mode==='role'?/CLEANUP_KEEPER_CHANGED/:/CLEANUP_POST_KEEPER_AMBIGUOUS/);
    assert.equal(rows(db,'invoices').length,2);
  }
});
test('late keeper mutation rolls back complete multi-table deletion',()=>{
  const{db,columns}=fixture();
  db.exec("CREATE TRIGGER simulated_race AFTER DELETE ON content_comments BEGIN UPDATE auth_accounts SET password_hash='changed' WHERE user_id='owner'; END");
  const plan=makePlan(db,columns);const original=rows(db,'auth_accounts').find(r=>r.user_id==='owner').password_hash;
  setup(db,plan);assert.throws(()=>db.exec(plan.apply),/CLEANUP_PROTECTED_RECORD_CHANGED/);
  assert.equal(rows(db,'invoices').length,2);assert.equal(rows(db,'content_comments').length,1);assert.equal(rows(db,'user_profiles').length,3);
  assert.equal(rows(db,'auth_accounts').find(r=>r.user_id==='owner').password_hash,original);assert.equal(rows(db,'maintenance_locks').length,0);
});
test('live maintenance lock blocks reset without stealing it',()=>{
  const{db,columns}=fixture();insert(db,'maintenance_locks',{job_name:'daily-maintenance',owner_id:'other',locked_until:'2099-01-01T00:00:00.000Z',updated_at:now});
  const plan=makePlan(db,columns);setup(db,plan);assert.throws(()=>db.exec(plan.apply),/CLEANUP_MAINTENANCE_ACTIVE/);
  assert.equal(rows(db,'maintenance_locks')[0].owner_id,'other');assert.equal(rows(db,'user_profiles').length,3);
});
test('snapshot SQL escapes identifiers and metadata safely',()=>{
  assert.equal(quoteSql("x'y"),"'x''y'");
  assert.throws(()=>assertKeepers({matching_auth_accounts:2,matching_profiles:1,verified_admin_keepers:1,retained_posts:1,orphan_content_uploads:0}));
});

test('one-time audit marker blocks a second cleanup of later registrations',()=>{
  const{db,columns}=fixture();execute(db,makePlan(db,columns));
  insert(db,'user_profiles',{appwrite_user_id:'later',email:'later@example.invalid',created_at:now,updated_at:now});
  const second=makePlan(db,columns);setup(db,second);assert.throws(()=>db.exec(second.apply),/CLEANUP_ALREADY_RECORDED/);
  assert.equal(rows(db,'user_profiles').length,2);
});
test('quoted synthetic primary IDs cannot escape snapshot SQL',()=>{
  const{db,columns}=fixture();db.exec("UPDATE privacy_requests SET id='quote'';DELETE FROM user_profiles;--' WHERE id='privacy-old-a'");
  execute(db,makePlan(db,columns));assert.equal(rows(db,'user_profiles')[0].appwrite_user_id,'owner');
});

test('new private archive dependency or explicit retention hold blocks an otherwise unchanged inventory',()=>{
  for(const mode of ['archive','retention']){
    const{db,columns}=fixture();const plan=makePlan(db,columns);
    if(mode==='archive')db.exec("UPDATE invoices SET archive_object_key='synthetic/new-archive' WHERE id='invoice-old-a'");
    else db.exec("UPDATE user_profiles SET legal_retention_until='2099-01-01T00:00:00.000Z' WHERE appwrite_user_id='old-a'");
    setup(db,plan);assert.throws(()=>db.exec(plan.apply),mode==='archive'?/CLEANUP_EXTERNAL_DEPENDENCY/:/CLEANUP_RETENTION_HOLD/);
    assert.equal(rows(db,'invoices').length,2);
  }
});
