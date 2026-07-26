# Provider and processing decisions

The production design deliberately uses no third-party age-verification or payment provider. Cloudflare supplies the runtime, D1 and private R2 storage; Appwrite supplies browser authentication and the public site.

## Age verification

`AGE_REVIEW_MODE=manual-r2-v1` is selected. The browser captures ID front, ID back and a live video showing the face and ID while the user follows the head-movement instructions. Evidence is uploaded directly to the private EU-jurisdiction `exclusive-age-evidence` bucket through server-authorized upload URLs. Only an Appwrite user carrying the `admin` label can review and decide a case. Evidence is deleted after the configured seven-day post-decision retention period unless a documented legal hold applies.

This is an internal workflow, not a claim of automatic KJM approval or legal sufficiency for every jurisdiction. Obtain German youth-protection/privacy counsel and complete the production DPIA, instruction review and positive/negative-path security testing before exposing NSFW content publicly.

## SEPA

`SEPA_TRANSFER_MODE=epc-qr-credit-transfer-v1` is selected. The customer receives an EPC QR code or the same transfer details as text and initiates a normal SEPA credit transfer in their own banking app. The fixed purpose format is `Exclusive Content - ID #<order-id>`. There is no bank login, PISP initiation, direct debit mandate or recurring collection.

Settlement is confirmed only through an admin-only N26 CSV import that matches the exact purpose, EUR amount and pending order. Creating or displaying an order never grants entitlement; entitlement begins only after a successful settlement match. Beneficiary data and internal service credentials are encrypted Worker secrets and must never be committed or placed in `VITE_*` variables.

## Protected content

`PROTECTED_CONTENT_MODE=private-r2-v1` is selected. `exclusive-content-media` remains private and separates `free/` from tiered `exclusive/basic/`, `exclusive/premium/` and `exclusive/vip/` keys. The membership API checks authentication, verified age, entitlement, tier, expiry, account restrictions and registered-device state before reading protected media. Bucket names and object keys are never returned as browser-constructible URLs.
