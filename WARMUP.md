# Sending warmup

A fresh sending IP (`85.209.50.115` / `mail.codeoutbox.com`) has no reputation.
Blasting volume from it gets you throttled or spam-foldered. Warmup = ramp volume
gradually while sending to engaged recipients, and watch the numbers.

## 1. The automatic ramp (built in)

The app caps total daily sends across the shared MTA on a ~2-week curve, starting
from your first broadcast and graduating to no cap afterward.

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15+ |
|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| Cap | 50 | 100 | 200 | 400 | 800 | 1.5k | 3k | 6k | 10k | 15k | 25k | 40k | 70k | 100k | ∞ |

- `co warmup` (or `GET /v1/warmup`) shows the day, today's cap, used, remaining.
- `preview` warns, `send` blocks if a broadcast would breach the day's cap — split it across days.
- Override with `WARMUP_ENABLED=false` in the app `.env`.

## 2. Reputation monitoring — Google Postmaster Tools

You can't warm what you can't see. Register the sending domain:

1. Go to **https://postmaster.google.com** → **add `mail.codeoutbox.com`**.
2. Google gives a **TXT verification record** — add it in TransIP (Name: `mail`,
   value: the `google-site-verification=…` string, **no quotes**).
3. Verify in Postmaster Tools. After ~48h of sending to Gmail addresses you'll see:
   **Domain/IP reputation, spam rate, authentication (SPF/DKIM/DMARC) pass %, delivery errors.**
4. Goal: reputation **High/Medium**, **spam rate < 0.10%** (Gmail's bulk threshold),
   auth at ~100%.

(Microsoft equivalents: **SNDS** + **JMRP** for Outlook/Hotmail, if you send there.)

## 3. Practices that actually move reputation

- **Send to engaged recipients first** — opens/replies/"not spam" build reputation fastest.
- **Be consistent** — a steady daily trickle beats sporadic bursts.
- **Keep complaints < 0.1%** and bounces low — the bounce pipe already auto-suppresses
  hard bounces; honor unsubscribes instantly (we do).
- **Authenticate everything** — SPF + DKIM + DMARC all pass already; keep it that way.
- **Don't buy/scrape lists.** One spam-trap hit on a cold IP is very costly.

## 4. Where we are

Warmup auto-started on the first broadcast. Volume is tiny today (a couple of
recipients), so the cap won't bite — the value kicks in as real lists grow. The
immediate to-do is **Postmaster Tools** (step 2) so reputation is visible.
