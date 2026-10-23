#!/usr/bin/env node
// `npx codeoutbox` — detects your stack and drops a polished, accessible email-capture
// form component into your project (and an optional codeoutbox.json). Dependency-free
// so it runs anywhere via npx.
//
//   codeoutbox [add]  [--id <public_id>] [--group <slug>] [--framework <f>] [--out <path>]
//   codeoutbox form   [--id <public_id>] [--framework <f>]     # print to stdout instead
//   codeoutbox init   [--group <slug>]
//   codeoutbox help

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const argv = process.argv.slice(2);
const cmd = argv.includes("--help") || argv.includes("-h") ? "help" : argv[0] && !argv[0].startsWith("-") ? argv[0] : "add";

function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const has = (name) => argv.includes(`--${name}`);

const group = flag("group", "newsletter");
const base = flag("base", process.env.CO_URL || "https://app.codeoutbox.com").replace(/\/$/, "");
const PLACEHOLDER = "YOUR_FORM_ID";
const FRAMEWORKS = ["html", "react", "vue", "svelte", "astro"];

// Color only on a real terminal (and never with NO_COLOR).
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint("32");
const amber = paint("33");
const bold = paint("1");
const dim = paint("2");

const exists = (p) => access(p).then(() => true, () => false);

// ---- stack detection ----------------------------------------------------

