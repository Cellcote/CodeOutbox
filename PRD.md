# CodeOutbox — Product Requirements Document (Tier 0 + 1)

_Build-ready PRD for the MVP: **form capture + Markdown broadcasts**, agent-native._
_Status: v2 draft. Last updated 2026-06-04. Stack is now portable/self-hostable; deliverability strategy folded in (see `DELIVERABILITY.md`)._

---

## 1. Summary

CodeOutbox lets a developer (and their coding agent) add a production email newsletter to
any site with **no backend of their own**: paste a `<form>`, subscribers land in a list
group, write a broadcast in Markdown, commit it, it sends. Lists and campaigns live in the
repo as files. An MCP server + CLI let any coding agent operate the whole thing from the
terminal.

This PRD covers **Tier 0 (capture)** and **Tier 1 (broadcasts)** only. Sequences,
segmentation UI, A/B, and analytics dashboards are explicitly out of scope (see §13).

## 2. Goals & non-goals

### Goals
- **G1.** A working email capture form live in < 5 minutes, no signup required to start.
- **G2.** A broadcast sent from a committed Markdown file via CLI, MCP, or GitHub Action.
- **G3.** Inbox-grade deliverability defaults (double opt-in, suppression, bounce handling).
- **G4.** Full operability by a coding agent through an MCP server with no dashboard.
- **G5.** Git as the source of truth for groups and campaigns (config-as-code).

### Non-goals (this release)
- Visual email builder, drag-and-drop, WYSIWYG.
- Segmentation UI, A/B testing, automation/drip sequences.
- Open/click analytics dashboards (basic counts only).
- A *polished, supported* self-host edition (docs, licensing, support, upgrade tooling). The
  stack is **architected to self-host from day one** (single container + Postgres, swappable
  adapters — see §8, §15), but productizing self-host is later.

### Goals (added in v2)
- **G6.** Portable stack: the same codebase runs as a single self-hosted container
  (`docker compose up` → app + Postgres) and scales out to managed/edge services via config.
- **G7.** Inbox placement, not just "sent": hybrid sending identity with agent-automated
  domain authentication for broadcasts (see `DELIVERABILITY.md`).

## 3. Target user & primary journeys

**Persona:** a developer shipping a landing page, docs site, side project, or waitlist, who
does not want to run a mail backend and increasingly works through a coding agent.

**Journey A — Capture (the wedge):**
1. Agent (or dev) pastes `<form action="https://co.app/f/newsletter">` into the site.
2. A visitor submits; receives a double-opt-in confirmation email.
3. The site owner receives a "claim your list" email (no prior signup).
4. Owner clicks claim → account created → magic-link dashboard shows subscribers.

**Journey B — Broadcast:**
1. Dev/agent writes `campaigns/launch.md` (frontmatter + Markdown body).
2. `co send campaigns/launch.md --dry-run` renders a preview + recipient count.
3. `co send campaigns/launch.md --live` (or MCP `send_broadcast` with confirm) queues it.
4. Broadcast renders once, fans out throttled, records per-recipient status.

**Journey C — Agent-operated:**
- "Claude, create a `beta` group and send them the launch note" → MCP `create_group` +
  `send_broadcast` (confirmation required) execute against the control-plane API.

**Journey D — Domain authentication (deliverability, agent-automated):**
1. Confirmations/claim emails already work from the shared CodeOutbox subdomain (no setup).
2. To send broadcasts above free-tier volume, the tenant authenticates their own domain.
3. `co domains add newsletter.acme.com` (or MCP `add_domain`) generates the exact
   SPF/DKIM/DMARC records; with a DNS-provider token it auto-applies them.
4. `co domains verify` polls until records resolve and alignment passes → broadcasts unlocked.
   The agent does the DNS work that normally takes a human an afternoon.

## 4. Scope overview

| Area | In scope (Tier 0+1) |
|---|---|
| Ingest | Hosted form endpoint, JSON + urlencoded, honeypot, rate-limit, optional Turnstile |
| Consent | Double opt-in (default on), consent timestamp + IP, unsubscribe, suppression list |
| Account | GitHub OAuth, API tokens, claim-by-email, magic-link dashboard (read-only MVP) |
| Config | `codeoutbox.json` + `co sync` reconcile |
| Broadcasts | Markdown + frontmatter → HTML/plain-text, queued throttled send |
| Delivery | Pluggable email transport (SMTP default; Postmark/SES adapters); bounce/complaint → auto-suppression |
| Deliverability | Hybrid sending identity, agent-automated domain auth (SPF/DKIM/DMARC), stream separation, sending pools, complaint auto-suspend |
| Agent | MCP server + CLI over one control-plane API; `llms.txt` + docs |
| Public | Subscriber badge SVG, hosted `/thanks` page |
| Deployment | Single portable container + Postgres (`docker compose up`); adapters for managed/edge |

