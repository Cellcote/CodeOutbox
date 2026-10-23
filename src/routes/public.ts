// Hosted, tenant-branded public pages for a list (by its unguessable public_id —
// slugs are only unique per account):
//   GET /l/:id        signup page (+ past issues when the owner turned the archive on)
//   GET /l/:id/:issue one archived issue, rendered as a web page
// plus the subscriber-flow pages (check your inbox / you're subscribed), so the
// whole path a reader walks carries the list's name and brand.
// These wear the *tenant's* brand; a small "Powered by CodeOutbox" rides along on
// free plans and unclaimed lists (the growth loop).

import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { query, queryOne } from "../db";
import { config } from "../config";
import { resolveBrand, type Brand } from "../brand";
import { parseCampaign } from "../campaign";
import { personalize, mergeVars, mergeText } from "../merge";
import { escapeHtml, escapeAttr } from "../email/shell";
import { MASKED_RE } from "../mask";

export interface PublicList {
  id: number;
  slug: string;
  public_id: string;
  name: string | null;
  owner_account_id: number | null;
  archive_public: boolean;
  expires_at: string | null;
  confirmed: number;
}

const LIST_SQL = (where: string) =>
  `SELECT g.id, g.slug, g.public_id, g.name, g.owner_account_id, g.archive_public,
            g.expires_at,
            (SELECT COUNT(*)::int FROM subscribers s
              WHERE s.group_id = g.id AND s.status = 'confirmed') AS confirmed
       FROM groups g
      WHERE ${where}
        AND (g.owner_account_id IS NOT NULL OR g.expires_at IS NULL OR g.expires_at > now())`;

export const findPublicList = (ref: string) =>
  queryOne<PublicList>(LIST_SQL("g.public_id = $1"), [ref]);
export const findListById = (id: number) =>
  queryOne<PublicList>(LIST_SQL("g.id = $1"), [id]);

export async function brandFor(list: PublicList): Promise<Brand> {
  if (list.owner_account_id) return resolveBrand(Number(list.owner_account_id));
  return { name: list.name || "Newsletter", domain: "", color: "#FFB000", logoUrl: "", poweredBy: true };
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

// Archived issues are tenant-authored HTML served from our origin, so lock the page
// down: only our nonce'd form script may run (no injected <script>, no on* handlers).
export function securePage(c: Context): string {
  const nonce = randomBytes(16).toString("base64");
  c.header(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
      `img-src https: data:; connect-src 'self' ${config.baseUrl}; ` +
      `form-action 'self' ${config.baseUrl}; base-uri 'none'; frame-ancestors 'none'`,
  );
  c.header("x-content-type-options", "nosniff");
  return nonce;
}

export function page(o: {
  brand: Brand;
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  body: string;
}): string {
  const accent = HEX.test(o.brand.color) ? o.brand.color : "#FFB000";
  const mark =
    o.brand.logoUrl && /^https:\/\//i.test(o.brand.logoUrl)
      ? `<img src="${escapeAttr(o.brand.logoUrl)}" alt="${escapeAttr(o.brand.name)}" height="32">`
      : `<span>${escapeHtml(o.brand.name)}</span>`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(o.title)}</title>` +
    `<meta name="description" content="${escapeAttr(o.description)}">` +
    `<link rel="canonical" href="${escapeAttr(o.canonical)}">` +
    (o.noindex ? `<meta name="robots" content="noindex">` : "") +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${escapeAttr(o.title)}">` +
    `<meta property="og:description" content="${escapeAttr(o.description)}">` +
    `<meta property="og:url" content="${escapeAttr(o.canonical)}">` +
    `<meta name="twitter:card" content="summary">` +
    `<style>` +
    `:root{--accent:${accent};--bg:#f6f6f4;--card:#fff;--ink:#141414;--muted:#6b6b6b;--line:#e6e6e3}` +
    `@media (prefers-color-scheme:dark){:root{--bg:#111;--card:#1a1a1a;--ink:#eee;--muted:#9a9a9a;--line:#2b2b2b}}` +
    `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}` +
    `body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}` +
    `.wrap{max-width:600px;margin:0 auto;padding:40px 16px 56px}` +
    `.mark{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;margin-bottom:28px;color:var(--ink);text-decoration:none}` +
    `.mark img{display:block;max-height:32px;width:auto}` +
    `.mark::before{content:"";width:10px;height:10px;border-radius:3px;background:var(--accent)}` +
    `.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}` +
    `h1{font-size:28px;line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}` +
    `.lede{color:var(--muted);margin:0 0 20px}` +
    `form.sub{display:flex;flex-wrap:wrap;gap:8px}` +
    `form.sub input[type=email]{flex:1 1 220px;min-width:0;font:inherit;padding:11px 13px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink)}` +
    `form.sub input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}` +
    `form.sub button{font:inherit;font-weight:600;padding:11px 20px;border:0;border-radius:9px;background:var(--accent);color:#111;cursor:pointer}` +
    `form.sub button:disabled{opacity:.6;cursor:progress}` +
    `.msg{flex-basis:100%;margin:6px 0 0;font-size:14px;color:#1f8a3b}.msg:empty{display:none}.msg[data-state=error]{color:#c0262d}` +
    `.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}` +
    `.issues{list-style:none;padding:0;margin:0}.issues li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid var(--line)}` +
    `.issues a{color:var(--ink);text-decoration:none;font-weight:500}.issues a:hover{color:var(--accent)}` +
    `.issues time{color:var(--muted);font-size:14px;white-space:nowrap}` +
    `h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:36px 0 4px}` +
    `article{overflow-wrap:anywhere}article img{max-width:100%;height:auto}article a{color:var(--accent)}` +
    `article pre{overflow:auto;background:var(--bg);padding:12px;border-radius:8px}` +
    `.back{display:inline-block;margin-bottom:16px;color:var(--muted);text-decoration:none;font-size:14px}` +
    `.note{font-size:14px;color:var(--muted);margin:12px 0 0}.latest{display:block;margin-top:6px;color:var(--ink);font-weight:600;text-decoration:none}.latest:hover{color:var(--accent)}` +
    `.foot{margin-top:28px;font-size:12px;color:var(--muted);text-align:center}.foot a{color:var(--muted)}` +
    `</style></head><body><div class="wrap">` +
    `<div class="mark">${mark}</div>` +
    o.body +
    (o.brand.poweredBy
      ? `<p class="foot">Powered by <a href="https://codeoutbox.com/?ref=page">CodeOutbox</a> · newsletters without a backend</p>`
      : "") +
    `</div></body></html>`
  );
}

