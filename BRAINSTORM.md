# CodeOutbox — Brainstorm

> Email marketing your coding agent sets up in one prompt. Paste a form — no backend.
> Subscribers land in a list group. Write a broadcast in Markdown, commit it, it sends.

_Status: early concept. Last updated 2026-06-03._

---

## One-paragraph pitch

CodeOutbox is email marketing your coding agent sets up in one prompt. Paste a form —
no backend. Subscribers land in a list group. Write a broadcast in Markdown, commit it,
it sends. Your lists and campaigns live in your repo, reviewed in PRs. An MCP server lets
Claude Code (or any agent) create groups, check counts, and send — without leaving the
terminal.

## What it is

A fusion of two existing categories, made **agent-native**:
- **Formspree** — "forms without a backend" (post to a hosted endpoint).
- **Buttondown / Loops** — developer-friendly email marketing.

Neither is agent-first. That's the wedge: the entire product is designed to be **set up
and operated by an LLM in the editor/terminal**, not clicked through a dashboard.

## Decided scope

- **Target end state:** Form capture **+ broadcasts** (Tiers 0–1). The minimum that is
  genuinely "email marketing," not just form capture.
- **Positioning:** layered, one story —
  - **No-backend** = the door (time-to-value in minutes)
  - **Agent-operable (MCP/CLI)** = the magic
  - **Email-as-code / git-native** = the retention (leaving means migrating files out of git)

## What "coding-agent-first" concretely means

- **One pasteable snippet** — `<form action="https://co.app/f/{group}">`, no JS required;
  progressive-enhancement JS optional.
- **Config-as-code** — a `codeoutbox.json` declares groups, double-opt-in, redirects, tags.
  Agent edits the file; a CLI/MCP reconciles it. Git is the source of truth.
- **MCP server + CLI** so any agent can create groups, read counts, send a broadcast.
- **`llms.txt` + ruthlessly structured docs** so the agent never guesses the integration.

---

## The product spectrum (and where we draw the line)

| Tier | What it is | Verdict |
|---|---|---|
| **0. Form capture** | Hosted endpoint → subscriber in a group. Double opt-in, spam protection, GDPR export. | **The wedge. Must nail.** |
| **1. Broadcasts** | Send a one-off email to a group. Compose in Markdown (commit `campaigns/launch.md`, it sends). | **In scope.** |
| **2. Sequences** | Welcome/drip flows as code (YAML). Trigger on subscribe/tag. | Just far enough later (welcome + simple drip). |
| **3. Platform** | Segmentation UI, A/B, analytics, custom DKIM, webhooks. | Selective — DKIM/deliverability yes; visual builders no. |
| **4. Ecosystem** | GitHub Action ("send on merge"), Vercel/Netlify, Zapier. | Later, cheap wins. |

**Deliberately NOT in scope (protect the wedge):** visual email builder, segmentation UI,
A/B testing, landing-page builder, CRM, heavy analytics dashboards. Every one pulls toward
Mailchimp and away from "the email tool a developer and their agent run from a repo."

---

## MVP feature set (Tier 0 + 1)

### Capture
- Hosted form endpoint per group; works as pure HTML, JS optional for inline success/error.
- **Double opt-in ON by default**, honeypot + rate-limit + optional Turnstile.
- Custom redirect / success URL; hidden tag fields (`<input type="hidden" name="_tag" value="from-docs">`).
- CSV/JSON export; unsubscribe + one-click `List-Unsubscribe` header built in.

### Broadcasts
- `campaigns/launch.md` with frontmatter (`subject`, `group`, `preheader`, `send_at`).
- Markdown → clean responsive HTML; plain-text multipart auto-generated (deliverability win).
- `co send campaigns/launch.md` (dry-run preview first), or via MCP / GitHub Action.

### Config-as-code

