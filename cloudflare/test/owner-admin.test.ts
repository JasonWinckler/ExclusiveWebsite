import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/database";

const operation = readFileSync(new URL("../operations/owner-admin-business.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../operations/owner-admin-check.sql", import.meta.url), "utf8");
const now = "2026-10-01T00:00:00.000Z";

function seededDatabase() {
  const { sqlite } = testDatabase("0027");
  for (const [id, email, role] of [["owner-id", "business@jason-shadow.com", "USER"], ["other-id", "other@example.test", "ADMIN"]] as const) {
    sqlite.prepare(`INSERT INTO user_profiles (appwrite_user_id, email, display_name,
      email_verified, account_status, created_at, updated_at) VALUES (?, ?, ?, 1, 'ACTIVE', ?, ?)`)
      .run(id, email, `Test ${id}`, now, now);
    sqlite.prepare(`INSERT INTO auth_accounts (user_id, email, password_hash, password_salt,
      role, mfa_required, mfa_enabled, totp_secret_ciphertext, created_at, updated_at)
      VALUES (?, ?, 'test-only-hash', 'test-only-salt', ?, 0, 1, 'test-only-ciphertext', ?, ?)`)
      .run(id, email, role, now, now);
    const hash = id === "owner-id" ? "a" : "b";
    for (const [suffix, state] of [["active", "ACTIVE"], ["pending", "MFA_PENDING"]] as const) {
      sqlite.prepare(`INSERT INTO auth_sessions (id, user_id, token_sha256, state, created_at, last_seen_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, '2099-01-01T00:00:00.000Z')`)
        .run(`${id}-${suffix}`, id, (suffix === "active" ? hash : hash.toUpperCase()).repeat(64), state, now, now);
    }
    sqlite.prepare(`INSERT INTO admin_sessions (id, administrator_appwrite_user_id, session_token_sha256,
      device_token_sha256, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, '2099-01-01T00:00:00.000Z', ?)`)
      .run(`${id}-admin`, id, hash.repeat(64), "c".repeat(64), now, now);
    sqlite.prepare(`INSERT INTO entitlements (id, appwrite_user_id, product_id, tier, status, starts_at, expires_at,
      created_at, updated_at) VALUES (?, ?, 'exclusive_basic_30d', 'EXCLUSIVE_BASIC', 'ACTIVE', ?, '2099-01-01T00:00:00.000Z', ?, ?)`)
      .run(`${id}-membership`, id, now, now, now);
  }
  return sqlite;
}
function snapshot(sqlite: ReturnType<typeof seededDatabase>) {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map((row) => [String(row.name), sqlite.prepare(`SELECT * FROM "${String(row.name)}" ORDER BY rowid`).all()]));
}