---

## 5. Functional requirements

### 5.1 Form ingest — `POST /f/{group}`
- **FR-1.1** Accept both `application/x-www-form-urlencoded` and `application/json` bodies.
- **FR-1.2** Required field: `email` (RFC 5322 validated). Optional: `name`, hidden `_tag`,
  `_redirect` override (must match account allowlist), honeypot field `_gotcha`.
- **FR-1.3** Reject if honeypot filled (silently return success — do not signal to bot).
- **FR-1.4** Enforce per-IP and per-group rate limits (see NFR). Return `429` on breach.
- **FR-1.5** If Turnstile enabled for the group, verify token; reject on failure.
- **FR-1.6** Resolve `{group}` slug → account+group. Unknown slug → `404` (generic).
- **FR-1.7** Upsert subscriber as `pending`; record `consent_ip`, `source`, `created_at`.
  If already `confirmed`, do not resend opt-in; return success either way (no enumeration).
- **FR-1.8** Send double-opt-in confirmation email (transactional path) when group has it on.
  If a group somehow has double-opt-in off, mark `confirmed` immediately.
- **FR-1.9** Response: HTML form → `303` redirect to `_redirect`/group redirect/hosted
  `/thanks`. JSON request (header `Accept: application/json`) → `200 {ok:true}`.
- **FR-1.10** First-ever submission to an unclaimed group triggers a single "claim your
  list" email to the group's pending owner address (dedup; once per unclaimed group).
- **FR-1.11** CORS: allow cross-origin POST; do not require preflight for simple form posts.

### 5.2 Double opt-in & lifecycle tokens
- **FR-2.1** `GET /confirm/{token}` flips `pending → confirmed`, sets `consent_timestamp`,
  shows a themeable confirmation page. Idempotent; expired/used token → friendly error.
- **FR-2.2** `GET /unsubscribe/{token}` sets `unsubscribed`, writes suppression, shows page.
- **FR-2.3** `POST /unsubscribe/{token}` supports one-click `List-Unsubscribe-Post`.
- **FR-2.4** Tokens are signed (HS256 JWT), single-purpose, expiring (confirm/claim: 7d;
  unsubscribe: no expiry; magic-link: 24h). Include `sub`, `purpose`, `exp`.

### 5.3 Claim-by-email & accounts
- **FR-3.1** "Claim" email contains a magic link; clicking creates/links an account and
  binds the group to it. Prompt GitHub OAuth to make the account durable.
- **FR-3.2** GitHub OAuth login; issue session + long-lived API tokens (scoped, revocable).
- **FR-3.3** Magic-link dashboard (read-only MVP): group list, subscriber counts, recent
  subscribers, CSV/JSON export. No editing required in MVP.

### 5.4 Config-as-code — `codeoutbox.json` + `co sync`
- **FR-4.1** Schema: `{ groups: { <slug>: { doubleOptIn?: bool, redirect?: str, tags?: str[] } } }`.
- **FR-4.2** `co sync` reconciles file → account: create missing groups, update settings.
  Idempotent. Never deletes groups implicitly (require `--prune` for removals).
- **FR-4.3** Output a diff before applying; `--dry-run` shows changes without writing.
- **FR-4.4** Validate against a published JSON Schema; surface clear errors with file:line.

### 5.5 Broadcasts — Tier 1
- **FR-5.1** Campaign file = YAML frontmatter + Markdown body. Frontmatter: `subject`
  (required), `group` (required), `preheader`, `send_at` (ISO8601, optional; immediate if
  absent), `from` (optional, defaults to account sender).
