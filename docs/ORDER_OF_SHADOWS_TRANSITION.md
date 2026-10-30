# The Order of Shadows — membership transition

The membership service remains at **https://exclusive.jason-shadow.com/**. It is
part of Jason Shadow’s music and voice business and uses the exact official
music logo, burgundy/ivory/gold palette and links to https://jason-shadow.com/.
There is no domain, DNS or application-subpath migration in this release.

## Customer experience

- The public offer is music and voice support with behind-the-scenes content.
- Basic, Premium and VIP retain the existing product IDs, prices and terms.
  Display the authoritative live catalog; do not invent prices in SEO pages.
- Registration, email confirmation, account/profile data, orders, invoices,
  devices, MFA, privacy rights and active entitlements remain in place.
- Members do not submit ID images or challenge videos for the music offer.
- Membership is a fixed-term purchase paid by a one-time SEPA transfer. No
  automatic renewal or tax-deductible charitable donation is represented.
- Existing VIP meet-and-greet terms, advance arrangements and travel conditions
  remain linked from the marketing and checkout experiences.
- The newsletter is optional, separate from membership and uses double opt-in.

## Database and catalog cutover

Apply migration `0027_order_of_shadows_music_membership.sql` through the existing
controlled production migration procedure. This local source change does not
prove that the production migration or deployment has occurred.

The migration adds an explicit content classification. Existing posts default
to `LEGACY_ADULT` and are disabled, while newly created music posts use `MUSIC`.
The member feed, protected media and comments allow only `MUSIC` content.
Do not mass-reclassify old objects or import old media into the music catalog.
Existing R2 objects are not deleted by this conversion. Legacy content remains
quarantined and may be retired through the authorized admin workflow.

Customer records, orders, invoices, entitlements and product IDs/prices/durations
are retained. Existing paid commitments and statutory remedies still require
appropriate customer handling when the offered content changes. The new public
copy does not retroactively rewrite a historical purchase or invoice snapshot.

## Newsletter purpose and community benefits

An earlier consent for the previous content offer is not automatically treated
as consent for the music newsletter. Migration 0027 cancels queued/draft/sending
legacy campaigns, skips unsent deliveries, consumes old confirmation tokens and
moves previously subscribed records to `PENDING` while preserving historical
consent timestamps. The music newsletter requires `newsletter-music-v2` double opt-in.
No automatic reconfirmation email is sent by the migration.

`MUSIC_COMMUNITY_REVIEWED` remains false until the owner has checked that the
configured Telegram channel, bot text and WhatsApp contact are suitable for the
music offer and no longer expose the previous content. The server holds back
new community/contact disclosure until that review; revocation of expired
access continues. Set the flag only after the destination is actually ready.

## Security and retained historical data

Authentication, server-side role/entitlement checks, device controls, private
R2 delivery, admin MFA and financial retention remain required. Retired age
submission endpoints reject new cases. Historical evidence, decisions and
cleanup jobs retain their existing private-access and immediate/48-hour
removal requirements. Do not disable deletion jobs or restore deleted evidence.

Historical architecture/age-review documents are marked as superseded where
they describe new customer collection. Their applicable retention and security
controls remain in force.

## Release and verification

1. Review the exact migration and record the existing D1 recovery point. Pause
   newsletter processing and let in-flight deliveries settle before cutover.
2. Apply migration 0027 before deploying code that queries `content_scope`.
3. Deploy the updated private Workers, retaining the existing bindings and
   secrets. Keep community review false until the relevant destinations are
   checked. Run Telegram synchronization/revocation to invalidate legacy
   invitations before reopening enrollment; the updated join handler rejects
   pre-cutover invitations while the music community is not reviewed.
4. Publish the Pages frontend and static DE/EN/legal/link pages together.
5. Verify the existing canonical domain, same-origin API, registration/email
   confirmation, login/MFA, profile, consent, order creation, payment status,
   protected music media and the absence of legacy content access.
6. Publish music content deliberately through the admin interface. Test the
   actual newsletter double-opt-in and one authorized mail delivery using
   controlled test accounts; a mocked local test is not a delivery receipt.
7. Enable community disclosure only after the owner completes its review.

Keep deployment evidence separate from local check results. A draft PR or built
archive is reviewable source, not a completed production release. Production
migrations, emails, payments and content publication are separate operational
actions and must not be performed merely to test the frontend.

## Search and brand metadata

The root and the `/de/` and `/en/` landing pages describe the new membership with
language alternates, current-domain canonicals, official social artwork and
structured WebSite/WebPage/Person/BreadcrumbList data. Prices are omitted from
structured data so they cannot drift from D1. Legal routes and `/linktree/`
remain available. The sitemap keeps the existing production origin.

The original rectangular music logo is used for icon metadata because the
reference repository does not supply a separate square music favicon. Old
adult-brand icon and banner files are no longer referenced by the new public
experience. No rankings, member totals, testimonials or scarcity claims are
invented.
