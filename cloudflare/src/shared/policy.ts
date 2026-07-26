import type {
  AgeStatus,
  EntitlementRow,
  PaymentStatus,
  UserProfileRow,
} from "./types";

export interface AuthorizationDecision {
  allowed: boolean;
  code: string;
}

const deny = (code: string): AuthorizationDecision => ({ allowed: false, code });
const allow = (): AuthorizationDecision => ({ allowed: true, code: "ALLOWED" });

export function authorizeProtectedContent(input: {
  profile: UserProfileRow | null;
  entitlement: EntitlementRow | null;
  requiredTier: "FREE" | "EXCLUSIVE_BASIC" | "EXCLUSIVE_PREMIUM" | "EXCLUSIVE_VIP";
  contentStatus: "DISABLED" | "REVIEW" | "ACTIVE" | "RETIRED";
  activeDeviceCount: number;
  deviceLimit: number;
  currentDeviceActive: boolean;
  jurisdictionAllowed: boolean;
  now?: string;
}): AuthorizationDecision {
  const now = input.now ?? new Date().toISOString();
  if (!input.profile) return deny("PROFILE_NOT_FOUND");
  if (input.profile.account_status !== "ACTIVE") return deny("ACCOUNT_NOT_ACTIVE");
  if (input.profile.email_verified !== 1) return deny("EMAIL_NOT_VERIFIED");
  if (input.profile.age_status !== "APPROVED") return deny("AGE_NOT_APPROVED");
  if (input.profile.administrative_hold === 1 || input.profile.deletion_job_hold === 1) {
    return deny("ACCOUNT_HELD");
  }
  if (input.contentStatus !== "ACTIVE") return deny("CONTENT_NOT_ACTIVE");
  if (!input.jurisdictionAllowed) return deny("JURISDICTION_NOT_ALLOWED");
  if (!input.currentDeviceActive) return deny("DEVICE_NOT_REGISTERED");
  if (input.activeDeviceCount > input.deviceLimit) return deny("DEVICE_LIMIT_EXCEEDED");
  if (input.requiredTier === "FREE") return allow();
  if (!input.entitlement || input.entitlement.status !== "ACTIVE") return deny("ENTITLEMENT_REQUIRED");
  if (input.entitlement.expires_at <= now) return deny("ENTITLEMENT_EXPIRED");
  const tierRank = {
    EXCLUSIVE_BASIC: 1,
    EXCLUSIVE_PREMIUM: 2,
    EXCLUSIVE_VIP: 3,
  } as const;
  if (tierRank[input.entitlement.tier] < tierRank[input.requiredTier]) {
    return deny("INSUFFICIENT_TIER");
  }
  return allow();
}

const terminalPaymentStates = new Set<PaymentStatus>([
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "DISPUTED",
  "REVERSED",
]);

const accessGrantingPaymentStates = new Set<PaymentStatus>([
  "PAID",
  "ACTIVE",
  "GRACE_PERIOD",
]);

export function paymentStatusGrantsEntitlement(status: PaymentStatus): boolean {
  return accessGrantingPaymentStates.has(status);
}

export function shouldApplyPaymentTransition(input: {
  currentStatus: PaymentStatus | null;
  currentEventAt: string | null;
  incomingStatus: PaymentStatus;
  incomingEventAt: string;
}): boolean {
  if (!Number.isFinite(Date.parse(input.incomingEventAt))) return false;
  if (input.currentEventAt && input.incomingEventAt < input.currentEventAt) return false;
  if (
    input.currentStatus &&
    terminalPaymentStates.has(input.currentStatus) &&
    accessGrantingPaymentStates.has(input.incomingStatus)
  ) {
    return false;
  }
  return true;
}

export interface DeletionSnapshot {
  latestTrustedActivityAt: string | null;
  inactiveBefore: string;
  subscriptionStatuses: PaymentStatus[];
  ageStatus: AgeStatus;
  administrativeHold: boolean;
  deletionJobHold: boolean;
  legalRetentionUntil: string | null;
  now: string;
  deletionCompleted: boolean;
}

export function deletionBlockers(snapshot: DeletionSnapshot): string[] {
  const blockers: string[] = [];
  const protectedPaymentStates = new Set<PaymentStatus>([
    "PENDING",
    "PROCESSING",
    "PAID",
    "ACTIVE",
    "GRACE_PERIOD",
    "DISPUTED",
  ]);
  if (
    snapshot.latestTrustedActivityAt &&
    snapshot.latestTrustedActivityAt > snapshot.inactiveBefore
  ) blockers.push("RECENT_ACTIVITY");
  if (snapshot.subscriptionStatuses.some((status) => protectedPaymentStates.has(status))) {
    blockers.push("PAYMENT_OR_SUBSCRIPTION_RELATIONSHIP");
  }
  if (snapshot.ageStatus === "PENDING" || snapshot.ageStatus === "RETRY_REQUIRED") {
    blockers.push("PENDING_AGE_VERIFICATION");
  }
  if (snapshot.administrativeHold) blockers.push("ADMINISTRATIVE_HOLD");
  if (snapshot.deletionJobHold) blockers.push("DELETION_JOB_HOLD");
  if (snapshot.legalRetentionUntil && snapshot.legalRetentionUntil > snapshot.now) {
    blockers.push("LEGAL_RETENTION");
  }
  if (snapshot.deletionCompleted) blockers.push("ALREADY_DELETED");
  return blockers;
}