async function detect() {
  let pkg = {};
  try {
    pkg = JSON.parse(await readFile("package.json", "utf8"));
  } catch {
    /* not a node project → plain html */
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const framework = deps.astro
    ? "astro"
    : deps.svelte || deps["@sveltejs/kit"]
      ? "svelte"
      : deps.vue || deps.nuxt
        ? "vue"
        : deps.react || deps.next
          ? "react"
          : "html";

  let tailwind = !!deps.tailwindcss || !!deps["@tailwindcss/vite"];
  for (const f of ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs"]) {
    if (!tailwind && (await exists(f))) tailwind = true;
  }
  if (has("no-tailwind")) tailwind = false;
  if (has("tailwind")) tailwind = true;

  const ts = (await exists("tsconfig.json")) || !!deps.typescript;

  const dirs =
    framework === "svelte"
      ? ["src/lib/components", "src/components", "src/lib"]
      : ["src/components", "components", "app/components", "src"];
  let dir = ".";
  for (const d of dirs) {
    if (await exists(d)) {
      dir = d;
      break;
    }
  }
  const label = deps.next
    ? "Next.js"
    : deps.nuxt
      ? "Nuxt"
      : deps["@sveltejs/kit"]
        ? "SvelteKit"
        : { astro: "Astro", svelte: "Svelte", vue: "Vue", react: "React", html: "plain HTML" }[framework];
  return { framework, tailwind, ts, next: !!deps.next, dir, label };
}

// ---- shared styling -----------------------------------------------------

// Tailwind classes, and the equivalent plain-CSS class names + stylesheet. The
// message colour switches on data-state="error" in both, so templates stay identical.
const TW = {
  form: "flex max-w-md flex-wrap gap-2",
  input:
    "min-w-0 flex-1 basis-52 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
  button:
    "rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-progress disabled:opacity-50 dark:bg-white dark:text-neutral-900",
  msg: "min-h-5 basis-full text-sm text-green-700 data-[state=error]:text-red-600 dark:text-green-400 dark:data-[state=error]:text-red-400",
  sr: "sr-only",
};

const PLAIN = { form: "co-form", input: "co-input", button: "co-button", msg: "co-msg", sr: "co-sr" };

function css(prefix = ".co-") {
  const c = (k) => `${prefix}${k}`;
  return `${c("form")} { display: flex; flex-wrap: wrap; gap: 8px; max-width: 420px;
  font: 15px/1.4 system-ui, sans-serif; }
${c("input")} { flex: 1 1 200px; min-width: 0; padding: 10px 12px; border: 1px solid #d4d4d4;
  border-radius: 8px; background: #fff; color: #111; font: inherit; }
${c("input")}:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; border-color: #4f46e5; }
${c("button")} { padding: 10px 18px; border: 0; border-radius: 8px; background: #111; color: #fff;
  font: inherit; font-weight: 500; cursor: pointer; transition: opacity .15s; }
${c("button")}:hover { opacity: .9; }
${c("button")}:disabled { opacity: .5; cursor: progress; }
${c("msg")} { flex-basis: 100%; margin: 4px 0 0; font-size: 13px; min-height: 1.2em; color: #127c2b; }
${c("msg")}[data-state="error"] { color: #b00020; }
${c("sr")} { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-color-scheme: dark) {
  ${c("input")} { background: #1a1a1a; color: #f3f3f3; border-color: #333; }
  ${c("button")} { background: #f3f3f3; color: #111; }
  ${c("msg")} { color: #4ade80; }
  ${c("msg")}[data-state="error"] { color: #f87171; }
}`;
}

const OK_CONFIRMED = "You're subscribed 🎉";
const OK_PENDING = "Check your inbox to confirm ✉️";

// The submit logic every template shares: POST FormData, read { ok, status, error }.
const submitJs = (action, indent = "") =>
  `const res = await fetch('${action}', {
  method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form),
});
const data = await res.json().catch(() => ({}));`
    .split("\n")
    .map((l) => indent + l)
    .join("\n");

// ---- generators -----------------------------------------------------------

function htmlForm(action, cls = PLAIN, withStyle = true) {
  return `<!-- CodeOutbox email capture — works with no JS (native POST); JS enhances it
     with inline success/error. Paste anywhere. -->
<form class="${cls.form} co-enhance" action="${action}" method="POST">
  <label class="${cls.sr}" for="co-email">Email</label>
  <input id="co-email" class="${cls.input}" type="email" name="email" required
         placeholder="you@example.com" autocomplete="email" />
  <!-- honeypot: bots fill this, humans never see it -->
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="${cls.sr}" />
  <button class="${cls.button}" type="submit">Subscribe</button>
  <p class="${cls.msg}" role="status" aria-live="polite"></p>
</form>
${withStyle ? `\n<style>\n${css()}\n</style>\n` : ""}
<script>
  document.querySelectorAll('form.co-enhance').forEach((form) => {
    const msg = form.querySelector('[role=status]');
    const btn = form.querySelector('button');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.removeAttribute('data-state'); msg.textContent = '';
      btn.disabled = true;
      try {
${submitJs(action, "        ")}
        if (res.ok && data.ok) {
          form.reset();
          msg.textContent = data.status === 'confirmed' ? "${OK_CONFIRMED}" : '${OK_PENDING}';
        } else {
          msg.dataset.state = 'error';
          msg.textContent = data.error || 'Something went wrong. Try again.';
        }
      } catch {
        msg.dataset.state = 'error'; msg.textContent = 'Network error. Try again.';
      } finally { btn.disabled = false; }
    });
  });
</script>`;
}

function reactForm(action, { tailwind, ts, next }) {
  // Tailwind → class strings; otherwise a sibling CSS module (works in Next + Vite).
  const cn = (k) => (tailwind ? `className="${TW[k]}"` : `className={s.${k}}`);
  const T = (t) => (ts ? t : "");
  return `${next ? "'use client';\n\n" : ""}// CodeOutbox email capture — accessible, dark-mode aware, no backend needed.
import { useState } from 'react';
${tailwind ? "" : "import s from './CodeOutboxForm.module.css';\n"}
${ts ? "type Status = 'idle' | 'loading' | 'done' | 'error';\n\n" : ""}export function CodeOutboxForm() {
  const [status, setStatus] = useState${T("<Status>")}('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e${T(": React.FormEvent<HTMLFormElement>")}) {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus('loading');
    setMessage('');
    try {
${submitJs(action, "      ")}
      if (res.ok && data.ok) {
        form.reset();
        setStatus('done');
        setMessage(data.status === 'confirmed' ? "${OK_CONFIRMED}" : '${OK_PENDING}');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Try again.');
    }
  }

  return (
    <form onSubmit={onSubmit} ${cn("form")}>
      <label htmlFor="co-email" ${cn("sr")}>Email</label>
      <input id="co-email" type="email" name="email" required
        placeholder="you@example.com" autoComplete="email" ${cn("input")} />
      {/* honeypot: bots fill this, humans never see it */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden ${cn("sr")} />
      <button type="submit" disabled={status === 'loading'} ${cn("button")}>
        {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
      </button>
      <p role="status" aria-live="polite" data-state={status} ${cn("msg")}>{message}</p>
    </form>
  );
}
`;
}

function vueForm(action, { tailwind, ts }) {
  const cls = tailwind ? TW : PLAIN;
  return `<!-- CodeOutboxForm.vue — CodeOutbox email capture, no backend needed. -->
<script setup${ts ? ' lang="ts"' : ""}>
import { ref } from 'vue';

const status = ref${ts ? "<'idle' | 'loading' | 'done' | 'error'>" : ""}('idle');
const message = ref('');

async function onSubmit(e${ts ? ": Event" : ""}) {
  const form = e.currentTarget${ts ? " as HTMLFormElement" : ""};
  status.value = 'loading';
  message.value = '';
  try {
${submitJs(action, "    ")}
    if (res.ok && data.ok) {
      form.reset();
      status.value = 'done';
      message.value = data.status === 'confirmed' ? "${OK_CONFIRMED}" : '${OK_PENDING}';
    } else {
      status.value = 'error';
      message.value = data.error || 'Something went wrong. Try again.';
    }
  } catch {
    status.value = 'error';
    message.value = 'Network error. Try again.';
  }
}
</script>

<template>
  <form class="${cls.form}" @submit.prevent="onSubmit">
    <label for="co-email" class="${cls.sr}">Email</label>
    <input id="co-email" class="${cls.input}" type="email" name="email" required
      placeholder="you@example.com" autocomplete="email" />
    <!-- honeypot: bots fill this, humans never see it -->
    <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="${cls.sr}" />
    <button class="${cls.button}" type="submit" :disabled="status === 'loading'">
      {{ status === 'loading' ? 'Subscribing…' : 'Subscribe' }}
    </button>
    <p class="${cls.msg}" role="status" aria-live="polite" :data-state="status">{{ message }}</p>
  </form>
</template>
${tailwind ? "" : `\n<style scoped>\n${css()}\n</style>\n`}`;
}

function svelteForm(action, { tailwind, ts }) {
  const cls = tailwind ? TW : PLAIN;
  return `<!-- CodeOutboxForm.svelte — CodeOutbox email capture, no backend needed. -->
<script${ts ? ' lang="ts"' : ""}>
  let status${ts ? ": 'idle' | 'loading' | 'done' | 'error'" : ""} = 'idle';
  let message = '';

  async function onSubmit(e${ts ? ": SubmitEvent" : ""}) {
    const form = e.currentTarget${ts ? " as HTMLFormElement" : ""};
    status = 'loading';
    message = '';
    try {
${submitJs(action, "      ")}
      if (res.ok && data.ok) {
        form.reset();
        status = 'done';
        message = data.status === 'confirmed' ? "${OK_CONFIRMED}" : '${OK_PENDING}';
      } else {
        status = 'error';
        message = data.error || 'Something went wrong. Try again.';
      }
    } catch {
      status = 'error';
      message = 'Network error. Try again.';
    }
  }
</script>

<form class="${cls.form}" on:submit|preventDefault={onSubmit}>
  <label for="co-email" class="${cls.sr}">Email</label>
  <input id="co-email" class="${cls.input}" type="email" name="email" required
    placeholder="you@example.com" autocomplete="email" />
  <!-- honeypot: bots fill this, humans never see it -->
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="${cls.sr}" />
  <button class="${cls.button}" type="submit" disabled={status === 'loading'}>
    {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
  </button>
  <p class="${cls.msg}" role="status" aria-live="polite" data-state={status}>{message}</p>
</form>
${tailwind ? "" : `\n<style>\n${css()}\n</style>\n`}`;
}

function astroForm(action, { tailwind }) {
  // Astro scopes <style> and bundles <script>, so the plain-HTML form drops straight in.
  return `---
// CodeOutboxForm.astro — CodeOutbox email capture, no backend needed.
---
${htmlForm(action, tailwind ? TW : PLAIN, !tailwind)}
`;
}

function render(framework, action, stack) {
  if (framework === "react") return reactForm(action, stack);
  if (framework === "vue") return vueForm(action, stack);
  if (framework === "svelte") return svelteForm(action, stack);
  if (framework === "astro") return astroForm(action, stack);
  return htmlForm(action);
}

function fileName(framework, ts) {
  return {
    react: `CodeOutboxForm.${ts ? "tsx" : "jsx"}`,
    vue: "CodeOutboxForm.vue",
    svelte: "CodeOutboxForm.svelte",
    astro: "CodeOutboxForm.astro",
    html: "codeoutbox-form.html",
  }[framework];
}

// ---- form id --------------------------------------------------------------

// --id wins; with CO_TOKEN (agents usually have one) we create/fetch the list via
// the API; with neither we create a provisional list — no account needed, claim it
// later. Offline (or --offline) → a loud placeholder + instructions.
async function resolveFormId() {
  const id = flag("id");
  if (id) return { id, how: "given" };
  const token = process.env.CO_TOKEN;
  if (!token) {
    if (has("offline")) return { id: PLACEHOLDER, how: "placeholder" };
    try {
      const res = await fetch(`${base}/v1/provisional`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: group, email: flag("email") }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return { id: json.public_id, how: "provisional", list: json };
    } catch (err) {
      console.error(`(couldn't create a list: ${err.message} — writing a placeholder)`);
      return { id: PLACEHOLDER, how: "placeholder" };
    }
  }
  const res = await fetch(`${base}/v1/groups`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ slug: group }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`couldn't create list "${group}": ${json.error ?? res.status}`);
  return { id: json.public_id, how: "api" };
}

