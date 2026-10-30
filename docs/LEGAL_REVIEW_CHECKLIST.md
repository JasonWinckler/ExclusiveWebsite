# Productive control and responsibility register

The productive architecture uses Cloudflare Pages, Workers, D1 and private R2
storage, including Cloudflare-native authentication. The service is live. Jason Winckler is responsible
for selecting, operating, monitoring and updating the process. This register
records implemented safeguards and recurring operational controls.

No real customer data, identity documents, challenge videos, bank details,
secrets, databases or backups may be committed to Git. Protected content must
remain fail closed unless account, email, entitlement, catalog classification and device
checks all succeed.

## Implemented and technically verified

- [x] Production architecture and trust boundaries documented.
- [x] Historical age-verification procedure retained for existing evidence.
- [x] New music memberships do not require ID/video collection.
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
- re-evaluate the DSFA, legal bases, historical evidence minimization and current membership
  processing after changes to processing or law;
- test deletion, retry, backup exclusion and incident procedures regularly;
- update German/EU and US legal texts when law, supported locations, products
  or business details change;
- maintain processor contracts, transfer documentation and subprocessor
  records outside the public repository;
- require MFA for administrator access and review privileged access
  periodically.

## Music membership transition

Read [ORDER_OF_SHADOWS_TRANSITION.md](ORDER_OF_SHADOWS_TRANSITION.md). Confirm the
new offer, unchanged prices/terms, VIP arrangements, newsletter consent wording
and consumer notices against the deployed product. Existing paid commitments
and withdrawal/refund rights remain applicable. Do not silently transfer old
newsletter consent to a materially different purpose.
