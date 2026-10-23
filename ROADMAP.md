# CodeOutbox roadmap

Feature ideas, ranked by **impact** (leverage on upgrades / retention / differentiation).
Effort: S/M/L · 🏰 own-MTA deliverability moat · 🎯 dev/agent wedge · ✅ shipped · 🚧 in progress.

## Shipped
- ✅ Own MTA (Postfix relay, app-side DKIM), hybrid sending identity
- ✅ Multi-tenant lists, double opt-in, suppression, one-click unsubscribe
- ✅ Agent-automated domain auth (`co domains`), per-tenant DKIM
- ✅ Bounce/complaint pipe → auto-suppress
- ✅ IP warmup ramp
- ✅ Per-tenant email branding (name/color/logo) + branded system mail
- ✅ Stripe billing: monthly + annual (10% off), checkout + portal + webhook
- ✅ Event webhooks (subscriber.confirmed/unsubscribed/bounced/complained, HMAC-signed)
- ✅ Branded dashboard + passwordless sign-in
- ✅ Open/click analytics + per-broadcast detail page
- ✅ Scheduled sends (`send_at`) on a durable job queue
- ✅ Automations: welcome email, confirmation reminder, drip sequences, API triggers, win-back, RSS → email
- ✅ GitHub Action: PR comment with recipients/lint/rendered preview link, send on merge (`draft: true` to hold)
- ✅ `npx codeoutbox` scaffolder: stack + Tailwind detection, writes the component (React/Next, Vue/Nuxt, Svelte, Astro, HTML)
- ✅ Merge tags + custom fields (`{{first_name | "there"}}`, form inputs → fields), missing-value lint
- ✅ Subscriber import/export (`co subscribers`), Mailchimp/Kit/Substack CSVs as-is
- ✅ Zero-signup start: `npx codeoutbox` creates a provisional list (claim link; first-subscriber claim email; 25 cap, 14-day expiry)
- ✅ Hosted, tenant-branded signup page `/l/<id>` + opt-in public archive of past issues
- ✅ README badge `?style=join` linking to the signup page; badge resolves by public_id (fixes cross-tenant slug collision)
- ✅ Homepage: animated agent session in the hero + PR-review tab

## Next up (2026-10-23: no users yet, signups are the bottleneck → acquisition first)
1. **Ship the two growth surfaces**: publish `codeoutbox` to npm; move the Action to its own repo + Marketplace listing (`codeoutbox/action@v1`)
2. **Agent plugin / skill**: one-line MCP install + "add a newsletter to this site" skill; list it in plugin/MCP directories
3. **"Switch from X" pages** (Mailchimp, Kit, Buttondown, Substack) backed by the CSV importer
4. **Inbox-placement / seed testing** (`co check`): the own-MTA moat, once there are senders to protect

## ★★★★★ — highest leverage
| Feature | Category | Tier | Effort | Status | Why |
|---|---|---|---|---|---|
| Inbox-placement / seed testing | Deliverability 🏰 | Growth+ | M | | "Will it land?" — only you can answer credibly (needs seed mailboxes) |
| Sequences as code | Automation 🎯 | Growth+ | M | 🚧 | Drip engine shipped (`co sequence`); declare steps in `codeoutbox.json` + sync |

## ★★★★ — strong drivers
| Feature | Category | Tier | Effort | Why |
|---|---|---|---|---|
| Dedicated IP / pools | Deliverability 🏰 | Scale+/Max | M | Big-sender differentiator |
| Reputation dashboard | Deliverability 🏰 | Growth+ | M | Visible trust (Postmaster/SNDS) |
| Transactional email API | Automation 🎯 | Pro+ | M | One vendor for marketing + app mail |
| Segments | Segmentation | Growth+ | M | Core ESP capability — now unblocked by custom fields |
| Team seats + roles | Teams | Growth+ | M | Unlocks larger orgs |
| Sub-accounts / workspaces | Teams | Scale+ | L | Highest ARPU; multi-site reality |
| Migration assist (Mailchimp/Kit) | Support | Growth+ | S | CSV import shipped; add API pulls + a "switch from X" page |

## ★★★ — solid, mid-priority
| Feature | Category | Tier | Effort | Why |
|---|---|---|---|---|
| Managed warmup | Deliverability 🏰 | Scale+ | S | Package the ramp |
| DMARC/TLS report ingestion + alerts | Deliverability 🏰 | Scale+ | M | Deepens deliverability story |
| Priority send queue / throughput | Deliverability | Scale+ | M | Tangible "faster" |
| Multiple sending domains | Deliverability | Growth+ | S | Multi-site / agency |
| A/B testing | Automation | Growth+ | M | Engagement + retention |
| Resend-to-non-openers | Automation | Growth+ | S | Cheap, loved |
| Tags & engagement scoring | Segmentation | Growth+ | M | Feeds segments |
| Preference center | Segmentation | Growth+ | M | Lowers unsubs/complaints 🏰 |
| Conversion / revenue attribution | Analytics | Growth+ | M | Ties email to $ |
| Deliverability analytics (per-domain inbox) | Analytics 🏰 | Scale+ | M | Moat made visible |
| Scoped API keys | Dev | Growth+ | S | Security + teams |
| Advanced MCP tools | Dev 🎯 | Growth+ | M | Agent superpowers gated to paid |
| Sandbox / test mode | Dev 🏰🎯 | Pro+ | S | Test without burning reputation |
| Custom tracking/link domain | Branding | Growth+ | M | Pro polish + deliverability |
| Branded unsubscribe + hosted forms | Branding | Growth+ | M | Full brand surface |
| Template library / code editor | Branding | Pro+ | M | Faster authoring |
| Full white-label | Teams | Max/Ent | M | Agency lever |
| GDPR tools (export/delete, consent proof) | Compliance | Scale+ | M | EU-critical |
| EU data residency | Compliance 🏰 | Ent | L | NL/EU trust |
| Priority support / SLA | Support | Scale+ | — | Larger-account expectation |

## ★★ — niche / enterprise / later
| Feature | Category | Tier | Effort |
|---|---|---|---|
| Send-time optimization | Deliverability | Growth+ | M |
| BIMI (logo in inbox) | Deliverability 🏰 | Max/Ent | M |
| Higher per-broadcast cap | Deliverability | paid | S |
| Sunset policies (auto-suppress inactive) | Segmentation 🏰 | Scale+ | S |
| Scheduled report emails | Analytics | Growth+ | S |
| Higher API rate limits | Dev | all | S |
| SDKs (JS/Py/Go) + Terraform provider | Dev 🎯 | Growth+ | M |
| Audit log API / dashboard IP allowlist | Compliance | Scale+ | S–M |
| Consolidated / per-workspace billing | Teams | Scale+ | M |
| SSO / SAML / SCIM | Teams | Ent | M |
| Localization / multi-language templates | Branding | Growth+ | M |
| Security page / SOC2 path / DPA / invoicing | Compliance | Ent | S–M |
| Deliverability consulting / onboarding | Support | Max/Ent | — |