// ---- commands ------------------------------------------------------------

async function pickFramework() {
  const stack = await detect();
  const forced = flag("framework");
  if (forced && !FRAMEWORKS.includes(forced)) {
    throw new Error(`--framework must be one of: ${FRAMEWORKS.join(", ")}`);
  }
  return { ...stack, framework: forced ?? stack.framework };
}

async function doAdd() {
  const stack = await pickFramework();
  const { id, how, list } = await resolveFormId();
  const action = `${base}/f/${id}`;
  const out = flag("out", join(stack.dir, fileName(stack.framework, stack.ts)));

  if ((await exists(out)) && !has("force")) {
    throw new Error(`${out} already exists — pass --force to overwrite`);
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, render(stack.framework, action, stack));
  const written = [out];
  if (stack.framework === "react" && !stack.tailwind) {
    const mod = join(dirname(out), "CodeOutboxForm.module.css");
    await writeFile(mod, css(".") + "\n");
    written.push(mod);
  }

  const found = stack.label + (stack.tailwind ? " + Tailwind" : "");
  const ok = green("✔");
  console.log(`${ok} Found ${bold(found)}`);
  console.log(`${ok} Added ${bold(written.join(" + "))}`);
  if (how === "provisional") console.log(`${ok} Your list ${bold(group)} is live ${dim("(no account needed)")}`);
  else if (how === "api") console.log(`${ok} Your list ${bold(group)} is ready`);

  const rel = "./" + relative(".", out).replace(/\.(tsx|jsx)$/, "");
  const usage = {
    react: [`import { CodeOutboxForm } from '${rel}'`, `<CodeOutboxForm />`],
    vue: [`import CodeOutboxForm from '${rel}'`, `<CodeOutboxForm />`],
    svelte: [`import CodeOutboxForm from '${rel}'`, `<CodeOutboxForm />`],
    astro: [`import CodeOutboxForm from '${rel}'`, `<CodeOutboxForm />`],
    html: [`Paste the contents of ${out} into any page.`],
  }[stack.framework];
  console.log(`\n  ${dim("Add it to any page:")}\n${usage.map((l) => `    ${l}`).join("\n")}\n`);

  if (how === "placeholder") {
    console.log(
      `${amber("!")} The form posts to ${bold(PLACEHOLDER)} until you give it a real id:\n` +
        `    1. sign up (free, no card): ${base}/signup\n` +
        `    2. re-run with your id:     npx codeoutbox --id <public_id> --force\n` +
        `       (or set CO_TOKEN and re-run, and the list is created for you)`,
    );
    return;
  }

  const page = list?.page_url ?? `${base}/l/${id}`;
  const row = (label, value, note) =>
    `  ${amber(label.padEnd(11))}  ${value}` + (note ? `\n  ${" ".repeat(11)}  ${dim(note)}` : "");
  console.log(row("Try it now", page, "your hosted signup page. Subscribe yourself."));
  if (how === "provisional") {
    const until = new Date(list.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    console.log("\n" + row("Keep it", list.claim_url, `free, no card. Claim by ${until} (unclaimed lists hold up to 25 subscribers).`));
    console.log(
      "\n  " +
        (flag("email")
          ? dim(`We'll email ${flag("email")} when someone subscribes.`)
          : dim("Tip: add --email you@example.com and we'll send the claim link when someone subscribes.")),
    );
  } else {
    console.log("\n  " + dim("Test forms locally without sending email: co dev"));
  }
}

async function doForm() {
  const stack = await pickFramework();
  const { id } = await resolveFormId();
  console.log(render(stack.framework, `${base}/f/${id}`, stack));
}

async function doInit() {
  const path = "codeoutbox.json";
  let config = { groups: {} };
  try {
    config = JSON.parse(await readFile(path, "utf8"));
    if (!config.groups) config.groups = {};
  } catch {
    /* new file */
  }
  if (!config.groups[group]) config.groups[group] = { doubleOptIn: true };
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  console.log(`✅ wrote ${path} with group "${group}"`);
  console.log(`\nNext: npx codeoutbox   (adds the form component), then co sync`);
}

function help() {
  console.log(
    `codeoutbox — email capture your agent sets up in one prompt\n\n` +
      `  codeoutbox [add]  detect your stack and write a form component into the project\n` +
      `  codeoutbox form   print the form to stdout instead\n` +
      `  codeoutbox init   write/extend codeoutbox.json\n\n` +
      `Options:\n` +
      `  --id <public_id>      your form id (from the dashboard or \`co groups\`)\n` +
      `  --group <slug>        list name to create (default: newsletter)\n` +
      `  --email <you@…>       get a claim link when your first subscriber confirms\n` +
      `  --offline             don't create a list; write a placeholder id\n` +
      `  --framework <f>       ${FRAMEWORKS.join(" | ")} (default: detected)\n` +
      `  --tailwind | --no-tailwind   override Tailwind detection\n` +
      `  --out <path>          where to write the component\n` +
      `  --force               overwrite an existing file\n\n` +
      `Examples:\n` +
      `  npx codeoutbox                       # no account: creates a list you claim later\n` +
      `  npx codeoutbox --email me@site.dev\n` +
      `  npx codeoutbox --id 8kJ2mQ\n` +
      `  CO_TOKEN=… npx codeoutbox --group launch\n` +
      `  npx codeoutbox form --framework vue --id 8kJ2mQ`,
  );
}

try {
  if (cmd === "add") await doAdd();
  else if (cmd === "form") await doForm();
  else if (cmd === "init") await doInit();
  else help();
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