export function subscribeForm(list: PublicList, nonce: string): string {
  const action = `${config.baseUrl}/f/${list.public_id}`;
  return (
    `<form class="sub" action="${escapeAttr(action)}" method="POST">` +
    `<label class="sr" for="email">Email</label>` +
    `<input id="email" type="email" name="email" required placeholder="you@example.com" autocomplete="email">` +
    `<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="sr">` +
    `<button type="submit">Subscribe</button>` +
    `<p class="msg" role="status" aria-live="polite"></p>` +
    `</form>` +
    `<script nonce="${nonce}">document.querySelectorAll('form.sub').forEach(function(f){var m=f.querySelector('.msg'),b=f.querySelector('button');` +
    `f.addEventListener('submit',async function(e){e.preventDefault();m.removeAttribute('data-state');m.textContent='';b.disabled=true;` +
    `try{var r=await fetch(f.action,{method:'POST',headers:{Accept:'application/json'},body:new FormData(f)});var d=await r.json().catch(function(){return{}});` +
    `if(r.ok&&d.ok){f.reset();m.textContent=d.status==='confirmed'?"You're subscribed 🎉":'Check your inbox to confirm ✉️'}` +
    `else{m.dataset.state='error';m.textContent=d.error||'Something went wrong. Try again.'}}` +
    `catch(_){m.dataset.state='error';m.textContent='Network error. Try again.'}finally{b.disabled=false}})})</script>`
  );
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

interface Issue {
  id: number;
  subject: string;
  sent_at: string;
}

async function archivedIssues(groupId: number): Promise<Issue[]> {
  return query<Issue>(
    `SELECT id, subject, sent_at FROM broadcasts
      WHERE group_id = $1 AND status = 'sent' AND in_archive AND source IS NOT NULL
      ORDER BY sent_at DESC LIMIT 100`,
    [groupId],
  );
}

// Merge tags on public pages render as if for an anonymous reader: fallbacks apply,
// everything else is blank. Never anyone's real data.
const ANON = mergeVars({ email: "" });

export async function listPage(c: Context) {
  const list = await findPublicList(c.req.param("id") ?? "");
  if (!list) return c.text("not found", 404);
  const nonce = securePage(c);
  const brand = await brandFor(list);
  const title = list.name || brand.name;
  const issues = list.archive_public ? await archivedIssues(list.id) : [];
  const n = Number(list.confirmed);
  const lede =
    n >= 5
      ? `Join ${n.toLocaleString("en-US")} readers. Unsubscribe anytime.`
      : "Get new issues by email. Unsubscribe anytime.";

  const body =
    `<div class="card"><h1>${escapeHtml(title)}</h1><p class="lede">${lede}</p>${subscribeForm(list, nonce)}</div>` +
    (issues.length
      ? `<h2>Past issues</h2><ul class="issues">` +
        issues
          .map(
            (i) =>
              `<li><a href="/l/${escapeAttr(list.public_id)}/${i.id}">${escapeHtml(mergeText(i.subject, ANON))}</a>` +
              `<time datetime="${new Date(i.sent_at).toISOString()}">${fmtDate(i.sent_at)}</time></li>`,
          )
          .join("") +
        `</ul>`
      : "");

  c.header("cache-control", "public, max-age=60");
  return c.html(
    page({
      brand,
      title,
      description: `Subscribe to ${title}.`,
      canonical: `${config.baseUrl}/l/${list.public_id}`,
      noindex: !list.owner_account_id,
      body,
    }),
  );
}

export async function issuePage(c: Context) {
  const list = await findPublicList(c.req.param("id") ?? "");
  if (!list || !list.archive_public) return c.text("not found", 404);
  const row = await queryOne<{ subject: string; source: string; sent_at: string }>(
    `SELECT subject, source, sent_at FROM broadcasts
      WHERE id = $1 AND group_id = $2 AND status = 'sent' AND in_archive AND source IS NOT NULL`,
    [Number(c.req.param("issue")), list.id],
  );
  if (!row) return c.text("not found", 404);
  const nonce = securePage(c);
  const brand = await brandFor(list);
  const r = personalize(parseCampaign(row.source), ANON);
  const listName = list.name || brand.name;

  const body =
    `<a class="back" href="/l/${escapeAttr(list.public_id)}">← ${escapeHtml(listName)}</a>` +
    `<div class="card"><p class="lede" style="margin:0 0 6px"><time datetime="${new Date(row.sent_at).toISOString()}">${fmtDate(row.sent_at)}</time></p>` +
    `<h1>${escapeHtml(r.meta.subject)}</h1><article>${r.bodyHtml}</article></div>` +
    `<div class="card" style="margin-top:16px"><p style="margin:0 0 12px;font-weight:600">Get the next one in your inbox</p>${subscribeForm(list, nonce)}</div>`;

  c.header("cache-control", "public, max-age=300");
  return c.html(
    page({
      brand,
      title: `${r.meta.subject} · ${listName}`,
      description: r.meta.preheader || r.bodyText.replace(/\s+/g, " ").slice(0, 160),
      canonical: `${config.baseUrl}/l/${list.public_id}/${c.req.param("issue")}`,
      noindex: false,
      body,
    }),
  );
}

// GET /thanks?l=<public_id>&e=<masked email> — where a no-JS form submit lands.
// Without a list it's a plain, unbranded page.
export async function thanksPageRoute(c: Context) {
  const list = await findPublicList(c.req.query("l") ?? "");
  const e = c.req.query("e") ?? "";
  const who = MASKED_RE.test(e) ? `<strong>${escapeHtml(e)}</strong>` : "your inbox";
  const brand = list ? await brandFor(list) : { name: "Newsletter", domain: "", color: "#FFB000", logoUrl: "", poweredBy: true };
  const name = list?.name || brand.name;
  securePage(c);
  return c.html(
    page({
      brand,
      title: `Check your inbox · ${name}`,
      description: `Confirm your subscription to ${name}.`,
      canonical: `${config.baseUrl}/thanks`,
      noindex: true,
      body:
        `<div class="card"><h1>Check your inbox</h1>` +
        `<p class="lede">We sent a confirmation link to ${who}. Tap it to finish subscribing to ${escapeHtml(name)}.</p>` +
        `<p class="note">Not there after a minute? Look in Promotions or spam.</p></div>`,
    }),
  );
}

// Rendered by GET /confirm/:token once the subscriber is confirmed.
export async function confirmedPageFor(c: Context, groupId: number) {
  const list = await findListById(groupId);
  const brand = list ? await brandFor(list) : { name: "Newsletter", domain: "", color: "#FFB000", logoUrl: "", poweredBy: true };
  const name = list?.name || brand.name;
  const latest = list?.archive_public ? (await archivedIssues(list.id))[0] : undefined;
  securePage(c);
  return c.html(
    page({
      brand,
      title: `You're subscribed · ${name}`,
      description: `You're subscribed to ${name}.`,
      canonical: `${config.baseUrl}/`,
      noindex: true,
      body:
        `<div class="card"><h1>You're subscribed 🎉</h1>` +
        `<p class="lede">The next issue of ${escapeHtml(name)} comes straight to your inbox.</p>` +
        (latest && list
          ? `<p class="note">Meanwhile, read the latest one:<a class="latest" href="/l/${escapeAttr(list.public_id)}/${latest.id}">${escapeHtml(mergeText(latest.subject, ANON))} →</a></p>`
          : "") +
        `<p class="note">Changed your mind? Every email has a one-click unsubscribe link.</p></div>`,
    }),
  );
}
