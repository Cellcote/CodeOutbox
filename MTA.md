# CodeOutbox — Sending MTA setup (the VPS)

> Stand up the production sending box. The app **DKIM-signs every message itself**
> (per-tenant + shared), so Postfix is just a **plain authenticated relay** — no
> OpenDKIM, no per-tenant MTA reconfig. Adding a tenant domain stays a DB + DNS change.
> _Run on a clean-IP VPS (Hetzner/OVH), NOT the homelab._

## 0. VPS prerequisites
- Outbound **port 25** open (Hetzner: request unblock).
- **rDNS/PTR** for the VPS IP → `mta.codeoutbox.com` (set in the provider panel).
- IP **not on the Spamhaus PBL/SBL** (check `check.spamhaus.org`; ask for another if listed).

## 1. DNS for the shared sending domain (`mail.codeoutbox.com`)
```
mta.codeoutbox.com.        A     <VPS_IP>
<VPS_IP> (PTR)             →     mta.codeoutbox.com        # provider panel
mail.codeoutbox.com.       TXT   "v=spf1 ip4:<VPS_IP> -all"
co._domainkey.mail.codeoutbox.com. TXT "v=DKIM1; k=rsa; p=<SHARED_DKIM_PUBLIC>"
_dmarc.mail.codeoutbox.com. TXT  "v=DMARC1; p=none; rua=mailto:dmarc@codeoutbox.com"
```
Generate the shared DKIM keypair:
```bash
openssl genrsa -out shared_dkim.pem 2048
openssl rsa -in shared_dkim.pem -pubout -outform der 2>/dev/null | openssl base64 -A   # → p= value
```
Private key → app env `SHARED_DKIM_PRIVATE_KEY`; public (base64) → the DKIM TXT record.

## 2. Postfix as an authenticated relay
Accept SASL-authenticated submission from the app on **587 (STARTTLS)**, deliver outbound on 25.

`/etc/postfix/main.cf` (essentials):
```
myhostname = mta.codeoutbox.com
inet_interfaces = all
smtpd_tls_security_level = may
smtp_tls_security_level = may
# submission (587): require auth + TLS
# (enable submission in master.cf with smtpd_sasl_auth_enable=yes,
#  smtpd_relay_restrictions = permit_sasl_authenticated, reject)
message_size_limit = 26214400
```
Create an app submission user (SASL, e.g. via Dovecot or saslauthd) → username/password for the app. The app does NOT need to be a Postfix admin — just an authenticated submitter.

> The app submits **already DKIM-signed** mail, so do **not** add OpenDKIM (double-signing
> or header rewrites would break the app's signature). Keep Postfix from rewriting `From`/
> `DKIM-Signature`/`To`/`Subject`.

## 3. Point the app at the MTA
In the app's `.env`:
```
EMAIL_TRANSPORT=smtp
SMTP_URL=smtp://app:<password>@mta.codeoutbox.com:587      # STARTTLS on 587
SHARED_FROM_DOMAIN=mail.codeoutbox.com
SHARED_DKIM_SELECTOR=co
SHARED_DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```
With `SHARED_DKIM_PRIVATE_KEY` set, tenants without a verified domain send from
`t<id>@mail.codeoutbox.com` signed by the shared key; verified tenants send from their own
domain signed by their key. (Until it's set, broadcasts fall back to `MAIL_FROM` — see
`src/sender.ts`.)

## 4. Warm up the IP (don't skip)
New IP = no reputation. Ramp gradually, watching Google Postmaster Tools:
```
day 1–2:   ~50 / day
day 3–4:   ~200
day 5–7:   ~1,000
week 2:    ~5,000
week 3+:   scale as reputation holds
```
Keep complaint rate **< 0.1%**; pause the ramp if it climbs.

## 5. Register & monitor
- **Google Postmaster Tools** (verify `mail.codeoutbox.com`), **Microsoft SNDS/JMRP**.
- **Feedback loops (FBLs)** so complaints come back → suppression.
- **Blocklist monitoring** (Spamhaus etc.).

## 6. Bounce pipe (implemented)
Hard bounces now auto-suppress. Flow: broadcasts use a signed VERP return-path
(`bounce+<bid>.<sid>.<sig>@bounce.codeoutbox.com`, see `src/verp.ts`); the DSN comes back to
`bounce.codeoutbox.com` (MX → the MTA); Postfix pipes it to a script that POSTs the VERP to
`POST /webhooks/email-event`, which marks the subscriber `bounced` + suppresses.

DNS: `bounce` MX `10 mta.codeoutbox.com` + `bounce` TXT `v=spf1 ip4:<VPS_IP> -all`.

On the MTA:
```bash
# shared secret with the app (also set as BOUNCE_WEBHOOK_SECRET in the app .env)
openssl rand -hex 24 > /etc/codeoutbox/event_secret   # chown root:nogroup, chmod 640

# /usr/local/bin/co-bounce — only acts on permanent (5.x.x) failures:
#   VERP="$1"; MSG="$(cat)"
#   grep -qiE '^Status: 5\.' <<<"$MSG" && curl -s -X POST .../webhooks/email-event \
#     -H "X-CO-Event-Secret: $(cat /etc/codeoutbox/event_secret)" \
#     -d "{\"type\":\"bounce\",\"verp\":\"$VERP\"}"

postconf -e "relay_domains=bounce.codeoutbox.com"
echo "bounce.codeoutbox.com  coevent:" > /etc/postfix/transport && postmap /etc/postfix/transport
postconf -e "transport_maps=hash:/etc/postfix/transport"
# NOTE: single-quote so ${recipient} stays literal for Postfix (not the shell):
postconf -M 'coevent/unix=coevent unix - n n - - pipe flags=R user=nobody argv=/usr/local/bin/co-bounce ${recipient}'
systemctl reload postfix
```

**Complaints (FBL/ARF)** are still TODO — register the IP/domain with provider FBLs and route
the ARF reports to the same endpoint with `type:complaint`.

## Per-tenant verified domains (recap)
No MTA change. The tenant runs `co domains add <domain>` → publishes our generated
SPF/DKIM/DMARC records → `co domains verify`. The app signs their mail with the stored
(encrypted) DKIM key. The MTA just relays.