- **FR-5.2** Render Markdown → responsive HTML + auto-generated plain-text multipart.
- **FR-5.3** Inject per-recipient unsubscribe URL + `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers into every message.
- **FR-5.4** `co send <file> --dry-run` renders HTML + text preview and reports recipient
  count (confirmed, non-suppressed members of `group`). Sends nothing.
- **FR-5.5** `co send <file> --live` (or scheduled at `send_at`) enqueues the broadcast.
  **Gating:** above the free-tier volume threshold, the group's domain must be verified
  (FR-9.x) or the send is rejected with a clear "authenticate your domain" message.
- **FR-5.6** Worker renders once, fans out per recipient, **skips suppressed/unconfirmed**,
  throttles to the sending identity's pool + account limits, records per-recipient status.
- **FR-5.9** Pre-send spam linter: `--dry-run` also flags deliverability risks (missing
  unsubscribe, very high image-to-text ratio, low-reputation/shortened link domains, no
  plain-text part). Warnings, not hard blocks (except missing unsubscribe).
- **FR-5.7** A broadcast is recorded with status (`queued`/`sending`/`sent`/`failed`) and
  aggregate counts (sent, bounced, complained, skipped).
- **FR-5.8** Idempotency: re-running `send` for the same campaign+content does not double-send
  (content hash + broadcast id guard).

### 5.6 Deliverability feedback & abuse control
- **FR-6.1** Receive bounce/complaint/delivery events from the active email transport at a
  signed endpoint (provider webhooks for Postmark/SES; SMTP bounce parsing for self-host).
- **FR-6.2** Hard bounce or complaint → write account-scoped suppression; mark subscriber
  `bounced`/`complained`. Suppressions are checked before every send (FR-5.6).
- **FR-6.3** New accounts have a graduated sending cap (e.g. 200/day → raises with good
  reputation) to protect shared sending reputation.
- **FR-6.4** **Stream separation:** transactional mail (opt-in confirmations, claim,
  magic-link) sends on a separate high-reputation identity from marketing broadcasts, so a
  bad broadcast cannot block signup confirmations.
- **FR-6.5** **Sending pools:** new/unverified senders use a quarantine pool isolated from the
  established good-reputation pool; promotion criteria = sustained low complaint rate + good
  engagement.
- **FR-6.6** **Complaint auto-suspend:** track per-tenant complaint rate; auto-throttle or
  suspend marketing sends when it breaches a threshold (target < 0.1%, hard line 0.3%).
- **FR-6.7** **Monitoring (hosted):** ingest Google Postmaster Tools / Microsoft SNDS and
  feedback-loop (FBL) data; expose a per-tenant deliverability score via API + MCP.

### 5.7 Public endpoints
- **FR-7.1** `GET /badge/{group}` → SVG subscriber-count badge; cache 5–15 min; configurable
  label/color via query params. Counts confirmed subscribers only.
- **FR-7.2** Hosted `/thanks` page (themeable, carries "Powered by CodeOutbox" footer on
  free tier).

### 5.8 Agent surface
- **FR-8.1** MCP server exposing: `create_group`, `list_groups`, `subscriber_count`,
  `export_subscribers`, `preview_broadcast`, `send_broadcast`, `add_tag`, `sync_config`.
- **FR-8.2** Read tools require an API token. `send_broadcast` requires an explicit
  `confirm: true` (or `--live`) argument; without it, returns a dry-run preview only.
- **FR-8.3** CLI (`co`) wraps the identical control-plane API: `init`, `sync`, `send`,
  `groups`, `subscribers`, `dev`, `login`.
- **FR-8.4** `co dev` runs a local catcher: serves a localhost endpoint and prints submitted
  payloads to the terminal (no real emails sent).
- **FR-8.5** Publish `llms.txt` + one canonical integration doc; the snippet generator
  (`npx codeoutbox`) scaffolds a framework-matched form component.

### 5.9 Domain authentication & sending identity
- **FR-9.1** **Hybrid identity:** confirmations/claim/magic-link + tiny free-tier volume send
  from a shared CodeOutbox subdomain with no setup; broadcasts above the free threshold
  require the group's own authenticated domain.
- **FR-9.2** `co domains add <subdomain>` (MCP `add_domain`) returns the exact SPF, DKIM, and
  DMARC records to publish; stored as a pending domain identity.
- **FR-9.3** With a DNS-provider token (Cloudflare/Route53/Vercel), optionally auto-apply the
  records via the provider API. Records are also representable in config-as-code.
- **FR-9.4** `co domains verify` (MCP `verify_domain`) polls DNS until SPF/DKIM resolve and
  DMARC alignment passes; flips the domain to `verified` and unlocks volume broadcasts.
- **FR-9.5** `domain_status` exposes per-domain state (`pending`/`verified`/`failed`) and the
  outstanding records, via API + MCP, so an agent can drive setup to completion.

---

## 6. Data model (Postgres)

```
accounts(id, github_id, email, plan, daily_send_cap, created_at, claimed_at)
api_tokens(id, account_id, name, hash, scopes, last_used_at, revoked_at)
groups(id, account_id, slug UNIQUE, name, double_opt_in, redirect, tags[], created_at)
subscribers(id, group_id, email, name, status, tags[], consent_ip,
            consent_timestamp, source, created_at,
            UNIQUE(group_id, email))
   status ∈ {pending, confirmed, unsubscribed, bounced, complained}
