# Appwrite Server Functions: produktiver Legacy-Status

Appwrite is the production authentication boundary. The frontend uses Appwrite
Accounts for identity and sessions, while branded verification and recovery are
coordinated through Cloudflare and the private Identity Worker. Appwrite
Functions, TablesDB and Storage are not used for membership authorization or
identity-document upload.

The source under `appwrite/functions/` is retained as historical rollback and
migration material. It is not called by the production frontend and must not be
re-enabled as an alternate authorization path.

The Cloudflare replacement has passed the production gates that originally
controlled the migration:

1. Cloudflare Workers and D1 migrations are deployed.
2. Registration and login use Appwrite Auth.
3. Membership, manual age review, verified SEPA settlement, entitlement expiry
   and deletion run through Cloudflare.
4. Negative authorization tests prevent labels, redirects or browser-submitted
   identifiers from granting access.

If obsolete Function deployments, TablesDB databases or Storage buckets still
exist in Appwrite, treat their removal as a separate controlled cleanup:
inventory first, confirm that the production frontend has no dependency,
resolve retention or deletion duties, disable before deletion and record the
result. Never remove Auth users, required Web platforms or the Appwrite
configuration used by the private Identity Worker.
