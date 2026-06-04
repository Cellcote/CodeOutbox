# CodeOutbox — Pricing & Productization

> Decided: **1,000-subscriber free tier**, **aggressive-cheap entry ($9–12)**, charge by
> subscribers with a send fair-use cap. Win the price-sensitive dev cohort; land-and-expand.
> _Status: pricing strategy v1. Last updated 2026-06-04._

## Positioning

CodeOutbox sits in the **developer/SaaS** email cohort (Buttondown, Loops, Resend), not the
creator/growth cohort (Kit, Beehiiv). That cohort keeps free tiers small (100–1,000) and
gates on volume — so we anchor there. Our edge is agent-native DX + "email-as-code" +
deliverability done for you, not a giant free allowance.

## Competitor reference (2026)

| Product | Free tier | Entry paid | Meter |
|---|---|---|---|
| Buttondown | 100 subs | $9/mo (1k) | subscribers |
| Loops | 1,000 contacts, 4k sends/mo | $49/mo (5k) | contacts |
| Resend | 3,000 emails/mo (100/day) | $20/mo | email volume |
| Kit (ConvertKit) | 10,000 subs, unlimited email | $39/mo | subscribers |
| EmailOctopus | 2,500 subs, 10k emails/mo | ~$8/mo | subscribers |
| Beehiiv | 2,500 subs, unlimited sends | ~$39/mo | subscribers |
| Formspree (capture only) | 50 submissions/mo | $15/mo (200) | submissions |

## The meter: subscribers + send fair-use cap

- **Headline meter = subscribers.** What devs expect for lists; predictable; decouples
  revenue from variable cost.
- **Backed by a monthly send cap.** Real COGS is sends (Postmark ≈ $1.25/1k, SES ≈ $0.10/1k)
  and real risk is shared-IP reputation. The send cap is the safety/abuse rail behind the
  subscriber number.
- **Same lever as deliverability:** the free tier sends from the **shared subdomain** up to a
  cap; sending more / to more recipients requires **authenticating your own domain**
  (already built: `FREE_TIER_SEND_LIMIT` + domain gating). Paywall and reputation model are
  one mechanism.

## Tiers

| Tier | Price | Subscribers | Sends | Sending identity | Branding |
|---|---|---|---|---|---|
| **Free** | $0 | 1,000 | ~3,000/mo | shared subdomain | "Powered by" on |
| **Pro** | **$9/mo** | 3,000 | fair-use* | your verified domain | off |
| **Growth** | $19/mo | 10,000 | fair-use* | + trusted pool | off |
| **Scale** | $49/mo | 25,000 | fair-use* | + dedicated DKIM | off |
| **Beyond** | usage | 50k+ | usage | dedicated | off |

\* "fair-use" = unlimited within reason on a **verified** domain; abuse/complaint thresholds
still enforced (auto-throttle/suspend). Entry deliberately undercuts Loops ($49/5k) and Kit
($39) and beats Buttondown ($29/5k).

## What's free vs paid

**Never gated (the wedge + the moat — gating these kills word-of-mouth):**
- Form capture, double opt-in, unsubscribe/suppression
- Markdown broadcasts (within the send cap)
- **CLI + MCP + `co sync` config-as-code** — the agent-native DX is the differentiator
- **`npx` scaffolder + subscriber badge** — the badge is a growth loop
- **Domain authentication** — a deliverability necessity, available to all; the *volume* it
  unlocks is what's tiered
- **Self-host** (open-core) — trust signal
- **"Powered by CodeOutbox"** footer (hosted `/thanks` + emails) — Calendly-style viral loop

**Paid unlocks:** more subscribers, higher send volume / recipient ceiling, remove branding,
trusted/dedicated sending pool, sequences (later), team seats, analytics, priority support.

## Unit economics

- Free user at 1,000 subs × 3,000 sends/mo: **≈ $0.30 on SES**, ≈ $3.75 on Postmark.
- **Run free-tier sending on SES (cheap COGS); reserve Postmark's premium deliverability for
  paid.** This single choice makes a 1,000-sub free tier affordable at scale.
- The send cap + double-opt-in + domain gating bound both COGS and shared-IP reputation risk.

## Abuse / margin guardrails (mostly built)

- Double opt-in on by default (consent + quality).
- `FREE_TIER_SEND_LIMIT` recipient gate → domain auth required above it (built).
- Quarantine → standard → trusted sending pools; graduated caps (DELIVERABILITY.md).
- Complaint auto-suspend (target < 0.1%).
- Branding footer signals free tier and feeds the growth loop.

## How this maps to the product today

- **Per-broadcast recipient gate:** `FREE_TIER_SEND_LIMIT` (default 100) already requires a
  verified domain above the threshold. For pricing, lower/align it per plan.
- **Monthly send cap:** not yet enforced — needs a `plans`/usage module (count sends per
  account per 30 days; block/upgrade-prompt at cap).
- **Subscriber cap:** not yet enforced — block new confirms above plan cap with an
  upgrade prompt (or soft-cap + notify, like Formspree's 50/75/90% emails).
- **Branding footer:** add "Powered by CodeOutbox" to hosted `/thanks` + email footer on Free.

## Open questions

1. **Annual discount?** ~20% (industry standard; Kit 16%, Loops ~20%).
2. **Self-host commercial license** for companies, or pure OSS? (Open-core: OSS core, paid
   hosted + a future "Pro self-host" license.)
3. **Free-tier ESP** = SES (COGS) vs Postmark (deliverability)? Recommend SES for free,
   Postmark for paid.
4. **Soft vs hard caps:** soft-cap subscribers with 50/75/90% nudges (Formspree model) tends
   to convert better than hard walls.

## Sources

- Buttondown pricing — https://buttondown.com/pricing
- Loops pricing / free plan — https://loops.so/pricing , https://loops.so/docs/account/free-plan
- Resend pricing — https://resend.com/pricing
- Kit (ConvertKit) pricing — https://kit.com/pricing
- EmailOctopus / Beehiiv free tiers — https://emailoctopus.com , https://www.beehiiv.com/pricing
- Formspree plans — https://formspree.io/plans
