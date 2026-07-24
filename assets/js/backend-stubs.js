(function () {
  const flags = Object.freeze({
    PUBLIC_SITE_ENABLED: true,
    REGISTRATION_ENABLED: false,
    MANUAL_AVS_ENABLED: false,
    ASYNC_CHALLENGE_AVS_ENABLED: false,
    LIVE_MANUAL_AVS_ENABLED: false,
    FREE_ADULT_CONTENT_ENABLED: false,
    EXCLUSIVE_CONTENT_ENABLED: false,
    MANUAL_SEPA_ENABLED: false,
    GLOBAL_REGISTRATION_ENABLED: false,
    MAINTENANCE_MODE: false,
    ADULT_AREA_STEP_UP_REQUIRED: true,
  });

  const accountStatuses = Object.freeze([
    'EMAIL_PENDING', 'PENDING_AGE_VERIFICATION', 'CAPTURE_PENDING', 'CAPTURE_IN_PROGRESS',
    'MANUAL_REVIEW_PENDING', 'LIVE_REVIEW_REQUIRED', 'APPROVED_PENDING_PURGE', 'PURGE_IN_PROGRESS',
    'PURGE_ERROR', 'APPROVED_PENDING_CREDENTIAL', 'ACTIVE', 'REJECTED', 'LOCKED',
    'REVERIFICATION_REQUIRED', 'CANCELLED', 'EXPIRED',
  ]);

  const audit = [];
  const deny = (reason) => ({ allowed: false, reason });
  const allow = () => ({ allowed: true, reason: 'ALLOWED' });

  const policy = {
    flags,
    accountStatuses,
    getAuditEvents: () => audit.slice(),
    recordAudit(eventType, details) {
      audit.push(Object.freeze({ eventType, details: details || {}, createdAt: new Date().toISOString() }));
    },
    canRegister() {
      return flags.REGISTRATION_ENABLED && flags.GLOBAL_REGISTRATION_ENABLED && !flags.MAINTENANCE_MODE ? allow() : deny('REGISTRATION_DISABLED');
    },
    canStartManualAvs() {
      return flags.MANUAL_AVS_ENABLED && flags.ASYNC_CHALLENGE_AVS_ENABLED ? allow() : deny('AVS_DISABLED_PENDING_LEGAL_REVIEW');
    },
    canViewFreeContent(account) {
      if (!flags.FREE_ADULT_CONTENT_ENABLED) return deny('FREE_CONTENT_DISABLED');
      return this.hasAdultAccess(account);
    },
    canViewExclusiveContent(account, entitlement) {
      if (!flags.EXCLUSIVE_CONTENT_ENABLED) return deny('EXCLUSIVE_CONTENT_DISABLED');
      const base = this.hasAdultAccess(account);
      if (!base.allowed) return base;
      if (!entitlement || entitlement.status !== 'ACTIVE') return deny('NO_ACTIVE_PAID_ACCESS');
      if (entitlement.expiresAt && Date.parse(entitlement.expiresAt) <= Date.now()) return deny('PAID_ACCESS_EXPIRED');
      return allow();
    },
    hasAdultAccess(account) {
      if (!account) return deny('AUTHENTICATION_REQUIRED');
      if (account.status !== 'ACTIVE') return deny('ACCOUNT_NOT_ACTIVE');
      if (!account.emailVerified) return deny('EMAIL_NOT_VERIFIED');
      if (!account.ageVerificationApproved) return deny('AGE_VERIFICATION_NOT_APPROVED');
      if (account.verificationExpiresAt && Date.parse(account.verificationExpiresAt) <= Date.now()) return deny('AGE_VERIFICATION_EXPIRED');
      if (!account.secondFactorConfigured || !account.stepUpAuthenticated) return deny('STEP_UP_REQUIRED');
      if (!account.jurisdictionAllowed) return deny('JURISDICTION_BLOCKED');
      if (account.locked) return deny('ACCOUNT_LOCKED');
      return allow();
    },
    createPaymentOrder() {
      return flags.MANUAL_SEPA_ENABLED ? { status: 'PAYMENT_PENDING', reference: `JS-${crypto.randomUUID()}` } : deny('MANUAL_SEPA_DISABLED');
    },
  };

  window.ExclusiveBackend = Object.freeze(policy);
}());
