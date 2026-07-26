# Appwrite server Functions: legacy rollback status

Appwrite is now the authentication boundary only. The frontend must use Appwrite Accounts for registration, email verification, login, recovery and sessions; it must not use Functions, TablesDB or Storage for membership authorization or identity-document upload.

The Function source under `appwrite/functions/` is retained temporarily for rollback inspection. It is not the target architecture.

Do not remove deployed `account-provisioning` or `age-verification-finalize` until all of the following are true:

1. Production Cloudflare Workers and D1 migrations are deployed.
2. Registration and login still work through Appwrite Auth.
3. Membership status, hosted verification, verified payment webhooks, entitlement expiry and inactive deletion pass production checks.
4. Negative authorization tests prove that labels, redirects and browser-submitted identifiers cannot grant access.
5. Retention and rollback requirements for existing TablesDB rows and Storage files are resolved.

After those gates pass, disable the old Functions first, monitor, then remove their deployments and obsolete environment variables. Remove obsolete TablesDB and Storage resources only after confirming that no production data needs migration or legally compliant deletion. Never remove Auth users, required Web platforms, verification redirects or recovery configuration.
