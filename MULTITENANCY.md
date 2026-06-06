# CodeOutbox — Multi-tenancy & sending model

> **⚠️ SUPERSEDED (2026-06-06) by [`ARCHITECTURE.md`](./ARCHITECTURE.md).** The BYO-SMTP
> decision below was reversed: it pushed the hard part onto the consumer, contradicting the
> goal of "any SaaS registers and sends with near-zero effort." New direction: **we own
> sending** (our own MTA + IP pools) with a **hybrid identity** (shared domain to start,
> verify to scale). The **per-account namespacing + `public_id`** model below still stands and
> is built; only the *sending* model changed (BYO → we send).

---

> _Original (superseded) decision:_ **BYO-SMTP + shared hybrid.** Each tenant brings their own
> ESP/SMTP for broadcasts; a shared CodeOutbox sender handles confirmations + free-tier volume.

## Why

Relaying every tenant through one CodeOutbox ESP account doesn't scale: Resend free is
1 domain + 3k emails/mo; even paid caps domains and bills per email for everyone. Per-tenant
domains in one account is the wrong shape. For a developer-first, self-hostable product, the
natural model is **tenants bring their own sending**.

This makes the constraint an advantage:
- **Sending COGS ≈ 0** (the tenant pays their own ESP) → charge for the *management layer*,
  by subscribers/features, **not** by sends. Margins are fat; the send-cap stops being a
  cost-control lever. (Supersedes the reseller assumption in `PRICING.md`.)
- **No domain caps** on our side, **no shared-IP reputation** risk across tenants.
- **Self-host parity** — a self-hoster always brings their own SMTP anyway.

## Sending identity (the hybrid)

- **Shared sender** (our single Resend/SES domain): opt-in confirmations, claim, magic-link,
  and free-tier broadcasts up to a small cap. Keeps the "paste a form, works in 5 minutes"
  wedge friction-free — no tenant SMTP setup required to start capturing.
- **Per-tenant transport**: broadcasts above the cap relay through the **account's own SMTP**
  credentials, sent **From their own domain** (e.g. `nieuwsbrief@highveld.nl`).

`co domains` (SPF/DKIM/DMARC generator) becomes a "here's what to publish" helper; the actual
authentication happens in the tenant's own ESP (or their own MTA if self-hosting).

## Example: highveld.nl

1. Sign up to CodeOutbox (account = highveld; login `admin@highveld.nl`).
2. Capture immediately — paste the form; confirmations go out via the shared sender.
3. To send broadcasts: connect highveld's own Resend/SES key (mail now sends from
   `@highveld.nl`, on highveld's account + free tier).
4. Write Markdown, `co send`.

## Data-model changes

- **`accounts`**: add `smtp_url` (encrypted at rest), `mail_from`, `sending_mode`
  (`shared` | `byo`).
- **`groups`**: replace global `slug UNIQUE` with **`UNIQUE(account_id, slug)`** (per-tenant
  namespace) + add **`public_id`** (random, unguessable).
- **Form endpoint**: `POST /f/:public_id` (resolve by `public_id`, not slug). Slug stays the
  human handle for CLI/dashboard/config. → highveld and the dogfood list can both be
  `newsletter`.
- **Broadcast send**: resolve the account's transport (own SMTP if `byo`, else shared) and
  compose **From the account's `mail_from`** for broadcasts (shared sender only for
  confirmations / free tier).

## Build phases

1. **Namespacing (keystone)** — per-account slug uniqueness + `public_id` form endpoints;
   migrate the existing `newsletter`. Everything else hangs off this.
2. **Per-tenant transport** — account SMTP config (encrypted), a transport resolver
   (per-account → shared fallback), `From` = account domain for broadcasts; `co connect`
   (or dashboard) to set SMTP; shared-sender abuse limits (free volume cap + complaint
   monitoring).
3. **Signup / onboarding** — magic-link signup (no group needed), "create list → copy your
   snippet", clean per-account API-token issuance.

## Open questions

- **Encrypting stored SMTP creds**: derive a key from `TOKEN_SECRET`, or a separate secret /
  KMS. Never log or return them.
- **Shared-sender protection**: it's the one identity every free tenant rides — strict
  free-tier volume cap, double opt-in, complaint auto-suspend, so one bad tenant can't burn
  it.
- **Onboarding friction vs the wedge**: confirmations on the shared sender keep first-run
  zero-setup; BYO is only required at the broadcast step.
