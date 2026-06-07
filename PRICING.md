# CodeOutbox — Pricing & Productization

> Decided: **100-subscriber free tier**, **aggressive-cheap entry ($9)**, meter =
> **subscribers + a monthly send allowance (~10×)**. We own sending (MTA), so the allowance
> covers our real capacity/cost and protects shared-IP reputation. Win on managed
> deliverability + the newsletter layer; land-and-expand.
> _Status: pricing strategy v2 (own-MTA, send allowances). Last updated 2026-06-06._

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

## The meter: subscribers + monthly send allowance

- **Headline meter = subscribers.** What buyers expect for lists; predictable; the face of
  every tier.
- **Each tier includes a monthly send allowance (~10× subscribers).** We now own the MTA, so
  sending capacity/reputation *is* our cost driver — the allowance ties revenue to it and
  matches marketing-ESP norms (Mailchimp ~10–15×). Overage → upgrade (or metered top-up).
- **Same lever as deliverability:** free tier sends from the **shared domain / quarantine
  pool** up to its allowance; sending more / to more recipients requires **verifying your own
  domain** (isolates your reputation) — already built via `FREE_TIER_SEND_LIMIT` + domain
  gating. The paywall, the abuse rail, and the reputation model are one mechanism.

## Tiers

| Tier | Price | Subscribers | Sends/mo | Sending identity | Branding |
|---|---|---|---|---|---|
| **Free** | $0 | 100 | ~1,000 | shared domain / quarantine pool | "Powered by" on |
| **Pro** | **$9/mo** | 3,000 | ~30k | your verified domain | off |
| **Growth** | $19/mo | 10,000 | ~100k | + trusted pool | off |
| **Scale** | $49/mo | 25,000 | ~250k | + dedicated reputation | off |
| **Business** | custom | 50k+ | volume | dedicated IP/domain, SLA | off |

Send allowance ≈ 10× subscribers; overage prompts an upgrade. Complaint/abuse thresholds
enforced regardless (auto-throttle/suspend). Entry undercuts Loops ($49/5k) and Kit ($39) and
matches Buttondown/EmailOctopus — while the **managed deliverability** (we run the MTA,
automate domain auth, handle bounces) justifies not racing to the bottom.

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

> **Updated (own-MTA, supersedes the BYO note):** we run our own MTA + IP pools
> (see `ARCHITECTURE.md`), so we pay for sending again — but as **fixed cost + ops**, not
> per-email markup.

- **Marginal cost per email ≈ $0** (own MTA), so margins are healthy at volume. The real
  costs are **fixed** — IPs/VPS (small, ~€5–50/mo for a few IPs) and, dominantly, **ops:
  deliverability, warmup, FBLs, blocklist monitoring** + the **shared-IP reputation risk**.
- This is why pricing must (a) **amortize ops** across enough paying tenants — so the
  **Business/Scale tiers matter** — and (b) push serious senders onto a **verified own
  domain** that isolates their reputation from the shared pool.
- The send allowance is both the **cost rail** (capacity) and the **reputation rail** (abuse).
- Free tier rides the **shared IP** → keep it bounded (allowance + quarantine pool + double
  opt-in + complaint auto-suspend) so one bad free tenant can't burn the commons.

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
3. **Enforcement: built.** Subscriber cap + 30-day send allowance are metered per account
   (`src/usage.ts`, `src/plans.ts`) and enforced on ingest, the subscriber API, and broadcast
   send; `GET /v1/usage` exposes it; free-tier limits are env-overridable. **Still to do:**
   soft-cap email nudges (50/75/90%) and billing / plan changes (Stripe) — `accounts.plan`
   defaults to `free` and is set manually until then.
4. **Soft vs hard caps:** soft-cap subscribers with 50/75/90% nudges (Formspree model) tends
   to convert better than hard walls.

## Sources

- Buttondown pricing — https://buttondown.com/pricing
- Loops pricing / free plan — https://loops.so/pricing , https://loops.so/docs/account/free-plan
- Resend pricing — https://resend.com/pricing
- Kit (ConvertKit) pricing — https://kit.com/pricing
- EmailOctopus / Beehiiv free tiers — https://emailoctopus.com , https://www.beehiiv.com/pricing
- Formspree plans — https://formspree.io/plans
