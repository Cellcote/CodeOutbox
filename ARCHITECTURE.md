# CodeOutbox — Architecture (corrected north star)

> **What it is:** a multi-tenant email service that lets other SaaS **register and send a
> newsletter with near-zero effort**. The consumer does almost nothing; **we own delivery**
> (our own MTA + IP pools). Setup is harder on our side on purpose.
> _Status: drawing-board reset. Last updated 2026-06-06. Supersedes the BYO-SMTP decision in
> `MULTITENANCY.md`._

## The divergence this corrects

We drifted into a single-tenant **developer tool** (CLI/MCP/config-as-code/self-host) and
then made sending **BYO-SMTP** — which pushed the hard part onto the consumer. The intent is
the opposite: **the consumer does nothing hard; we run the email infrastructure.**

## North star: the consumer's entire experience

A SaaS (e.g. highveld) integrates in **3 steps, zero infra**:

1. **Register** → instant **API key** (one call / one dashboard click).
2. **Add subscribers** — embed `<form action="…/f/{public_id}">` *or*
   `POST /v1/lists/{id}/subscribers` from their own app (SaaS already have users).
3. **Send** — `POST /v1/broadcasts { list, subject, markdown }` (or CLI/agent).

No SMTP. No DNS required to start. We deliver. Branded sending (from `@highveld.nl`) is a
later one-step upgrade, not a prerequisite.

## Decisions locked

- **We run our own MTA + IP pools** (Postfix-class delivery, dedicated warmed IPs). Full
  control, best long-term economics, all deliverability burden on us.
- **Hybrid sending identity:** new tenants send immediately from our **shared sending
  domain** (`Highveld <highveld@mail.codeoutbox.com>`, reply-to theirs) at low volume — zero
  setup. To send at volume / fully branded from their domain, they verify it (we sign with
  our DKIM key for their domain).
- **API-first integration** (key auth), with form-embed for capture and CLI/MCP/SDK as a
  thin dev-friendly skin over the same API.

## Layers

### Tenancy & data (mostly built)
- `accounts` (tenants) + **API keys**.
- `lists` — per-tenant slug namespace + unguessable `public_id` (Phase 1 ✅).
- `subscribers` — per list, double opt-in, consent records, suppression (✅).
- `broadcasts` — Markdown → HTML/text, idempotent send (✅).
- `domains` — per-tenant verified sending domains; **we hold the DKIM private key** to sign.
- `sending_ips` / pools + per-tenant reputation tier (new).

### Integration surface (consumer)
- **REST API** (`X-API-Key`): lists, **subscribers (add / bulk import / remove)**,
  broadcasts (send / schedule), domains (verify), usage.
- **Form embed**: `POST /f/{public_id}` for capture (✅).
- **Webhooks → the tenant**: `delivered / bounced / complained / unsubscribed` so the SaaS's
  own system stays in sync (new — important for SaaS).
- **CLI / MCP / SDK**: thin clients over the API (the dev skin).

### Sending (we own it) — behind a `Transport` interface
- **Dev/staging:** relay (Mailpit / a single ESP) so the product is fully usable now.
- **Production:** **Postfix MTA** on dedicated IPs — MX delivery, queue, retries, TLS, VERP
  return-path for bounce capture.
- **Shared domain** (`mail.codeoutbox.com`): our SPF/DKIM/DMARC. Default From for new tenants.
- **Tenant-verified domains:** we generate a per-domain DKIM keypair (private key stored
  encrypted); tenant publishes DKIM (CNAME/TXT) + SPF include + DMARC; we sign their mail as
  their domain. (This is what `co domains` already generates — now correctly *ours to sign*.)
- **IP pools / warmup:** quarantine (new/unverified) → standard → trusted; gradual warmup;
  PTR per IP.

### Deliverability & abuse (the burden we took on)
- Mandatory **double opt-in** (especially on the shared domain), per-tenant **volume caps**,
  **complaint-rate auto-suspend** (< 0.1%), **new-tenant quarantine IP**, bounce/complaint →
  suppression, **FBLs + Postmaster/SNDS + blocklist monitoring**, content hygiene
  (`List-Unsubscribe` etc. ✅), KYC before high volume.

## Hosting reality (non-negotiable)

The MTA needs **clean dedicated IPs + outbound port 25 + controllable rDNS** — i.e. a
sending-friendly VPS/provider, **not the Proxmox homelab** (residential IPs are blocklisted;
port 25 is usually blocked). The homelab keeps the **app / DB / dashboard**; sending egress
moves to the MTA hosts. New IPs require **weeks of warmup** before full volume.

## Build path

1. **Transport reset** — one "we send" transport behind an interface; dev = Mailpit, staging
   = a relay. **Drop BYO-SMTP** (reverses the half-built Phase 2). Wire the hybrid identity
   (shared domain default; verified domain when present; per-tenant DKIM signing).
2. **SaaS onboarding** — instant signup → API key (replace the claim-by-email bootstrap as
   the primary path).
3. **Subscriber API** — `POST/DELETE /v1/lists/{id}/subscribers`, bulk import (the thing that
   makes it "easy for a SaaS").
4. **Tenant webhooks** — delivered/bounced/complained/unsubscribed back to the SaaS.
5. **DKIM signing + domains** — store per-domain private keys; sign per identity.
6. **MTA stand-up + warmup** (ops, time-gated) — the production sending backend; FBLs,
   Postmaster, monitoring, IP pools.
7. **Abuse/reputation controls** — pools, caps, auto-suspend, KYC.

Phases 1–5 are buildable now (relay-backed); 6–7 are the ops investment that own-MTA implies.

## Pricing implication

We send → per-email **COGS returns** (own-MTA: mostly fixed IP/host cost + ops, near-zero
marginal per email at volume). Charge by subscribers/volume; the earlier BYO "zero-COGS / fat
margin" framing in `PRICING.md` no longer applies. Send caps return as cost+reputation rails.
