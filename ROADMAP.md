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

## ★★★★★ — highest leverage
| Feature | Category | Tier | Effort | Status | Why |
|---|---|---|---|---|---|
| Open/click analytics | Analytics | Pro+ | M | 🚧 | Table stakes; unlocks A/B, segments, conversion |
| Inbox-placement / seed testing | Deliverability 🏰 | Growth+ | M | | "Will it land?" — only you can answer credibly (needs seed mailboxes) |
| Sequences as code | Automation 🎯 | Growth+ | L | | Recurring value, on-brand, churn-resistant (needs a scheduler) |

## ★★★★ — strong drivers
| Feature | Category | Tier | Effort | Why |
|---|---|---|---|---|
| Dedicated IP / pools | Deliverability 🏰 | Scale+/Max | M | Big-sender differentiator |
| Reputation dashboard | Deliverability 🏰 | Growth+ | M | Visible trust (Postmaster/SNDS) |
| Per-broadcast analytics | Analytics | Pro+ | M | Proves value |
| Scheduled / recurring sends | Automation | Pro+ | S–M | Universally expected |
| Personalization / merge tags | Automation | Pro+ | M | Baseline expectation |
| Transactional email API | Automation 🎯 | Pro+ | M | One vendor for marketing + app mail |
| Segments | Segmentation | Growth+ | M | Core ESP capability |
| CI/CD GitHub Action | Dev 🎯 | Pro+ | M | Send on merge / PR-preview — signature wedge |
| Team seats + roles | Teams | Growth+ | M | Unlocks larger orgs |
| Sub-accounts / workspaces | Teams | Scale+ | L | Highest ARPU; multi-site reality |
| Migration assist (Mailchimp/Kit) | Support | Growth+ | M | Converts switchers |

## ★★★ — solid, mid-priority
| Feature | Category | Tier | Effort | Why |
|---|---|---|---|---|
| Managed warmup | Deliverability 🏰 | Scale+ | S | Package the ramp |
| DMARC/TLS report ingestion + alerts | Deliverability 🏰 | Scale+ | M | Deepens deliverability story |
| Priority send queue / throughput | Deliverability | Scale+ | M | Tangible "faster" |
| Multiple sending domains | Deliverability | Growth+ | S | Multi-site / agency |
| A/B testing | Automation | Growth+ | M | Engagement + retention |
| Resend-to-non-openers | Automation | Growth+ | S | Cheap, loved |
| RSS / Git → email | Automation 🎯 | Pro+ | M | On-brand auto-broadcast |
| Custom subscriber fields | Segmentation | Pro+ | S | Enables segments/personalization |
| Tags & engagement scoring | Segmentation | Growth+ | M | Feeds segments |
| Preference center | Segmentation | Growth+ | M | Lowers unsubs/complaints 🏰 |
| Bulk import/export | Segmentation | Pro+ | S | Migration + onboarding |
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
