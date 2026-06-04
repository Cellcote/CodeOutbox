# CodeOutbox

Email marketing your coding agent sets up in one prompt. Paste a form — no backend.

> **Status: early build.** Working end-to-end:
> - **Capture:** `form submit → pending subscriber → double opt-in email → confirm`
> - **Claim:** `claim an unclaimed list by email → magic link → dashboard` (no signup)
> - **Broadcast:** `write campaign.md → co send --dry-run → --live` (Markdown → HTML/text,
>   per-recipient unsubscribe, suppression, idempotent send)
>
> See [`PRD.md`](./PRD.md) for the full Tier 0+1 plan, [`DELIVERABILITY.md`](./DELIVERABILITY.md)
> for the inbox-placement strategy, and [`BRAINSTORM.md`](./BRAINSTORM.md) for the concept.

## Run it

### Option A — Docker (real Postgres + Mailpit)

```bash
docker compose up --build
# app:        http://localhost:3000
# mailbox UI: http://localhost:8025   (Mailpit catches all sent email)
```

### Option B — Local, zero external services

No Postgres needed — falls back to embedded **PGlite** (Postgres in WASM). Emails
print to the terminal (console transport).

```bash
npm install
npm run start
# open http://localhost:3000
```

## Try the loop

1. Open <http://localhost:3000>, enter an email, Subscribe.
2. The confirmation email is printed in the server logs (console transport) — copy the
   `/confirm/...` link.
3. Open that link → subscriber flips to **confirmed**.

Or with curl:

```bash
curl -i -X POST http://localhost:3000/f/newsletter \
  -H 'Accept: application/json' \
  -d 'email=you@example.com'
# → {"ok":true,"status":"pending"}, confirm link printed in logs
```

## Claim your list (no signup)

```bash
# 1. Request a claim link (the list must be unclaimed)
curl -s -X POST http://localhost:3000/claim \
  -H 'Accept: application/json' \
  -d 'group=newsletter&email=you@yoursite.com'

# 2. Open the /claim/... link from the logs → you're signed in at /dashboard
```

An unclaimed list belongs to whoever claims it first; once owned it can't be
re-claimed. The dashboard (`/dashboard`) is session-gated via an httpOnly cookie.

## Scaffold a form (`npx codeoutbox`)

Generate a polished, accessible capture form (works with no JS; enhances with
inline success/error). Dependency-free:

```bash
npx codeoutbox form --group newsletter                 # HTML (self-contained)
npx codeoutbox form --group beta --framework react      # React (Tailwind)
npx codeoutbox init --group newsletter                  # writes codeoutbox.json + form
```

## Show off your list (badge)

Embed a live subscriber count in your README — social proof + a backlink:

```md
![subscribers](https://co.app/badge/newsletter)
```

`GET /badge/:group` returns a cached shields-style SVG (`?label=` and `?color=` to customize).

## Test forms locally (`co dev`)

Point your form at a local catcher — submissions print to your terminal, no real emails:

```bash
co dev --port 3030
# POST → http://localhost:3030/f/<group> · test form at http://localhost:3030/
```

## Config as code (`co sync`)

Declare your lists in `codeoutbox.json` and reconcile them — git-native, PR-reviewable:

```json
{ "groups": { "newsletter": { "name": "Newsletter", "doubleOptIn": true, "redirect": "/thanks" } } }
```

```bash
co sync --dry-run    # show the plan (+ create, ~ update, = no change)
co sync              # apply (idempotent; never deletes implicitly)
```

## Send a broadcast

Write a campaign as Markdown with frontmatter (`campaigns/launch.md`):

```markdown
---
subject: Launch week is here 🚀
group: newsletter
preheader: What we shipped and what's next
---

Hey there, here's what's new this week…
```

Then preview and send with the `co` CLI (auth via an API token):

```bash
export CO_TOKEN=<api token>                        # see "API tokens" below
npm run co -- send campaigns/launch.md            # dry-run: count + spam-lint
npm run co -- send campaigns/launch.md --live     # actually send
```

Sends go only to **confirmed, non-suppressed** subscribers. Every message gets a
per-recipient unsubscribe link plus `List-Unsubscribe` / `List-Unsubscribe-Post`
headers. Re-sending identical content is a no-op (content-hash idempotency).