suppressions(id, account_id, email, reason, created_at, UNIQUE(account_id, email))
broadcasts(id, account_id, group_id, subject, content_hash, status,
           send_at, sent_count, bounced_count, complained_count, skipped_count,
           created_at, sent_at)
broadcast_recipients(id, broadcast_id, subscriber_id, status, provider_id, error,
                     UNIQUE(broadcast_id, subscriber_id))
domains(id, account_id, subdomain UNIQUE, status, dkim_selector, records_jsonb,
        verified_at, created_at)              # status ∈ {pending, verified, failed}
sending_identities(id, account_id, kind, pool, domain_id, complaint_rate,
                   daily_cap, created_at)      # kind ∈ {transactional, marketing}
                                               # pool ∈ {quarantine, standard, trusted}
```

Relational integrity matters more than scale here. **Plain PostgreSQL** — any provider
(Docker for self-host, Neon/RDS/Supabase for hosted); no provider-specific features.

## 7. API surface (control plane)

All authd via API token or session. CLI + MCP + dashboard are clients of this one API.

```
POST   /f/{group}                 # public ingest
GET    /confirm/{token}           # public
GET    /unsubscribe/{token}       # public
POST   /unsubscribe/{token}       # public (one-click)
GET    /badge/{group}             # public SVG
POST   /webhooks/email/{provider} # signed (postmark|ses|smtp-bounce)
--- authd ---
GET    /v1/groups
POST   /v1/groups                 # create/update
POST   /v1/sync                   # reconcile codeoutbox.json
GET    /v1/groups/{id}/subscribers     # + ?format=csv|json
GET    /v1/groups/{id}/count
POST   /v1/broadcasts/preview     # render + recipient count + spam-lint, sends nothing
POST   /v1/broadcasts             # enqueue (requires confirm; domain-gated above free tier)
GET    /v1/broadcasts/{id}        # status + counts
POST   /v1/tags                   # add tag to subscriber(s)
POST   /v1/domains                # add domain → returns SPF/DKIM/DMARC records
POST   /v1/domains/{id}/verify    # poll DNS, flip to verified
GET    /v1/domains/{id}           # status + outstanding records
GET    /v1/deliverability         # per-tenant score / complaint rate (hosted)
```

## 8. Architecture

**Principle: portable-first, adapter-based.** One codebase runs as a single long-lived
container for self-hosters (`docker compose up` → app + Postgres) and scales out to
managed/edge services for the hosted version by swapping adapters via config. **No
proprietary-runtime lock-in** in the core (no Workers-only KV/Durable Objects, no
Supabase-only auth/RLS, no hard single-ESP dependency).

- **Runtime**: **Hono on Node 22** (or Bun) — a single stateless HTTP server hosting
  `POST /f/{group}`, `GET /badge`, the authd control-plane API, and webhook receivers.
  Hono is runtime-portable (Node/Bun/Deno/Workers), so the hosted version can later deploy
  the stateless ingest to the edge without forking. Honeypot, rate-limit, CORS in-app.
- **Database**: **plain PostgreSQL** — any provider (Docker, RDS, Neon, Supabase, a VPS).
- **Queue + worker**: **pg-boss** (Postgres-backed) by default — **zero extra infra**, reuses
  the same Postgres. Pluggable `Queue` interface allows a Redis/BullMQ adapter at scale.
- **Email transport (pluggable `EmailTransport` interface)**: **SMTP via Nodemailer** is the
  default (any mailbox/relay, ideal for self-host); **Postmark** and **SES** adapters for the
  hosted high-deliverability path. Bounce/complaint via provider webhooks or SMTP/IMAP
  bounce parsing.
- **Cache / rate-limit / KV**: Postgres-backed (or in-process) by default; optional Redis
  adapter. No dependency on an edge KV.
- **Auth**: **email magic-link** works everywhere (self-host default); **GitHub OAuth** as the
  hosted convenience (configurable).
- **Renderer**: Markdown + frontmatter → HTML + plain-text multipart, header injection.
- **Clients**: `co` CLI, MCP server, read-only dashboard — all thin over the control-plane API.

**Adapter summary** (config-selected, env-driven 12-factor):

| Concern | Self-host default | Hosted / scale option |
|---|---|---|
| Runtime | Node/Bun container | + edge-deployed ingest (Hono on Workers) |
| Database | Postgres (Docker) | Neon / RDS / Supabase Postgres |
| Queue | pg-boss (in Postgres) | Redis + BullMQ |
| Email | SMTP (Nodemailer) | Postmark / SES |
| Cache/RL | Postgres / in-process | Redis |
| Auth | Email magic-link | GitHub OAuth |

The "sexy, simple" frontend is backed by a deliberately boring, correctness-obsessed
backend: consent records, suppression, bounce handling, throttled sending.

## 9. Non-functional requirements

- **NFR-1 Latency:** ingest p95 < 50 ms in-region (single container); the hosted version may
  add an edge-deployed ingest for sub-50ms globally — not required for self-host.
- **NFR-2 Rate limits:** default 10 req/min/IP per group; 1000 req/hour/group; configurable.
- **NFR-3 Security:** signed tokens; no email enumeration; signed webhooks; scoped, revocable
  API tokens; secrets in env/secret store.
- **NFR-4 Privacy/compliance:** store consent timestamp + IP; trivial export + delete;
  GDPR/CAN-SPAM aligned; double opt-in default on.
- **NFR-5 Deliverability:** SPF + DKIM + **DMARC (aligned)** on broadcast domains; PTR/reverse
  DNS + TLS; plain-text multipart; `List-Unsubscribe` + one-click `-Post` (RFC 8058);
  graduated caps; quarantine/standard/trusted pools; stream separation; suppression enforced
  pre-send; complaint rate kept < 0.1% with auto-suspend at threshold. (See `DELIVERABILITY.md`.)
- **NFR-6 Reliability:** broadcast send is idempotent and resumable; per-recipient status
  persisted; webhook processing at-least-once with dedup.
- **NFR-7 Observability:** structured logs, send/bounce/complaint metrics, queue depth.
- **NFR-8 Portability:** no proprietary-runtime APIs in core; full stack boots from
  `docker compose up`; all external services behind config-selected adapters; 12-factor env.

## 10. Acceptance criteria (definition of done)

- **AC-1** Pasting the snippet and submitting a real email produces a `pending` subscriber
  and a confirmation email; clicking confirm flips to `confirmed`.
- **AC-2** First submission to an unclaimed group sends exactly one claim email; claiming
  creates an account bound to the group.
- **AC-3** `co sync` creates/updates groups from `codeoutbox.json` idempotently with a diff.
- **AC-4** `co send <file> --dry-run` shows accurate HTML/text preview + recipient count and
  sends nothing; `--live` delivers to all confirmed, non-suppressed members exactly once.
- **AC-5** A hard-bounce webhook adds a suppression; a subsequent broadcast skips that
  address and increments `skipped_count`.
- **AC-6** Unsubscribe link (GET and one-click POST) suppresses the address.
- **AC-7** MCP `send_broadcast` without `confirm` returns a preview; with `confirm` it sends.
- **AC-8** `GET /badge/{group}` returns a valid cached SVG with the confirmed count.
- **AC-9** Honeypot-filled and rate-limited submissions do not create subscribers.
- **AC-10** `co dev` prints local submissions to the terminal and sends no real email.
- **AC-11** `co domains add` returns valid SPF/DKIM/DMARC records; after publishing them,
  `co domains verify` flips the domain to `verified` and unlocks volume broadcasts.
- **AC-12** A volume broadcast on an unverified domain is rejected with an actionable
  "authenticate your domain" message; confirmations still send from the shared subdomain.
- **AC-13** A tenant whose complaint rate exceeds the threshold is auto-throttled/suspended
  for marketing sends while transactional confirmations continue (stream separation).
- **AC-14** `docker compose up` on a clean machine yields a working instance (ingest, confirm,
  broadcast via SMTP) with no proprietary services configured.

## 11. Milestones

1. **M1 — Capture core:** ingest endpoint, subscriber store, double opt-in, confirm/unsub,
   suppression, claim-by-email, badge, hosted `/thanks`. _(Journey A end-to-end.)_
2. **M2 — Accounts & config:** GitHub OAuth, API tokens, read-only dashboard, `co init`,
   `codeoutbox.json` + `co sync`. _(Config-as-code.)_
3. **M3 — Broadcasts + deliverability:** renderer, preview + spam linter, queue + worker
   (pg-boss), throttled send, email-transport adapters (SMTP + Postmark), bounce/complaint
   webhooks, per-recipient status, domain auth (`co domains`), stream separation + pools.
   _(Journeys B & D end-to-end.)_
4. **M4 — Agent surface & polish:** MCP server (incl. `add_domain`/`verify_domain`), `co dev`
   local catcher, `npx codeoutbox` form scaffolder, `llms.txt` + docs, `docker-compose.yml`
   for self-host. _(Journey C + the "sexy wedge" + portable deploy.)_

## 12. Dependencies & decisions

- **Runtime:** Hono on Node 22 (Bun-compatible); single portable container.
- **DB:** plain PostgreSQL (Docker self-host; Neon/RDS/Supabase hosted).
- **Queue:** pg-boss default; Redis/BullMQ adapter at scale.
- **Email transport:** SMTP/Nodemailer default (self-host); **Postmark** primary for hosted
  (best deliverability), SES adapter for cost/scale.
- **Auth:** email magic-link (self-host) + GitHub OAuth (hosted).
- **DNS-provider APIs:** Cloudflare/Route53/Vercel for optional auto-apply of email DNS records.
- **Decided:** hybrid sending identity with **agent-automated domain auth** (not deferred —
  it is the deliverability strategy; see `DELIVERABILITY.md`). Confirmations on shared
  subdomain; broadcasts gated on verified domain above free tier.
- **Open:** owning IPs / running own MTA deferred until scale; managed-edge ingest optional.

## 13. Out of scope (explicit)

Sequences/drip automation, segmentation UI, A/B testing, open/click analytics dashboards,
visual/WYSIWYG email builder, landing-page builder, CRM, multi-language, owning IPs / own MTA.
A *productized, supported* self-host edition (licensing, upgrade tooling, support) is out —
but the stack is **architected to self-host now** (§8, §15). Architect cleanly so the rest is
additive later; do not build now.

## 14. Self-hosting & deployment topology

- **Self-host (default portable path):** one Docker image + Postgres via `docker-compose.yml`;
  `docker compose up` yields a working instance. Email defaults to **SMTP** (user supplies any
  relay/mailbox). Auth via email magic-link. Queue via pg-boss (no extra service). Optional
  Redis for cache/queue at higher volume. All config via a single `.env` (12-factor).
- **Deliverability note for self-host:** inbox placement depends on the user's own SMTP relay
  reputation + their authenticated domain. The same `co domains` flow generates SPF/DKIM/DMARC;
  the platform's pool/stream machinery is most valuable in the multi-tenant hosted mode.
- **Hosted path:** same image, adapters switched to Postmark/SES, managed Postgres, GitHub
  OAuth, optional Redis and edge-deployed ingest; sending pools + monitoring (Postmaster/SNDS/
  FBL) active.
- **Parity rule:** features land in the portable core first; hosted-only concerns are limited
  to adapters and multi-tenant reputation/monitoring.

## 15. Risks

- **R1 Shared-reputation poisoning** → hybrid identity, quarantine/standard/trusted pools,
  stream separation, graduated caps, default double opt-in, fast suppression, complaint
  auto-suspend (< 0.1% target).
- **R2 Open endpoint abuse** → rate-limit, honeypot, optional Turnstile, anomaly alerts.
- **R3 "No backend" data-trust concern** → explicit data ownership + trivial export/delete;
  self-host option for the trust-sensitive.
- **R4 Deliverability of broadcasts from a new domain** → agent-automated SPF/DKIM/DMARC,
  warm-up, plain-text multipart, conservative initial volume, pre-send spam linter.
- **R5 Domain-auth friction undermines the wedge** → confirmations work setup-free on shared
  subdomain; the agent does the DNS work; only volume broadcasts require verification.
