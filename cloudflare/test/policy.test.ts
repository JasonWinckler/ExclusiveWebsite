import { describe, expect, it } from "vitest";
import {
  authorizeProtectedContent,
  deletionBlockers,
  paymentStatusGrantsEntitlement,
  shouldApplyPaymentTransition,
} from "../src/shared/policy";
import type { UserProfileRow } from "../src/shared/types";

const activeProfile: UserProfileRow = {
  appwrite_user_id: "user-a",
  email: "user@example.test",
  display_name: "User",
  email_verified: 1,
  account_status: "ACTIVE",
  age_status: "APPROVED",
  jurisdiction_code: "DE",
  last_active_at: "2026-05-01T00:00:00.000Z",
  last_appwrite_access_at: "2026-05-01T00:00:00.000Z",
  administrative_hold: 0,
  legal_retention_until: null,
  deletion_job_hold: 0,
  version: 1,
};

describe("authorization fails closed", () => {
  it("does not grant access from an Appwrite label alone", () => {
    const decision = authorizeProtectedContent({
      profile: { ...activeProfile, age_status: "NOT_STARTED" },
      entitlement: {
        id: "ent-a",
        tier: "EXCLUSIVE_VIP",
        status: "ACTIVE",
        starts_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
      },
      requiredTier: "EXCLUSIVE_VIP",
      contentStatus: "ACTIVE",
      activeDeviceCount: 1,
      deviceLimit: 3,
      currentDeviceActive: true,
      jurisdictionAllowed: true,
      now: "2026-07-01T00:00:00.000Z",
    });
    expect(decision).toEqual({ allowed: false, code: "AGE_NOT_APPROVED" });
  });

  it("rejects expired entitlements", () => {
    const decision = authorizeProtectedContent({
      profile: activeProfile,
      entitlement: {
        id: "ent-a",
        tier: "EXCLUSIVE_BASIC",
        status: "ACTIVE",
        starts_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-06-01T00:00:00.000Z",
      },
      requiredTier: "EXCLUSIVE_BASIC",
      contentStatus: "ACTIVE",
      activeDeviceCount: 1,
      deviceLimit: 3,
      currentDeviceActive: true,
      jurisdictionAllowed: true,
      now: "2026-07-01T00:00:00.000Z",
    });
    expect(decision.code).toBe("ENTITLEMENT_EXPIRED");
  });

  it("requires the current registered device and an allowed jurisdiction", () => {
    const base = {
      profile: activeProfile,
      entitlement: {
        id: "ent-a",
        tier: "EXCLUSIVE_PREMIUM" as const,
        status: "ACTIVE" as const,
        starts_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
      },
      requiredTier: "EXCLUSIVE_PREMIUM" as const,
      contentStatus: "ACTIVE" as const,
      activeDeviceCount: 1,
      deviceLimit: 3,
      now: "2026-07-01T00:00:00.000Z",
    };
    expect(authorizeProtectedContent({
      ...base,
      currentDeviceActive: false,
      jurisdictionAllowed: true,
    }).code).toBe("DEVICE_NOT_REGISTERED");
    expect(authorizeProtectedContent({
      ...base,
      currentDeviceActive: true,
      jurisdictionAllowed: false,
    }).code).toBe("JURISDICTION_NOT_ALLOWED");
  });

  it("enforces the Basic, Premium, and VIP hierarchy while Free needs no paid entitlement", () => {
    const common = {
      profile: activeProfile,
      contentStatus: "ACTIVE" as const,
      activeDeviceCount: 1,
      deviceLimit: 3,
      currentDeviceActive: true,
      jurisdictionAllowed: true,
      now: "2026-07-01T00:00:00.000Z",
    };
    expect(authorizeProtectedContent({
      ...common,
      entitlement: null,
      requiredTier: "FREE",
    }).allowed).toBe(true);
    expect(authorizeProtectedContent({
      ...common,
      entitlement: {
        id: "ent-basic",
        tier: "EXCLUSIVE_BASIC",
        status: "ACTIVE",
        starts_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
      },
      requiredTier: "EXCLUSIVE_PREMIUM",
    }).code).toBe("INSUFFICIENT_TIER");
    expect(authorizeProtectedContent({
      ...common,
      entitlement: {
        id: "ent-vip",
        tier: "EXCLUSIVE_VIP",
        status: "ACTIVE",
        starts_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
      },
      requiredTier: "EXCLUSIVE_BASIC",
    }).allowed).toBe(true);
  });

  it("does not grant entitlement for initiated or processing SEPA states", () => {
    expect(paymentStatusGrantsEntitlement("PENDING")).toBe(false);
    expect(paymentStatusGrantsEntitlement("PROCESSING")).toBe(false);
    expect(paymentStatusGrantsEntitlement("ACTIVE")).toBe(true);
    expect(paymentStatusGrantsEntitlement("CANCELLED")).toBe(false);
    expect(paymentStatusGrantsEntitlement("EXPIRED")).toBe(false);
  });

  it("does not reactivate terminal access from out-of-order events", () => {
    expect(shouldApplyPaymentTransition({
      currentStatus: "CANCELLED",
      currentEventAt: "2026-07-02T00:00:00.000Z",
      incomingStatus: "ACTIVE",
      incomingEventAt: "2026-07-01T00:00:00.000Z",
    })).toBe(false);
    expect(shouldApplyPaymentTransition({
      currentStatus: "REFUNDED",
      currentEventAt: "2026-07-01T00:00:00.000Z",
      incomingStatus: "ACTIVE",
      incomingEventAt: "2026-07-03T00:00:00.000Z",
    })).toBe(false);
  });
});

describe("inactive account deletion policy", () => {
  it("blocks deletion for every protected relationship", () => {
    expect(deletionBlockers({
      latestTrustedActivityAt: "2026-07-20T00:00:00.000Z",
      inactiveBefore: "2026-06-26T00:00:00.000Z",
      subscriptionStatuses: ["PENDING", "DISPUTED"],
      ageStatus: "PENDING",
      administrativeHold: true,
      deletionJobHold: true,
      legalRetentionUntil: "2027-01-01T00:00:00.000Z",
      now: "2026-07-26T00:00:00.000Z",
      deletionCompleted: false,
    })).toEqual(expect.arrayContaining([
      "RECENT_ACTIVITY",
      "PAYMENT_OR_SUBSCRIPTION_RELATIONSHIP",
      "PENDING_AGE_VERIFICATION",
      "ADMINISTRATIVE_HOLD",
      "DELETION_JOB_HOLD",
      "LEGAL_RETENTION",
    ]));
  });

  it("allows an eligible inactive non-subscribed account", () => {
    expect(deletionBlockers({
      latestTrustedActivityAt: "2026-05-01T00:00:00.000Z",
      inactiveBefore: "2026-06-26T00:00:00.000Z",
      subscriptionStatuses: [],
      ageStatus: "NOT_STARTED",
      administrativeHold: false,
      deletionJobHold: false,
      legalRetentionUntil: null,
      now: "2026-07-26T00:00:00.000Z",
      deletionCompleted: false,
    })).toEqual([]);
  });
});
