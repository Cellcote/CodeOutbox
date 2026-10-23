// CodeOutbox GitHub Action — dependency-free (runs on the runner's Node).
//
//   pull_request → render every changed campaign, post one sticky PR comment with
//                  subject, list, recipient count, lint warnings and a preview link.
//                  Broken campaigns (bad frontmatter, unknown list) fail the check.
//   push         → send every changed campaign. Sends are idempotent per content
//                  (re-runs never double-send) and `draft: true` files are skipped.

import { readFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const env = process.env;
const coUrl = (env.CO_URL || "https://app.codeoutbox.com").replace(/\/$/, "");
const coToken = env.CO_TOKEN || "";
const ghToken = env.GH_TOKEN || "";
const repo = env.GITHUB_REPOSITORY || "";
const ghApi = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
const MARKER = "<!-- codeoutbox-preview -->";

// ---- helpers ---------------------------------------------------------------

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      // `**/` matches zero or more directories; a bare `**` matches anything.
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matcher(paths) {
  const res = paths
    .split(/[,\n]/)
    .map((p) => p.trim().replace(/^\.\//, ""))
    .filter(Boolean)
    .map(globToRegExp);
  return (file) => res.some((r) => r.test(file));
}

export function isDraft(source) {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(source);
  return !!fm && /^draft:\s*["']?(true|yes)["']?\s*$/im.test(fm[1]);
}

async function gh(path, init = {}) {
  const res = await fetch(`${ghApi}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${ghToken}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${init.method || "GET"} ${path} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function ghPaged(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const batch = await gh(`${path}${sep}per_page=100&page=${page}`);
    const items = Array.isArray(batch) ? batch : [];
    out.push(...items);
    if (items.length < 100) return out;
  }
}

async function co(path, body) {
  const res = await fetch(`${coUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${coToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function changedFiles(event, eventName) {
  let files;
  if (eventName.startsWith("pull_request")) {
    files = await ghPaged(`/repos/${repo}/pulls/${event.pull_request.number}/files`);
  } else if (eventName === "push") {
    const zero = /^0+$/.test(event.before || "");
    files = zero
      ? (await gh(`/repos/${repo}/commits/${event.after}`)).files ?? []
      : // compare paginates commits, not files; one call lists up to 300 files
        (await gh(`/repos/${repo}/compare/${event.before}...${event.after}`)).files ?? [];
  } else {
    throw new Error(`unsupported event "${eventName}" — use pull_request or push`);
  }
  return files.filter((f) => f.status !== "removed").map((f) => f.filename);
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

function commentBody(results) {
  const lines = [MARKER, "### ✉️ CodeOutbox preview", ""];
  if (!results.length) {
    lines.push("No campaign files changed in this PR anymore.");
    return lines.join("\n");
  }
  lines.push("| Campaign | Subject | List | On merge | Preview |", "|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      lines.push(`| \`${r.file}\` | ❌ ${esc(r.error)} | | | |`);
      continue;
    }
    const onMerge = r.draft
      ? "📝 draft — won't send"
      : `sends to **${r.recipientCount}** subscriber${r.recipientCount === 1 ? "" : "s"}`;
    const link = r.previewUrl ? `[view email](${r.previewUrl})` : "";
    lines.push(`| \`${r.file}\` | ${esc(r.subject)} | \`${r.group}\` | ${onMerge} | ${link} |`);
  }
  const warned = results.filter((r) => r.warnings?.length);
  if (warned.length) {
    lines.push("", "**Warnings**");
    for (const r of warned) for (const w of r.warnings) lines.push(`- \`${r.file}\`: ${w}`);
  }
  lines.push("", "<sub>Sends are idempotent — re-running never double-sends. Mark a file `draft: true` to merge it without sending.</sub>");
  return lines.join("\n");
}

async function upsertComment(prNumber, body) {
  const comments = await ghPaged(`/repos/${repo}/issues/${prNumber}/comments`);
  const mine = comments.find((c) => c.body?.includes(MARKER));
  if (mine) {
    await gh(`/repos/${repo}/issues/comments/${mine.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  } else {
    await gh(`/repos/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}

async function setOutput(name, value) {
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function summary(md) {
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, md + "\n");
}

// ---- main ------------------------------------------------------------------

async function main() {
  const eventName = env.GITHUB_EVENT_NAME || "";
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const mode =
    env.CO_MODE && env.CO_MODE !== "auto"
      ? env.CO_MODE
      : eventName.startsWith("pull_request")
        ? "preview"
        : "send";

  if (!coToken) {
    // Typical for PRs from forks: secrets aren't exposed. Don't fail the PR for it.
    console.log("::warning::CodeOutbox api-token is empty (fork PR?) — skipping.");
    return;
  }

  const isCampaign = matcher(env.CO_PATHS || "campaigns/**/*.md");
  const files = (await changedFiles(event, eventName)).filter(isCampaign);
  const prNumber = event.pull_request?.number;

  const results = [];
  for (const file of files) {
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      results.push({ file, error: "file not found in the workspace — add actions/checkout before this step" });
      continue;
    }
    try {
      if (mode === "preview") {
        const p = await co("/v1/broadcasts/preview", { source, share: true });
        results.push({ file, ...pick(p, "subject", "group", "recipientCount", "warnings", "draft", "previewUrl") });
      } else if (isDraft(source)) {
        console.log(`📝 ${file}: draft — skipped`);
        results.push({ file, skipped: "draft" });
      } else {
        const s = await co("/v1/broadcasts", { source, confirm: true });
        const what = s.alreadySent
          ? `already sent (broadcast #${s.broadcastId}) — no double-send`
          : s.scheduledFor
            ? `scheduled for ${s.scheduledFor} → ${s.recipientCount} recipient(s)`
            : `sent ${s.sent}, failed ${s.failed} (broadcast #${s.broadcastId})`;
        console.log(`✅ ${file}: ${what}`);
        results.push({ file, ...pick(s, "broadcastId", "alreadySent", "scheduledFor", "sent", "failed", "recipientCount") });
      }
    } catch (err) {
      console.log(`::error file=${file}::${err.message}`);
      results.push({ file, error: err.message });
    }
  }

  if (mode === "preview" && prNumber) {
    // Only touch the PR when there's something to say (or a stale comment to clear).
    if (results.length) await upsertComment(prNumber, commentBody(results));
    else {
      const comments = await ghPaged(`/repos/${repo}/issues/${prNumber}/comments`);
      if (comments.some((c) => c.body?.includes(MARKER))) await upsertComment(prNumber, commentBody([]));
    }
  }

  if (!files.length) console.log("No changed campaign files — nothing to do.");
  await summary(
    mode === "preview"
      ? commentBody(results)
      : ["### ✉️ CodeOutbox", ...results.map((r) => `- \`${r.file}\`: ${r.error ? `❌ ${r.error}` : r.skipped ? "📝 draft, skipped" : r.alreadySent ? "already sent" : r.scheduledFor ? `scheduled ${r.scheduledFor}` : `sent ${r.sent}`}`)].join("\n"),
  );
  await setOutput("campaigns", JSON.stringify(results));
  if (results.some((r) => r.error)) process.exitCode = 1;
}

function pick(o, ...keys) {
  return Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.log(`::error::${err.message}`);
    process.exit(1);
  });
}
