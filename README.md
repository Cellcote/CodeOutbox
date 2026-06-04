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

Then preview and send with the `co` CLI (auth via a session token):

```bash
export CO_TOKEN=<your session token>   # from the co_session cookie at claim
npm run co -- send campaigns/launch.md            # dry-run: count + spam-lint
npm run co -- send campaigns/launch.md --live     # actually send
```

Sends go only to **confirmed, non-suppressed** subscribers. Every message gets a
per-recipient unsubscribe link plus `List-Unsubscribe` / `List-Unsubscribe-Post`
headers. Re-sending identical content is a no-op (content-hash idempotency).

## Layout

```
src/
  index.ts          # Hono app + server bootstrap
  config.ts         # 12-factor config (driver/transport selection)
  db.ts             # pg | pglite driver behind one query() interface
  tokens.ts         # signed confirm tokens (HS256 JWT)
  email/            # EmailTransport interface + console/smtp adapters + templates
  auth.ts           # resolve account from session cookie or Bearer token
  campaign.ts       # frontmatter + Markdown → HTML/text, compose, spam-lint
  broadcast.ts      # preview + send (fan-out, suppression, idempotency)
  cli.ts            # `co send <file> [--live]`
  routes/
    ingest.ts       # POST /f/:group
    confirm.ts      # GET  /confirm/:token
    claim.ts        # POST /claim, GET /claim/:token
    dashboard.ts    # GET  /dashboard, GET /logout
    unsubscribe.ts  # GET/POST /unsubscribe/:token
    broadcasts.ts   # POST /v1/broadcasts[/preview]
  pages.ts          # demo form, /thanks, confirm, claim, dashboard, unsub pages
```

## Configuration

Copy `.env.example` → `.env`. Defaults are local-dev friendly; the key switches:

- `DATABASE_URL` set → real Postgres (`pg`); unset → embedded `pglite`.
- `EMAIL_TRANSPORT=console` (default) or `smtp` (+ `SMTP_URL`).
