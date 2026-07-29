import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  membershipRenewalReminderEmail,
  membershipRenewalReminderMessageId,
} from "../src/shared/membership-email";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

describe("membership lifecycle", () => {
  it("ships pause/resume persistence and excludes paused access", () => {
    const migration = read(
      "cloudflare/migrations/0018_membership_pause_device_unlock_reminders.sql",
    );
    const admin = read("cloudflare/src/workers/admin-api.ts");
    const membership = read("cloudflare/src/workers/membership-api.ts");
    const maintenance = read("cloudflare/src/workers/maintenance-jobs.ts");
    expect(migration).toContain("paused_remaining_seconds");
    expect(migration).toContain("renewal_reminder_status");
    expect(admin).toContain("upgradeActivatedImmediately");
    expect(admin).toContain("planEntitlementActivation");
    expect(admin).toContain("REPLACE_ACTIVE_AND_SCHEDULED");
    expect(membership).toContain("paused_at IS NULL");
    expect(maintenance).toContain("resumableEntitlements");
    expect(maintenance).toContain("paused_at = NULL");
  });

  it("builds a localized seven-day CTA reminder with a stable message id", () => {
    const messageId = membershipRenewalReminderMessageId(
      "123e4567-e89b-12d3-a456-426614174000",
      "2026-08-05T08:00:00.000Z",
    );
    expect(messageId).toBe("ren-123e4567e89b12d3a-20260805080000");
    const german = membershipRenewalReminderEmail({
      locale: "de",
      displayName: "Alex",
      productName: "Exclusive Premium – 30 Tage",
      tier: "EXCLUSIVE_PREMIUM",
      expiresAt: "2026-08-05T08:00:00.000Z",
    });
    expect(german.subject).toContain("Noch 7 Tage");
    expect(german.html).toContain("?action=renew#pricing");
    expect(german.html).toContain("keine automatische Verlängerung");
    expect(german.html).toContain("Alex");
  });
});
