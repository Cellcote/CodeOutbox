// `co` — thin CLI over the control-plane API. Reads a campaign file and previews
// or sends it. Auth via CO_TOKEN (a session token); server URL via CO_URL.
//
//   co send <file>            # dry-run: preview + recipient count + lint
//   co send <file> --live     # actually send
//
// Env: CO_URL (default http://localhost:3000), CO_TOKEN (session token).

import { readFile } from "node:fs/promises";

const base = (process.env.CO_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.CO_TOKEN ?? "";

function usage(): never {
  console.error(
    "usage:\n" +
      "  co send <file> [--live]\n" +
      "  co token create [--name <name>]",
  );
  process.exit(1);
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
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

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);

  if (cmd === "token") {
    if (sub !== "create") usage();
    return tokenCreate(rest);
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

  if (live && !json.alreadySent) {
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
