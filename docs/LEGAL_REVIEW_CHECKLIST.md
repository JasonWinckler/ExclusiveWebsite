# Productive control and responsibility register

The productive architecture uses Appwrite authentication, Cloudflare Workers,
D1 and private R2 storage. The service is live. Jason Winckler is responsible
for selecting, operating, monitoring and updating the process. This register
records implemented safeguards and recurring operational controls.

No real customer data, identity documents, challenge videos, bank details,
secrets, databases or backups may be committed to Git. Protected content must
remain fail closed unless account, email, age status, entitlement and device
checks all succeed.

## Implemented and technically verified

- [x] Production architecture and trust boundaries documented.
- [x] Manual age-verification procedure documented.
- [x] Challenge-video procedure documented.
- [x] Private R2 evidence access and immediate/48-hour deletion implemented.
- [x] Device-bound ten-minute administrator session implemented.
- [x] Audit retention limited to 730 days and 30 days after account deletion.
- [x] Data protection impact assessment technically documented.
- [x] Localized deletion-confirmation email after approval and confirmed
  evidence deletion implemented.
- [x] Deletion record and reference included only in the authenticated privacy
  export, not permanently in the ordinary profile.

## Recurring production controls

The operator performs and records these controls during live operation:

- review authentication, protected-access and account-sharing controls after
  material changes;
- re-evaluate the DSFA, legal bases, ID-copy minimization and redaction
  instructions after changes to processing or law;
- test deletion, retry, backup exclusion and incident procedures regularly;
- update German/EU and US legal texts when law, supported locations, products
  or business details change;
- maintain processor contracts, transfer documentation and subprocessor
  records outside the public repository;
- require MFA for administrator access and review privileged access
  periodically.
