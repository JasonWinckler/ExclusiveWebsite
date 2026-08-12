# Cloudflare-only production architecture

## Result

Frontend, authentication, authorization, database, private media, age review,
orders, administration, maintenance and internal routing run on Cloudflare.
Microsoft Graph remains the transactional-mail transport. The repository has no
Appwrite SDK, endpoint, credential, build or runtime fallback.

## Data continuity

D1 remains authoritative for profiles, privacy state, age cases and decisions,
products, SEPA orders, invoices, entitlements, devices, posts, comments and
audits. Existing internal subject identifiers and historical column names remain
stable so orders, entitlements and audit trails keep their original ownership.
Those names do not represent an external dependency.

## Security properties

- host-bound `Secure`, `HttpOnly`, `SameSite=Strict` session cookie;
- only SHA-256 session-token hashes in D1;
- server-side role, age and membership derivation;
- encrypted TOTP secrets, hashed recovery codes and mandatory admin MFA;
- private service bindings between Pages Functions and Workers;
- private R2 objects streamed only after D1 authorization;
- fail-closed authentication without a secondary identity-provider fallback.

## DNS and hosting cutover

`exclusive.jason-shadow.com` stays on its dedicated Cloudflare Pages project.
The apex music site and `/codex/` Activity use separate Pages projects. Before
the registrar nameserver change, all web, Microsoft 365, DKIM, SPF, DMARC and
validation records must exist in the Cloudflare zone and be compared with the
versioned pre-cutover DNS inventory.

Rollback is performed per Pages project or Worker version. A nameserver rollback
uses the recorded Namecheap nameservers and the complete pre-cutover DNS export;
it is independent of application rollback.