```json
// codeoutbox.json
{
  "groups": {
    "newsletter": { "doubleOptIn": true, "redirect": "/thanks" },
    "beta":       { "doubleOptIn": true, "tags": ["product"] }
  }
}
```

`co sync` reconciles file → account. Drift detectable, idempotent, PR-reviewable.

### Agent surface (the differentiator)
- **MCP tools:** `create_group`, `list_groups`, `subscriber_count`, `send_broadcast`,
  `preview_broadcast`, `add_tag`. Read tools are safe; `send_broadcast` requires explicit
  confirmation / `--live` so an agent can't blast a list by accident.
- `llms.txt` + a single canonical integration doc the agent reads before touching anything.

---

## The non-negotiable foundation: abuse & deliverability

This quietly decides whether the product survives.

- **Double opt-in by default** — spam firewall AND legal consent proof (GDPR/CAN-SPAM).
- **Per-endpoint rate limits + bot protection** so an open form can't be stuffed.
- **Shared-IP reputation risk:** one bad actor poisons deliverability for everyone.
  Mitigations: aggressive opt-in confirmation, bounce/complaint auto-suppression, gradual
  sending limits on new accounts, path to **dedicated DKIM domain** even in this tier.
- **Suppression lists, hard-bounce handling, `List-Unsubscribe-Post`** from day one —
  retrofitting these is painful.

---

## Making the wedge sexier

### Headline moves (word-of-mouth makers)
1. **No signup to start — claim by email.** Form works the instant it's pasted; the first
   confirmation email says "someone just subscribed — claim your list." Onboard *after*
   value is felt. Kills the biggest friction; opposite of every incumbent.
2. **`npx codeoutbox` scaffolds a *gorgeous* form, not a bare endpoint.** Detects stack
   (React/Vue/Svelte/Astro/plain + Tailwind), drops an accessible, dark-mode-aware component
   with success/error/loading states wired. The **shadcn-for-email-capture** play.
3. **README subscriber badge → growth loop.** `![subscribers](https://co.app/badge/newsletter)`.
   Every embed = free ad + social proof + backlink (the shields.io / Vercel playbook).
4. **Homepage demo *is* an agent building it live.** Type "add a newsletter to my site,"
   watch the agent scaffold the form + create the group. Show, don't tell.

### Quick-hit delighters (DX joy → tweets)
- **`co dev` local catcher** — test forms locally, submissions print to terminal.
- **Hosted `/thanks` page for free** — themeable; also where "Powered by CodeOutbox" rides (Calendly-style viral footer).
- **Zero captcha, zero spam** — invisible honeypot + edge rate-limiting; clean subscriber UX.
- **Works in a single `curl`** — copy-pasteable in the docs hero; also enables CLI/TUI/agent capture.
- **Live magic-link dashboard, no account** — watch subscribers roll in via a tokenized URL.
- **Sub-50ms edge response** — fast is a feature; state the number.

### Framing flex
Lean into the constraint as the brand: **"A production newsletter in one `<form>` tag."**
The smallness IS the flex — the whole integration fits in a screenshot, and that screenshot
is the ad.

**Top three to bet on:** (1) no-signup claim-by-email, (2) `npx` → beautiful form component,
(3) README badge.

---

## Open questions

1. **Send infra:** resell SES / Postmark, or run own? (Start by reselling — Postmark for
   opt-in confirmations = gold-standard deliverability.)
2. **"No backend" data residency:** it IS our backend — be explicit that "no backend" means
   *theirs*; make export trivial so it's not a lock-in fear.
3. **Self-host edition?** Read-only OSS core (form endpoint + config schema) for trust;
   hosted sending is the paid layer.
4. **Identity:** GitHub OAuth fits the audience and makes the GitHub Action natural later.

## Monetization

Free tier (e.g. 500 subscribers / 1 group), then per-subscriber tiers (Buttondown model);
sending volume is the upsell. Possible OSS self-host edition for trust, hosted for convenience.
