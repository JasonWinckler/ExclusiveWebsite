# Ongoing production compliance register

The productive architecture uses Appwrite authentication, Cloudflare Workers,
D1 and private R2 storage. The service is live. This register distinguishes
implemented technical controls from outstanding or recurring professional
review; it must not be read as legal approval.

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

## External or recurring review

The repository does not contain evidence that the following reviews have been
completed by qualified external counsel or the competent authority. Because
the service is productive, open items are ongoing compliance actions rather
than descriptions of a future launch:

- [ ] Manual age-verification and closed-user-group concept reviewed under the
  current JMStV/KJM criteria.
- [ ] Authentication at each protected access and account-sharing controls
  reviewed.
- [ ] DSFA, legal basis, ID-copy minimization and redaction reviewed by a
  qualified privacy professional.
- [ ] Deletion, backup exclusion and incident process independently tested.
- [ ] German/EU imprint, privacy, terms, withdrawal and tax wording reviewed.
- [ ] US legal route and supported-jurisdiction controls reviewed.
- [ ] Cloudflare, Appwrite and Microsoft processor contracts and transfer
  documentation evidenced in the restricted compliance register.
- [ ] Admin MFA activation and periodic access review evidenced.

No unchecked item may be converted into a public claim of certification,
authority approval or guaranteed compliance.
