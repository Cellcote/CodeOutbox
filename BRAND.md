# CodeOutbox — Brand & Style

> Developer-first, minimalist ("the site is proof, not pitch"). Logo: **`[↑]` outbox
> brackets**. Accent: **amber (CRT)**. Feel: Resend × Buttondown × Linear.
> _Status: brand direction v1. Last updated 2026-06-04._

## Logo — `[↑]`

Square brackets enclosing an up-arrow: `[` `]` = code, `↑` = outgoing mail. Reads as an
outbox tray.

- **Mark:** `[↑]` — derived from a monospace glyph; the arrow is the only amber element.
- **Lockup:** `[↑] CodeOutbox` (mark + wordmark, ~8px gap). Wordmark in the sans, tight
  tracking, single weight.
- **Favicon / app icon:** `[↑]` in a rounded square — ink background, amber arrow (pops at
  16px). Monochrome fallback: all-ink or all-paper (the arrow still reads).
- **Motion (optional):** on hover the `↑` nudges up a few px — a tiny "send."
- **Don'ts:** no gradient, no 3D tray, no envelope. Keep it a glyph, not an illustration.

## Color

One accent. Amber is a *spark* — links, the primary action, the `↑`, prompt glyphs, active
states, one underline. Never fill large areas with it.

```
/* Ink / paper */
--ink:        #0A0A0A;   /* text on light, bg on dark */
--paper:      #FAFAFA;   /* bg on light, text on dark */
--muted:      #71717A;   /* secondary text (zinc-500) */
--border:     #E5E5E5;   /* hairline (light) */
--border-dk:  #1F1F1F;   /* hairline (dark) */
--code-bg:    #0D0D0D;   /* terminal blocks (dark even on light pages) */

/* Amber (CRT) accent */
--amber:      #F59E0B;   /* default (amber-500) */
--amber-crt:  #FFB000;   /* warmer CRT alt for dark surfaces */
--amber-hover:#D97706;   /* amber-600 */
--amber-dk:   #FBBF24;   /* amber-400, for contrast on dark */
```

- **Light theme:** paper bg, ink text, amber accent.
- **Dark theme (hero / terminal):** ink bg, paper text, `--amber-crt`/`--amber-dk` accent.
- Dark-mode-first hero flowing into a light body is the recommended layout.

## Typography

Monospace *everywhere it can plausibly go* is the strongest "dev tool" signal — and nearly
free.

- **Sans (prose, headings):** Geist or Inter. Weights: Regular + Semibold only. Tight
  tracking on display sizes.
- **Mono (wordmark accents, nav, labels, pricing numbers, code):** Geist Mono / JetBrains
  Mono / Berkeley Mono.
- **Scale:** hero 48–64 · h2 32 · h3 20 · body 16–18 (line-height 1.6) · small 13–14 mono.

## Components

- **Buttons:** primary = solid **ink** (paper text) on light / solid paper on dark — high
  contrast, calm. Reserve **amber** for the single most important CTA (e.g. *Get started*) or
  for links/underlines, so it stays special. No shadows; 8px radius; hairline on secondary.
- **Code blocks:** dark terminal styling even on light pages; mono; `$`/`>` prompt and
  highlights in amber; copy button top-right; a small filename/lang label (skip the
  traffic-light dots — too skeuomorphic).
- **Cards / pricing:** hairline borders, lots of air, mono numbers; amber only on the
  recommended tier's border/badge.
- **Surfaces:** no gradients, minimal shadow, hairline dividers, generous whitespace.

## Hero (minimalism = show the code)

One sentence, one command, one working form. Resist a feature column.

```
Email marketing your agent sets up in one prompt.
Paste a form. No backend.

  $ npx codeoutbox init
  ✓ form ready → co.app/f/newsletter

[ Get started ]   docs ›
```

Product tour = one code block with three tabs: **Paste** (`<form>`), **Send**
(`campaign.md` + `co send`), **Agent** (the MCP call). Optional hero animation: an agent
prompt types "add a newsletter to my site" and the form materializes.

## Pricing section

Transparency as a feature: real numbers, no "Contact sales" for core tiers (Free / $9 / $19 /
$49), send caps stated, a subscriber→price slider, "Free forever, 1,000 subscribers" up
front, and a link to self-host/open-source. No dark patterns, no fake urgency. See
[`PRICING.md`](./PRICING.md).

## Voice

Terse, technical, lowercase-friendly. Declaratives — *"Paste a form. No backend."* /
*"Your lists live in your repo."* / *"Your agent sets up DKIM."* No "revolutionize," no
"effortless." Let the code carry the claim.

## Reference aesthetics

Resend (code-first hero, restraint), Linear (monochrome + one accent, type), Buttondown
(plainspoken dev newsletter), Stripe/Tailwind docs (code as first-class), Warp (terminal
warmth). CodeOutbox = those, with an amber CRT spark.
