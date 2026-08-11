# DNS cutover inventory · 2026-08-11

This is the pre-cutover, read-only inventory for `jason-shadow.com`. It contains
no credentials. Registrar ownership remains at Namecheap; authoritative DNS is
planned to move to Cloudflare only after every required record and all three
Pages projects have been verified.

## Authoritative state before cutover

- Namecheap nameservers: `pdns1.registrar-servers.com`,
  `pdns2.registrar-servers.com`
- Cloudflare-assigned nameservers: `john.ns.cloudflare.com`,
  `mia.ns.cloudflare.com`
- DNSSEC/DS: disabled; no public DS or DNSKEY was present
- Cloudflare zone status: pending nameserver activation

## Namecheap record snapshot

| Type | Name | Value | Priority | TTL | Cutover handling |
|---|---|---|---:|---|---|
| ALIAS | `@` | `appwrite.network.` | — | 5 min | legacy; replace with Music Pages custom-domain record |
| CAA | `@` | `0 issue "certainly.com"` | — | automatic | preserve, DNS only |
| CAA | `@` | `0 issue "pki.goog"` | — | automatic | preserve, DNS only |
| CNAME | `*` | `appwrite.network.` | — | automatic | legacy; do not recreate |
| CNAME | `_acme-challenge` | `e1wmuedscji2zcoyx2.fastly-validations.com.` | — | automatic | legacy Appwrite/Fastly validation; archive only |
| CNAME | `_acme-challenge.exclusive` | `qenp13t8mj8134o3cc.fastly-validations.com.` | — | automatic | legacy Appwrite/Fastly validation; archive only |
| CNAME | `_e066bf8554b38df369a98229c943b50a` | `6398B6C7F7FD79F83D93A8B20A4D7F2E.DD5607981A1013CCBF8640515EB9B303.6949884e35021.comodoca.com.` | — | automatic | preserve until certificate inventory is closed |
| CNAME | `auth-exclusive` | `fra.cloud.appwrite.io.` | — | automatic | legacy; do not recreate after Cloudflare-only validation |
| CNAME | `autodiscover` | `autodiscover.outlook.com.` | — | 60 min | preserve, DNS only |
| CNAME | `autodiscover.exclusive` | `autodiscover.outlook.com.` | — | 60 min | preserve, DNS only |
| CNAME | `exclusive` | `shadows-temptation.pages.dev.` | — | 5 min | preserve as dedicated Exclusive Pages target |
| CNAME | `raayij6viypg.exclusive` | `gv-ebyl72n2zeg5n3.dv.googlehosted.com.` | — | automatic | preserve, DNS only |
| CNAME | `selector1._domainkey.exclusive` | `selector1-exclusive-jasonshadow-com03i._domainkey.jasonshadow.r-v1.dkim.mail.microsoft.` | — | automatic | preserve, DNS only |
| CNAME | `selector2._domainkey.exclusive` | `selector2-exclusive-jasonshadow-com03i._domainkey.jasonshadow.r-v1.dkim.mail.microsoft.` | — | automatic | preserve, DNS only |
| TXT | `@` | `MS=ms79058390` | — | 60 min | preserve, DNS only |
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | — | 60 min | preserve; only one SPF record |
| TXT | `_dmarc` | `v=DMARC1; p=none; pct=100; adkim=r; aspf=r` | — | automatic | preserve, DNS only |
| TXT | `exclusive` | `v=spf1 include:spf.protection.outlook.com -all` | — | 60 min | preserve; only one SPF record |
| MX | `@` | `jasonshadow-com01c.mail.protection.outlook.com.` | 2 | 60 min | preserve, DNS only |
| MX | `exclusive` | `exclusive-jasonshadow-com03i.mail.protection.outlook.com.` | 0 | 60 min | preserve, DNS only |

The exact root Microsoft 365 DKIM selector records were not present in the
authoritative zone at inventory time. They must not be invented; enable or copy
them only from the Microsoft 365 tenant's current DKIM configuration.

## Required Cloudflare Pages routing

| Public route | Dedicated Pages project | Repository | Build output |
|---|---|---|---|
| `https://jason-shadow.com/` | Music site | `JasonWinckler/MusicWebsite` | `dist` |
| `https://exclusive.jason-shadow.com/` | `shadows-temptation` | `JasonWinckler/ExclusiveWebsite` | `dist` |
| `https://order.jason-shadow.com/codex/` | Codex Activity site | `JasonWinckler/DiscordBotFinal` | `dist/activity` |

`www.jason-shadow.com` should be attached to the Music project and redirect to
the apex. `order.jason-shadow.com` may redirect `/` to `/codex/`; it must not
share the Music or Exclusive Pages project.

## Cutover gate

Do not save the Namecheap nameserver change until all items are true:

1. Music and Codex have their own successful Pages preview deployments.
2. Exclusive production plus Auth, Membership and Admin service bindings pass.
3. All Microsoft 365 MX, SPF, autodiscover and available DKIM records are in
   Cloudflare as DNS-only records.
4. DMARC, CAA, Microsoft and Google verification records are present.
5. Apex, `www`, `exclusive` and `order` resolve to their intended Pages project.
6. A second DNS export and a mail-flow test have been recorded.
7. The operator explicitly confirms the final Namecheap nameserver save.

## Rollback

If critical web or mail checks fail after cutover, restore
`pdns1.registrar-servers.com` and `pdns2.registrar-servers.com` at Namecheap and
use this record snapshot to compare propagation. Application rollbacks remain
independent: each Pages project can restore its previous deployment, and each
Worker can roll back to its prior version without changing DNS.
