#!/usr/bin/env node
// `npx codeoutbox` — scaffolds a polished, accessible email-capture form (and an
// optional codeoutbox.json). Dependency-free so it runs anywhere via npx.
//
//   codeoutbox form [--group <slug>] [--framework html|react|svelte] [--base <url>]
//   codeoutbox init [--group <slug>] [--base <url>]
//   codeoutbox help

import { writeFile, readFile } from "node:fs/promises";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "help";

function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

const group = flag("group", "newsletter");
const framework = flag("framework", "html");
const base = flag("base", "https://co.app").replace(/\/$/, "");
// The public form id (from `co groups` / the dashboard) is preferred; a slug works
// too while it's unambiguous. The endpoint is /f/<id>.
const formId = flag("id", group);
const action = `${base}/f/${formId}`;

// ---- generators ----------------------------------------------------------

function htmlForm() {
  return `<!-- CodeOutbox email capture — works with no JS (native POST); JS enhances
     it with inline success/error. Paste anywhere. -->
<form class="co-form" action="${action}" method="POST">
  <label class="co-visually-hidden" for="co-email">Email</label>
  <input id="co-email" type="email" name="email" required
         placeholder="you@example.com" autocomplete="email" />
  <!-- honeypot: bots fill this, humans never see it -->
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off"
         aria-hidden="true" class="co-visually-hidden" />
  <button type="submit">Subscribe</button>
  <p class="co-msg" role="status" aria-live="polite"></p>
</form>

<style>
  .co-form { display: flex; flex-wrap: wrap; gap: 8px; max-width: 420px;
    font: 15px/1.4 system-ui, sans-serif; }
  .co-form input[type=email] { flex: 1 1 200px; padding: 10px 12px;
    border: 1px solid #ccc; border-radius: 8px; background: #fff; color: #111; }
  .co-form input[type=email]:focus-visible { outline: 2px solid #4f46e5;
    outline-offset: 1px; border-color: #4f46e5; }
  .co-form button { padding: 10px 18px; border: 0; border-radius: 8px;
    background: #111; color: #fff; cursor: pointer; transition: opacity .15s; }
  .co-form button:hover { opacity: .9; }
  .co-form button[disabled] { opacity: .5; cursor: progress; }
  .co-msg { flex-basis: 100%; margin: 4px 0 0; font-size: 13px; min-height: 1em; }
  .co-msg[data-ok] { color: #127c2b; }
  .co-msg[data-err] { color: #b00020; }
  .co-visually-hidden { position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }
  @media (prefers-color-scheme: dark) {
    .co-form input[type=email] { background: #1a1a1a; color: #f3f3f3; border-color: #333; }
    .co-form button { background: #f3f3f3; color: #111; }
  }
</style>

<script>
  document.querySelectorAll('.co-form').forEach((form) => {
    const msg = form.querySelector('.co-msg');
    const btn = form.querySelector('button');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.removeAttribute('data-ok'); msg.removeAttribute('data-err'); msg.textContent = '';
      btn.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST', headers: { Accept: 'application/json' },
          body: new FormData(form),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          form.reset();
          msg.setAttribute('data-ok', '');
          msg.textContent = data.status === 'confirmed'
            ? "You're subscribed 🎉" : 'Check your inbox to confirm ✉️';
        } else {
          msg.setAttribute('data-err', '');
          msg.textContent = data.error || 'Something went wrong. Try again.';
        }
      } catch {
        msg.setAttribute('data-err', ''); msg.textContent = 'Network error. Try again.';
      } finally { btn.disabled = false; }
    });
  });
</script>`;
}

function reactForm() {
  return `// CodeOutboxForm.tsx — drop-in React component (Tailwind classes; swap for
// your own styles if you don't use Tailwind).
'use client';
import { useState } from 'react';

type Status = 'idle' | 'loading' | 'done' | 'error';

export function CodeOutboxForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    const form = e.currentTarget;
    try {
      const res = await fetch('${action}', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset();
        setStatus('done');
        setMessage(data.status === 'confirmed'
          ? "You're subscribed 🎉" : 'Check your inbox to confirm ✉️');
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
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2 max-w-md">
      <label htmlFor="co-email" className="sr-only">Email</label>
      <input id="co-email" type="email" name="email" required
        placeholder="you@example.com" autoComplete="email"
        className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2
                   focus-visible:outline-2 focus-visible:outline-indigo-600
                   dark:bg-neutral-900 dark:border-neutral-700" />
      {/* honeypot */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off"
        aria-hidden className="hidden" />
      <button type="submit" disabled={status === 'loading'}
        className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50
                   dark:bg-white dark:text-black">
        {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
      </button>
      {message && (
        <p role="status" aria-live="polite"
          className={\`basis-full text-sm \${status === 'error' ? 'text-red-600' : 'text-green-700'}\`}>
          {message}
        </p>
      )}
    </form>
  );
}`;
}

function svelteForm() {
  return `<!-- CodeOutboxForm.svelte — drop-in Svelte component (Tailwind classes). -->
<script>
  let status = 'idle';
  let message = '';
  async function onSubmit(e) {
    status = 'loading'; message = '';
    const form = e.currentTarget;
    try {
      const res = await fetch('${action}', {
        method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset(); status = 'done';
        message = data.status === 'confirmed' ? "You're subscribed 🎉" : 'Check your inbox to confirm ✉️';
      } else { status = 'error'; message = data.error || 'Something went wrong.'; }
    } catch { status = 'error'; message = 'Network error. Try again.'; }
  }
</script>

<form on:submit={onSubmit} class="flex flex-wrap gap-2 max-w-md">
  <input type="email" name="email" required placeholder="you@example.com" autocomplete="email"
    class="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2" />
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="hidden" />
  <button type="submit" disabled={status === 'loading'}
    class="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50">
    {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
  </button>
  {#if message}<p role="status" class="basis-full text-sm">{message}</p>{/if}
</form>`;
}

function renderForm() {
  if (framework === "react") return reactForm();
  if (framework === "svelte") return svelteForm();
  return htmlForm();
}

// ---- commands ------------------------------------------------------------

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

  console.log(`✅ wrote ${path} with group "${group}"\n`);
  console.log("Paste this form into your site:\n");
  console.log(htmlForm());
  console.log(`\nNext:`);
  console.log(`  • deploy your site (the form already works — no backend)`);
  console.log(`  • run the server, then: co sync   (reconciles ${path})`);
}

function doForm() {
  console.log(renderForm());
}

function help() {
  console.log(
    `codeoutbox — email capture your agent sets up in one prompt\n\n` +
      `  codeoutbox form  [--id <public_id>] [--framework html|react|svelte] [--base <url>]\n` +
      `  codeoutbox init  [--group <slug>] [--base <url>]\n\n` +
      `Get your form's public id from \`co groups\` or the dashboard.\n\n` +
      `Examples:\n` +
      `  npx codeoutbox form --id 8kJ2mQ\n` +
      `  npx codeoutbox form --id 8kJ2mQ --framework react\n` +
      `  npx codeoutbox init --group newsletter`,
  );
}

if (cmd === "form") doForm();
else if (cmd === "init") await doInit();
else help();
