# CodeOutbox — Deliverability Strategy

> Getting mail to the inbox, not the spam folder, in a multi-tenant "no-backend" platform.
> _Status: strategy locked on the identity model. Last updated 2026-06-04._

For a multi-tenant platform where many developers send through shared infrastructure,
deliverability is the whole game: if mail lands in spam, nothing else about the product
matters. The central danger is **collective reputation** — one bad tenant can poison inbox
placement for everyone unless identities are isolated and abuse is policed.

---

## Locked decision — sending-identity model

**Hybrid + agent-automated DNS.**

- **Confirmations, claim emails, and tiny free-tier volume** send immediately from a **shared
  CodeOutbox subdomain** with a low cap → preserves the 5-minute, no-signup wedge.
- **Broadcasts at real volume / above free tier** require the tenant to **authenticate their
  own domain** (SPF + DKIM + DMARC, aligned) → isolated reputation, proper DMARC alignment.
- **The agent does the DNS setup.** The CLI/MCP generates the exact records and, via
  DNS-provider APIs (Cloudflare, Route53, Vercel DNS), applies and verifies them. The
  normally-painful DKIM step becomes an agent task. **"Your agent sets up DKIM for you"** is
  a real selling point and dissolves the friction objection.

Why not the alternatives: shared-domain-for-all is fragile (no DMARC alignment to customer)
and has catastrophic shared-reputation blast radius; require-own-domain-upfront kills the
wedge with DNS friction on the very first experience.

---

## The levers that decide inbox vs spam (2026), by impact

1. **Authentication (mandatory).** Post-2024 Gmail/Yahoo bulk rules (Microsoft 2025):
   SPF + DKIM + DMARC (≥ `p=none`, aligned), valid **PTR/reverse DNS**, **TLS**, and
   **one-click `List-Unsubscribe-Post` (RFC 8058)**. Miss any for bulk → auto-junk.
2. **Complaint rate.** Gmail hard threshold **0.3%**; keep tenants **under 0.1%**. The single
   best predictor of being blocked. Double opt-in is the strongest lever.
3. **Sender reputation (domain + IP).** Built from engagement + complaints over time;
   collective unless identities are isolated.
4. **Recipient engagement.** Opens, replies, "not spam," low delete-without-open. Heavily
   weighted — sending only to confirmed, engaged people compounds positively.
5. **List hygiene.** No purchased lists; hard-bounce + complaint auto-suppression; sunset
   policies for dead addresses.
6. **Content hygiene.** Plain-text multipart, balanced text/image ratio, reputable link
   domains (no sketchy shorteners), real unsubscribe. A tiebreaker, not the main event.

---

## Strategy components

### Reputation as an active gate (protect the commons)
- **Graduated volume caps** for new/unverified senders (warm up each identity's relationship
  with mailbox providers).
- **Tiered sending pools + quarantine pool:** new/risky senders share a pool separate from
  established good-reputation senders; promote senders into the "good" pool as complaint rate
  stays low and engagement stays high.
- **Auto-throttle / auto-suspend** any tenant breaching ~0.1% complaints. This is a policy
  commitment, not just code — be willing to enforce it.

### Stream separation (don't let marketing break signups)
Send **transactional mail (opt-in confirmations, claim, magic links) on a separate
high-reputation subdomain/stream** from **marketing broadcasts.** If a bad broadcast tanks the
marketing stream, confirmation emails must still deliver — otherwise new signups silently
break and the whole funnel dies.

### Infrastructure: build on a reputable ESP (don't run your own MTA yet)
Resell **Postmark / SES / SparkPost** initially — inherit warmed IPs, feedback loops, and
blocklist standing. Multi-tenant abuse policing is still ours. Revisit owning IPs at scale.

### Monitoring & feedback (find out before Gmail does)
- **Google Postmaster Tools** + **Microsoft SNDS** per sending identity.
- **Feedback loops (FBLs)** with providers → real-time complaints → instant suppression.
- **Blocklist monitoring** (Spamhaus etc.) with alerts.
- **Inbox-placement seed testing** (GlockApps-style) before big sends.
- Per-tenant **deliverability score** in dashboard; readable by the agent via MCP so it can
  warn proactively ("complaint rate climbing").

### Footgun-proof content defaults
Bake good defaults in so a careless dev can't self-sabotage: auto plain-text multipart,
enforced one-click unsubscribe + headers, preheader prompt, image/text balance warnings, and
a **pre-send spam linter** in `co send --dry-run` (flags missing unsubscribe, image-heavy
content, low-reputation link domains).

---

## Priority order

1. Auth done right + one-click unsubscribe + double opt-in (non-negotiable baseline).
2. Hybrid identity model (shared subdomain for confirmations; agent-automated domain auth for
   broadcasts).
3. Stream separation + tiered/quarantine pools + complaint auto-suspend.
4. Build on Postmark/SES; add Postmaster Tools + FBL monitoring.
5. Deliverability-as-code via the agent — the differentiator that makes #2 painless.

---

## New requirements this implies for the PRD

These extend the Tier 0+1 PRD:

- **Domain authentication flow**: `co domains add <subdomain>` generates SPF/DKIM/DMARC;
  optional DNS-provider API auto-apply; `co domains verify` polls until aligned. MCP tools:
  `add_domain`, `verify_domain`, `domain_status`.
- **Sending identity gating**: broadcasts blocked above free-tier volume until the group's
  domain is verified; confirmations/claim/magic-link always allowed on shared subdomain.
- **Stream/subdomain separation**: distinct transactional vs broadcast sending identities.
- **Sending pools**: new-account quarantine pool; promotion criteria; per-identity caps.
- **Abuse policy engine**: monitor complaint rate per tenant; auto-throttle/suspend at
  threshold.
- **Monitoring integration**: Postmaster Tools / SNDS / FBL ingestion; per-tenant
  deliverability score exposed via API + MCP.
- **Pre-send spam linter**: extend `--dry-run` to flag deliverability risks.
- **Provider webhooks**: bounce/complaint → suppression (already in PRD; confirm FBL path).