describe("one-time owner administrator operation", () => {
  it("promotes only the matching owner, requires MFA, revokes sessions and preserves business data", () => {
    const sqlite = seededDatabase();
    const before = snapshot(sqlite);
    sqlite.exec(operation);
    const after = snapshot(sqlite);
    for (const table of Object.keys(before)) {
      if (!["auth_accounts", "auth_sessions", "admin_sessions", "admin_audit_events"].includes(table)) expect(after[table], table).toEqual(before[table]);
    }
    const ownerBefore = before.auth_accounts!.find((row) => row.user_id === "owner-id")!;
    const owner = sqlite.prepare("SELECT * FROM auth_accounts WHERE user_id='owner-id'").get()!;
    expect(owner.role).toBe("ADMIN");
    expect(owner.mfa_required).toBe(1);
    expect({ ...owner, role: ownerBefore.role, mfa_required: ownerBefore.mfa_required, updated_at: ownerBefore.updated_at }).toEqual(ownerBefore);
    for (const [table, column] of [["auth_accounts", "user_id"], ["auth_sessions", "user_id"], ["admin_sessions", "administrator_appwrite_user_id"]] as const) {
      expect(sqlite.prepare(`SELECT * FROM ${table} WHERE ${column}='other-id'`).all()).toEqual(before[table]!.filter((row) => row[column] === "other-id"));
    }
    expect(sqlite.prepare(verification).get()).toEqual({ matching_verified_active_accounts: 1,
      owner_admin_with_mfa_required: 1, unrevoked_auth_sessions: 0, unrevoked_admin_sessions: 0, operation_recorded: 1 });
    const audit = sqlite.prepare("SELECT * FROM admin_audit_events WHERE id='owner-admin-business-2026-10-30'").get()!;
    expect(audit.subject_appwrite_user_id).toBe("owner-id");
    expect(JSON.parse(String(audit.previous_state_json))).toEqual({ role: "USER", mfaRequired: 0 });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'owner_admin_business_%'").all()).toEqual([]);
    const completed = snapshot(sqlite);
    expect(() => sqlite.exec(operation)).toThrow("OWNER_ADMIN_ALREADY_APPLIED");
    expect(snapshot(sqlite)).toEqual(completed);
    sqlite.close();
  });
  it.each([
    ["missing authentication account", "DELETE FROM auth_accounts WHERE user_id='owner-id'", "OWNER_ADMIN_EXPECTS_ONE_AUTH_ACCOUNT"],
    ["missing matching profile", "UPDATE user_profiles SET email='changed@example.test' WHERE appwrite_user_id='owner-id'", "OWNER_ADMIN_EXPECTS_ONE_PROFILE"],
    ["different account/profile identities", "UPDATE user_profiles SET email='changed@example.test' WHERE appwrite_user_id='owner-id'; UPDATE user_profiles SET email='business@jason-shadow.com' WHERE appwrite_user_id='other-id'", "OWNER_ADMIN_AUTH_PROFILE_MISMATCH"],
    ["ambiguous profile email", "UPDATE user_profiles SET email='business@jason-shadow.com' WHERE appwrite_user_id='other-id'", "OWNER_ADMIN_EXPECTS_ONE_PROFILE"],
    ["unverified account", "UPDATE user_profiles SET email_verified=0 WHERE appwrite_user_id='owner-id'", "OWNER_ADMIN_REQUIRES_VERIFIED_ACTIVE_UNHELD_ACCOUNT"],
    ["restricted account", "UPDATE user_profiles SET account_status='RESTRICTED' WHERE appwrite_user_id='owner-id'", "OWNER_ADMIN_REQUIRES_VERIFIED_ACTIVE_UNHELD_ACCOUNT"],
    ["administrative hold", "UPDATE user_profiles SET administrative_hold=1 WHERE appwrite_user_id='owner-id'", "OWNER_ADMIN_REQUIRES_VERIFIED_ACTIVE_UNHELD_ACCOUNT"],
    ["deletion hold", "UPDATE user_profiles SET deletion_job_hold=1 WHERE appwrite_user_id='owner-id'", "OWNER_ADMIN_REQUIRES_VERIFIED_ACTIVE_UNHELD_ACCOUNT"],
  ])("refuses %s without application-data changes", (_label, prepare, error) => {
    const sqlite = seededDatabase(); sqlite.exec(prepare); const before = snapshot(sqlite);
    expect(() => sqlite.exec(operation)).toThrow(error); expect(snapshot(sqlite)).toEqual(before); sqlite.close();
  });
  it("rolls back role and audit when session revocation fails", () => {
    const sqlite = seededDatabase();
    sqlite.exec(`CREATE TRIGGER test_revocation_failure BEFORE UPDATE ON auth_sessions
      WHEN OLD.user_id='owner-id' BEGIN SELECT RAISE(ABORT, 'TEST_SESSION_FAILURE'); END;`);
    const before = snapshot(sqlite);
    expect(() => sqlite.exec(operation)).toThrow("TEST_SESSION_FAILURE"); expect(snapshot(sqlite)).toEqual(before); sqlite.close();
  });
});
