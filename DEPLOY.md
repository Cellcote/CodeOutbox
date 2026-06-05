# CodeOutbox — Deploy (Proxmox LXC + Docker + Resend + auto-deploy)

A test/staging deploy that matches the homelab pattern: a per-app **LXC**, **NPM**
fronts TLS, mail relays through **Resend**, and a **GitHub push webhook** auto-deploys
on every push to `main`.

```
GitHub push ──webhook (HMAC)──▶ CT 202 (Debian LXC, nesting on)
                                  ├─ codeoutbox-webhook.service  (:9000)  → deploy.sh
                                  └─ docker compose -f docker-compose.prod.yml
                                       app :3000  (Hono)         db :5432 (internal only)
NPM ──TLS──▶ codeoutbox.<domain>            → CT202:3000
NPM ──TLS──▶ codeoutbox.<domain>/hooks/...  → CT202:9000
Resend ◀── SMTP relay (smtp.resend.com:465) ── app
```

> Note on mail: with a relay, deliverability comes from **Resend's** domain
> verification (their SPF/DKIM records on your domain), not the app's `co domains`
> feature — that's the product's hosted-tenant abstraction. For self-host sending,
> verify your domain in Resend and set `MAIL_FROM` to it.

---

## 0. Prerequisites

- A **Resend** account, a **verified sending domain** (add Resend's DNS records), and an
  **API key** (`re_…`). Until the domain is verified, Resend only sends to your own address.
- A DNS record for `codeoutbox.<domain>` pointing at NPM (as your other sites do).
- Your existing **Nginx Proxy Manager**.

## 1. Create the LXC (on the Proxmox host, 192.168.1.111)

Docker needs nesting. Following the CT 200/201 pattern → **CT 202**:

```bash
pct create 202 local:vztmpl/debian-12-standard_*.tar.zst \
  --hostname codeoutbox --cores 2 --memory 2048 --swap 512 \
  --rootfs local-lvm:12 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.202/24,gw=192.168.1.1 \
  --features nesting=1,keyctl=1 --unprivileged 1 --onboot 1
pct start 202
pct exec 202 -- bash -c "apt-get update && apt-get install -y curl"
```

(Adjust IP/bridge/storage to your network.)

## 2. Bootstrap inside the LXC

```bash
pct enter 202
curl -fsSL https://raw.githubusercontent.com/Cellcote/CodeOutbox/main/deploy/bootstrap.sh \
  -o /tmp/bootstrap.sh
bash /tmp/bootstrap.sh https://github.com/Cellcote/CodeOutbox.git
```

Installs Docker + compose + `webhook`, clones to `/opt/codeoutbox`, installs the
auto-deploy service (not started yet).

## 3. Configure secrets

```bash
cd /opt/codeoutbox
nano .env                    # BASE_URL, TOKEN_SECRET, POSTGRES_PASSWORD + DATABASE_URL,
                             # SMTP_URL (Resend key), MAIL_FROM (verified domain)
nano deploy/webhook.env      # CODEOUTBOX_WEBHOOK_SECRET
# secrets: openssl rand -hex 32
```

Resend SMTP: `SMTP_URL=smtps://resend:re_YOUR_KEY@smtp.resend.com:465`,
`MAIL_FROM=CodeOutbox <hello@your-verified-domain.com>`.

## 4. Start the app

```bash
cd /opt/codeoutbox
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps        # app healthy?
curl -s localhost:3000/health                        # → ok
```

## 5. Start auto-deploy

```bash
systemctl start codeoutbox-webhook
systemctl status codeoutbox-webhook --no-pager
```

## 6. NPM proxy hosts (apex = marketing, subdomain = app)

The compose stack serves the static marketing site (`site/`) on `:8080` (`web`) and the
app on `:3000` (`app`). Split them at NPM:

- **Marketing (apex):** `codeoutbox.com` → `http://192.168.1.202:8080` — request SSL +
  force HTTPS. On this host add a **Custom location** `/hooks/` → `http://192.168.1.202:9000`
  so GitHub's `…/hooks/codeoutbox-deploy` still reaches the webhook (**no GitHub change**).
- **App (subdomain):** add a DNS A record for `demo.codeoutbox.com` → your public IP, then a
  proxy host `demo.codeoutbox.com` → `http://192.168.1.202:3000` — request SSL + force HTTPS.

Set `BASE_URL=https://demo.codeoutbox.com` in `.env` (the **app** host — links are generated
from it) and recreate the app:
`docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate app`.

## 7. GitHub webhook

Repo → **Settings → Webhooks → Add webhook**:
- **Payload URL:** `https://codeoutbox.<domain>/hooks/codeoutbox-deploy`
- **Content type:** `application/json`
- **Secret:** the same value as `CODEOUTBOX_WEBHOOK_SECRET`
- **Events:** Just the `push` event

Push to `main` → GitHub posts → HMAC verified → `deploy.sh` pulls + rebuilds.
Watch it: `journalctl -u codeoutbox-webhook -f`.

## 8. Test the loop

```bash
# subscribe (over the public URL so links are correct)
curl -s -X POST https://demo.codeoutbox.com/f/newsletter \
  -H 'Accept: application/json' -d 'email=you@yourdomain.com'
```

The confirmation email is delivered by Resend — check your inbox (or the Resend
dashboard "Emails" log). Click confirm → `confirmed`. Then claim, mint a token, and
`co send`. (For larger broadcasts, mind `FREE_TIER_SEND_LIMIT` / `co domains`.)

---

## Operating notes

- **Backups:** data lives in the `pgdata` volume. Cron a dump:
  `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U codeoutbox codeoutbox | gzip > /opt/backups/co_$(date +%F).sql.gz`
- **Update:** just `git push` to `main` — the webhook redeploys. Manual:
  `cd /opt/codeoutbox && ./deploy/deploy.sh`.
- **Downtime:** `up -d --build` rebuilds in place — a few seconds of downtime per deploy.
  Fine for staging; for zero-downtime you'd add a second app container + reload.
- **Security:** Postgres `:5432` is never published. Only `:3000` (app) and `:9000`
  (webhook) are reachable, both behind NPM. Firewall `:9000` to NPM if you can.
- **This is a staging/test posture:** runs via `tsx` (no compiled build) and the
  in-process broadcast sender. For production scale, add a build step and a durable
  queue (pg-boss) — see `PRD.md`.
