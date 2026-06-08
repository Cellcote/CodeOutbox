// `co` — thin CLI over the control-plane API. Reads a campaign file and previews
// or sends it. Auth via CO_TOKEN (a session token); server URL via CO_URL.
//
//   co send <file>            # dry-run: preview + recipient count + lint
//   co send <file> --live     # actually send
//
// Env: CO_URL (default http://localhost:3000), CO_TOKEN (session token).

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const base = (process.env.CO_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.CO_TOKEN ?? "";

function usage(): never {
  console.error(
    "usage:\n" +
      "  co send <file> [--live]\n" +
      "  co sync [file=codeoutbox.json] [--dry-run]\n" +
      "  co dev [--port <n>]\n" +
      "  co token create [--name <name>]\n" +
      "  co domains add <subdomain>\n" +
      "  co domains verify <subdomain>\n" +
      "  co domains list\n" +
      "  co brand show\n" +
      "  co brand set [--name <name>] [--color <#hex>] [--logo <https-url>]\n" +
      "  co warmup\n" +
      "  co upgrade <plan> [--annual]   # pro | growth | scale | business\n" +
      "  co billing                     # manage/cancel subscription\n" +
      "  co webhooks add <https-url> [--events <a,b>]\n" +
      "  co webhooks list | rm <id>",
  );
  process.exit(1);
}

// co dev — a local form catcher. Point your form at it to test submissions; they
// print to the terminal and no real emails are sent.
function devCatcher(args: string[]) {
  const i = args.indexOf("--port");
  const port = i >= 0 && args[i + 1] ? Number(args[i + 1]) : 3030;

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "POST" && url.startsWith("/f/")) {
      const group = decodeURIComponent(url.slice(3).split("?")[0]);
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const ct = req.headers["content-type"] ?? "";
        let data: Record<string, string> = {};
        try {
          data = ct.includes("application/json")
            ? JSON.parse(body || "{}")
            : Object.fromEntries(new URLSearchParams(body));
        } catch {
          /* ignore */
        }
        const ts = new Date().toTimeString().slice(0, 8);
        console.log(`\n[${ts}] ✉  POST /f/${group}`);
        for (const [k, v] of Object.entries(data)) {
          if (k === "_gotcha") continue;
          console.log(`    ${k}: ${v}`);
        }
        if (data._gotcha) console.log(`    ⚠ honeypot filled — would be rejected`);

        if ((req.headers.accept ?? "").includes("application/json")) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, status: "caught" }));
        } else {
          res.writeHead(303, { location: "/?ok=1" });
          res.end();
        }
      });
      return;
    }
    if (req.method === "GET" && (url === "/" || url.startsWith("/?"))) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<!doctype html><meta charset=utf-8><title>co dev</title>` +
          `<body style="font-family:system-ui;max-width:420px;margin:64px auto">` +
          `<h3>co dev — local catcher</h3>` +
          (url.includes("ok=1")
            ? `<p style="color:#127c2b">caught ✓ — check your terminal</p>`
            : "") +
          `<form method="POST" action="/f/newsletter">` +
          `<input type="email" name="email" placeholder="you@example.com" required>` +
          `<button>Subscribe</button></form></body>`,
      );
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, () => {
    console.log(`co dev — local form catcher`);
    console.log(`  POST → http://localhost:${port}/f/<group>`);
    console.log(`  test form → http://localhost:${port}/`);
    console.log(`  submissions print here; no real emails sent. ctrl-c to stop.`);
  });
}

