# Age-verification design

The implemented flow is an intake and manual-review queue, not an automated proof-of-age system:

1. A user registers through Appwrite Accounts.
2. Appwrite sends an email confirmation link.
3. Only a signed-in user whose email is confirmed can submit legal name, date of birth, country code, and an 18+ declaration.
4. The browser rejects a date of birth under 18 and creates a private, read-only-to-the-user document in `age_verifications` with status `MANUAL_REVIEW_PENDING`.
5. An administrator or trusted backend performs the real review and changes status. Client code can neither update nor approve the record.

This client-side age calculation is a usability check, not a security boundary. Production access must be authorized server-side and fail closed unless email, age review, jurisdiction, step-up authentication, and entitlement checks all pass.

See [SETUP.md](SETUP.md) for the exact Appwrite schema, permissions, and required console work.