## API tokens

The CLI and MCP authenticate with an API token (`CO_TOKEN`). Mint one with your
session (the `co_session` cookie value from claiming a list):

```bash
CO_TOKEN=<session token> npm run co -- token create --name ci
# → prints a co_live_... token ONCE. Store it; use it as CO_TOKEN from then on.
```

Tokens are stored hashed (SHA-256), never in plaintext. Manage them via the API:
`POST /v1/tokens` (create), `GET /v1/tokens` (list), `DELETE /v1/tokens/:id`
(revoke). A revoked token is rejected immediately.

## Authenticate a sending domain (`co domains`)

Hybrid sending identity: opt-in confirmations send from a shared subdomain (zero
setup), but **broadcasts above the free-tier limit require your own authenticated
domain**. The agent does the DNS work:

```bash
co domains add news.acme.com     # prints SPF / DKIM / DMARC records to publish
co domains verify news.acme.com  # checks DNS; when aligned → broadcasts unlock
co domains list
```

`add` generates a real RSA DKIM keypair and the three TXT records. `verify` does
live DNS TXT lookups (`DOMAIN_VERIFY_MODE=dns`); set `DOMAIN_VERIFY_MODE=mock`
locally to demo the add→verify→unlock flow offline. The free-tier recipient limit
is `FREE_TIER_SEND_LIMIT` (default 100). Same tools exist over MCP
(`add_domain`, `verify_domain`, `list_domains`). See [`DELIVERABILITY.md`](./DELIVERABILITY.md).

## Drive it from a coding agent (MCP)

CodeOutbox ships an MCP server so an agent can operate it with no dashboard. Tools:
`list_groups`, `create_group`, `subscriber_count`, `preview_broadcast`,
`send_broadcast` (send is confirm-gated). It's a thin client over the same API.

```bash
# 1. Run the server (so the MCP server has an API to talk to)
npm run start                      # or: docker compose up

# 2. Register the MCP server with your agent. Copy the example and set CO_TOKEN:
cp .mcp.json.example .mcp.json     # then edit CO_TOKEN (a co_session token)

# Or run it directly:
CO_TOKEN=<session token> npm run mcp
```

With Claude Code, a project `.mcp.json` is picked up automatically; then ask
*"list my CodeOutbox groups"* or *"send campaigns/launch.md to newsletter"*.

## Layout

```
src/
  index.ts          # Hono app + server bootstrap
  config.ts         # 12-factor config (driver/transport selection)
  db.ts             # pg | pglite driver behind one query() interface
  tokens.ts         # signed confirm tokens (HS256 JWT)
  email/            # EmailTransport interface + console/smtp adapters + templates
  auth.ts           # resolve account from session cookie, API token, or Bearer
  apitokens.ts      # create/verify/revoke API tokens (stored hashed)
  domains.ts        # SPF/DKIM/DMARC generation + DNS verification
  campaign.ts       # frontmatter + Markdown → HTML/text, compose, spam-lint
  broadcast.ts      # preview + send (fan-out, suppression, idempotency, domain gating)
  cli.ts            # `co send | sync | token create`
  mcp.ts            # MCP stdio server (agent-facing) over the control-plane API
bin/
  codeoutbox.mjs    # `npx codeoutbox form|init` scaffolder (dependency-free)
  routes/
    ingest.ts       # POST /f/:group
    confirm.ts      # GET  /confirm/:token
    claim.ts        # POST /claim, GET /claim/:token
    dashboard.ts    # GET  /dashboard, GET /logout
    unsubscribe.ts  # GET/POST /unsubscribe/:token
    badge.ts        # GET /badge/:group (shields-style SVG)
    tokens.ts       # GET/POST /v1/tokens, DELETE /v1/tokens/:id
    groups.ts       # GET/POST /v1/groups, GET /v1/groups/:slug/count
    broadcasts.ts   # POST /v1/broadcasts[/preview]
  pages.ts          # demo form, /thanks, confirm, claim, dashboard, unsub pages
```

## Configuration

Copy `.env.example` → `.env`. Defaults are local-dev friendly; the key switches:

- `DATABASE_URL` set → real Postgres (`pg`); unset → embedded `pglite`.
- `EMAIL_TRANSPORT=console` (default) or `smtp` (+ `SMTP_URL`).