function authHeaders(extra: Record<string, string> = {}) {
  return { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
}

async function apiGet(path: string) {
  const res = await fetch(`${base}${path}`, { headers: authHeaders() });
  return res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
}

async function apiDelete(path: string) {
  const res = await fetch(`${base}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
}

// co sync — reconcile codeoutbox.json (declared lists) with the account.
async function sync(args: string[]) {
  const file = args.find((a) => !a.startsWith("-")) ?? "codeoutbox.json";
  const dryRun = args.includes("--dry-run");

  let parsed: any;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    console.error(`error: cannot read/parse ${file}: ${(e as Error).message}`);
    process.exit(1);
  }
  const declared = parsed.groups ?? {};
  if (typeof declared !== "object" || Array.isArray(declared)) {
    console.error("error: `groups` must be an object of { slug: {...} }");
    process.exit(1);
  }

  const cur: any = await apiGet("/v1/groups");
  if (!cur.ok) {
    console.error(`error: ${cur.error}`);
    process.exit(1);
  }
  const have = new Map<string, any>(cur.groups.map((g: any) => [g.slug, g]));

  const apply: Array<{ slug: string; body: any }> = [];
  for (const [slug, raw] of Object.entries<any>(declared)) {
    const want = {
      name: raw?.name ?? null,
      doubleOptIn: raw?.doubleOptIn !== false,
      redirect: raw?.redirect ?? null,
    };
    const g = have.get(slug);
    if (!g) {
      console.log(`  + create ${slug}`);
      apply.push({ slug, body: { slug, ...want } });
    } else {
      const diffs: string[] = [];
      if (want.name != null && want.name !== g.name)
        diffs.push(`name: ${g.name}→${want.name}`);
      if (want.doubleOptIn !== g.double_opt_in)
        diffs.push(`doubleOptIn: ${g.double_opt_in}→${want.doubleOptIn}`);
      if (want.redirect != null && want.redirect !== g.redirect)
        diffs.push(`redirect: ${g.redirect}→${want.redirect}`);
      if (diffs.length) {
        console.log(`  ~ update ${slug} (${diffs.join(", ")})`);
        apply.push({ slug, body: { slug, ...want } });
      } else {
        console.log(`  = ${slug} (no change)`);
      }
    }
  }
  for (const slug of have.keys()) {
    if (!(slug in declared))
      console.log(`  ? ${slug} (owned but not in ${file}; left as-is)`);
  }

  if (dryRun) {
    console.log(`\n(dry-run — ${apply.length} change(s) not applied)`);
    return;
  }
  if (!apply.length) {
    console.log("\nup to date.");
    return;
  }
  for (const a of apply) {
    const r: any = await apiPost("/v1/groups", a.body);
    if (!r.ok) console.error(`  ! ${a.slug}: ${r.error}`);
    else if (r.form_url) console.log(`    ${a.slug} → ${r.form_url}`);
  }
  console.log(`\napplied ${apply.length} change(s).`);
}

async function tokenCreate(args: string[]) {
  const nameIdx = args.indexOf("--name");
  const name = nameIdx >= 0 ? args[nameIdx + 1] : "cli token";
  const json: any = await apiPost("/v1/tokens", { name });
  if (!json.ok) {
    console.error(`error: ${json.error}`);
    process.exit(1);
  }
  console.log(`✅ created token "${json.name}" (#${json.id})`);
  console.log(`\n  ${json.token}\n`);
  console.log("Store it now — it won't be shown again. Use it as CO_TOKEN.");
}

// co domains add|verify|list — agent-automated domain auth.
async function domains(sub: string | undefined, rest: string[]) {
  if (sub === "add") {
    const subdomain = rest[0];
    if (!subdomain) usage();
    const r: any = await apiPost("/v1/domains", { subdomain });
    if (!r.ok) {
      console.error(`error: ${r.error}`);
      process.exit(1);
    }
    console.log(`✅ added ${subdomain} (#${r.id}) — publish these DNS records:\n`);
    for (const rec of r.records) {
      console.log(`  [${rec.purpose}] ${rec.type}  ${rec.host}`);
      console.log(`        ${rec.value}\n`);
    }
    console.log(`Then run: co domains verify ${subdomain}`);
    return;
  }
  if (sub === "verify") {
    const subdomain = rest[0];
    if (!subdomain) usage();
    const list: any = await apiGet("/v1/domains");
    const d = list.ok && list.domains.find((x: any) => x.subdomain === subdomain);
    if (!d) {
      console.error(`error: domain ${subdomain} not found (add it first)`);
      process.exit(1);
    }
    const r: any = await apiPost(`/v1/domains/${d.id}/verify`, {});
    if (!r.ok) {
      console.error(`error: ${r.error}`);
      process.exit(1);
    }
    if (r.status === "verified") {
      console.log(`✅ ${subdomain} verified — broadcasts unlocked.`);
    } else {
      console.log(`⏳ ${subdomain} not verified yet:`);
      for (const c of r.checks) {
        console.log(`  ${c.ok ? "✓" : "✗"} ${c.purpose}  ${c.host}`);
      }
    }
    return;
  }
  // list (default)
  const r: any = await apiGet("/v1/domains");
  if (!r.ok) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  if (!r.domains.length) {
    console.log("no domains yet. Add one: co domains add <subdomain>");
    return;
  }
  for (const d of r.domains) {
    console.log(`  ${d.subdomain}  [${d.status}]`);
  }
}

// co brand show|set — per-tenant email branding (header name/logo, accent, footer).
function printBrand(b: any) {
  console.log(`  name:   ${b.name}`);
  console.log(`  domain: ${b.domain}`);
  console.log(`  color:  ${b.color}`);
  console.log(`  logo:   ${b.logoUrl || "(none — name shown instead)"}`);
  console.log(`  powered-by footer: ${b.poweredBy ? "yes (free plan)" : "no"}`);
}

async function brand(sub: string | undefined, rest: string[]) {
  if (sub === "set") {
    const flag = (f: string) => {
      const i = rest.indexOf(f);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    const body: Record<string, string> = {};
    const name = flag("--name");
    const color = flag("--color");
    const logo = flag("--logo");
    if (name !== undefined) body.brand_name = name;
    if (color !== undefined) body.brand_color = color;
    if (logo !== undefined) body.brand_logo_url = logo;
    if (!Object.keys(body).length) {
      console.error("nothing to set — use --name, --color and/or --logo");
      process.exit(1);
    }
    const r: any = await apiPatch("/v1/account", body);
    if (!r.ok) {
      console.error(`error: ${r.error}`);
      process.exit(1);
    }
    console.log("✅ brand updated:");
    printBrand(r.brand);
    return;
  }
  // show (default)
  const r: any = await apiGet("/v1/account");
  if (!r.ok) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  printBrand(r.brand);
}

// co warmup — show where the sending IP is in its warmup ramp.
async function warmup() {
  const r: any = await apiGet("/v1/warmup");
  if (!r.ok) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  const w = r.warmup;
  if (w.graduated) {
    console.log("✅ warmup complete — no daily cap.");
    return;
  }
  if (!w.active) {
    console.log("warmup disabled (WARMUP_ENABLED=false).");
    return;
  }
  console.log(`🔥 warmup — day ${w.day}`);
  console.log(`  today's cap: ${w.cap}`);
  console.log(`  used today:  ${w.usedToday}`);
  console.log(`  remaining:   ${w.remaining}`);
}

// co upgrade <plan> [--annual] — open a Stripe Checkout to upgrade.
async function upgrade(plan: string | undefined, rest: string[]) {
  if (!plan) usage();
  const interval = rest.includes("--annual") ? "year" : "month";
  const r: any = await apiPost("/v1/billing/checkout", { plan, interval });
  if (!r.ok) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  console.log(
    `Open this link to upgrade to "${plan}" (${interval === "year" ? "annual, 2 months free" : "monthly"}):\n\n  ${r.url}\n`,
  );
}

// co webhooks add|list|rm — tenant event webhooks.
async function webhooks(sub: string | undefined, rest: string[]) {
  if (sub === "add") {
    const url = rest.find((a) => !a.startsWith("-"));
    if (!url) {
      console.error("usage: co webhooks add <https-url> [--events <a,b>]");
      process.exit(1);
    }
    const ei = rest.indexOf("--events");
    const events =
      ei >= 0 && rest[ei + 1] ? rest[ei + 1].split(",") : undefined;
    const r: any = await apiPost("/v1/webhooks", { url, events });
    if (!r.ok) {
      console.error(`error: ${r.error}`);
      process.exit(1);
    }
    console.log(`✅ webhook #${r.id} → ${r.url}  [${r.events}]`);
    console.log(`\n  secret: ${r.secret}\n`);
    console.log("Store the secret — verify the X-CO-Signature header with it.");
    return;
  }
  if (sub === "rm" || sub === "delete") {
    const id = rest[0];
    if (!id) {
      console.error("usage: co webhooks rm <id>");
      process.exit(1);
    }
    const r: any = await apiDelete(`/v1/webhooks/${id}`);
    if (!r.ok) {
      console.error(`error: ${r.error}`);
      process.exit(1);
    }
    console.log(`✅ removed webhook #${id}`);
    return;
  }
  // list (default)
  const r: any = await apiGet("/v1/webhooks");
  if (!r.ok) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  if (!r.webhooks.length) {
    console.log("no webhooks yet. Add one: co webhooks add <https-url>");
    console.log(`\nevents: ${r.available_events.join(", ")} (default: all)`);
    return;
  }
  for (const w of r.webhooks) {
    console.log(`  #${w.id}  ${w.url}  [${w.events}]${w.active ? "" : " (inactive)"}`);
  }
}

// co billing — open the Stripe Customer Portal (manage/cancel).
async function billing() {
  const r: any = await apiPost("/v1/billing/portal", {});
  if (!r.ok) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  console.log(`Manage your subscription:\n\n  ${r.url}\n`);
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);

  if (cmd === "token") {
    if (sub !== "create") usage();
    return tokenCreate(rest);
  }

  if (cmd === "sync") {
    return sync([sub, ...rest].filter((a): a is string => a != null));
  }

  if (cmd === "dev") {
    return devCatcher([sub, ...rest].filter((a): a is string => a != null));
  }

  if (cmd === "domains") {
    return domains(sub, rest.filter((a): a is string => a != null));
  }

  if (cmd === "brand") {
    return brand(sub, rest.filter((a): a is string => a != null));
  }

  if (cmd === "warmup") {
    return warmup();
  }

  if (cmd === "upgrade") {
    return upgrade(sub, rest.filter((a): a is string => a != null));
  }

  if (cmd === "billing") {
    return billing();
  }

  if (cmd === "webhooks") {
    return webhooks(sub, rest.filter((a): a is string => a != null));
  }

  if (cmd !== "send") usage();

  const args = [sub, ...rest].filter((a): a is string => a != null);
  const file = args.find((a) => !a.startsWith("-"));
  const live = args.includes("--live");
  if (!file) usage();

  const source = await readFile(file, "utf8");
  const url = live ? `${base}/v1/broadcasts` : `${base}/v1/broadcasts/preview`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(live ? { source, confirm: true } : { source }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!json.ok) {
    console.error(`error: ${json.error ?? res.status}`);
    process.exit(1);
  }

  if (live && json.scheduledFor) {
    console.log(
      `🗓️  scheduled broadcast #${json.broadcastId} for ${json.scheduledFor} — ${json.recipientCount} recipient(s)`,
    );
  } else if (live && !json.alreadySent) {
    console.log(
      `✅ sent ${json.sent} (failed ${json.failed}) — broadcast #${json.broadcastId}`,
    );
  } else if (live && json.alreadySent) {
    console.log(
      `↩️  already sent — broadcast #${json.broadcastId} (idempotent, no double-send)`,
    );
  } else {
    console.log(
      `DRY RUN — "${json.subject}" → ${json.recipientCount} recipient(s) in "${json.group}"`,
    );
    if (json.warnings?.length) {
      console.log("⚠️  warnings:\n - " + json.warnings.join("\n - "));
    }
    console.log("\n(run again with --live to send)");
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
