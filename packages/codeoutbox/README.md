# codeoutbox

A newsletter signup form in one command, with no backend to run.

```bash
npx codeoutbox --id <your-form-id>
# ✅ react form (Tailwind) → src/components/CodeOutboxForm.tsx
```

It detects your stack (React/Next, Vue/Nuxt, Svelte/SvelteKit, Astro, or plain HTML)
and whether you use Tailwind, then writes an accessible, dark-mode-aware form component
with loading, success and error states. Submissions go to [CodeOutbox](https://codeoutbox.com),
which handles double opt-in, unsubscribes and sending.

No account? Just run it. You get a working list right away, plus a link to claim it
(free). Add `--email` and we'll send you that link when your first subscriber confirms:

```bash
npx codeoutbox --email you@example.com
```

Unclaimed lists hold up to 25 subscribers and are deleted after 14 days. With an
account, pass `--id`, or set `CO_TOKEN` and the list is created for you.

| Option | |
|---|---|
| `--id <public_id>` | your form id (dashboard or `co groups`) |
| `--group <slug>` | list name to create (default `newsletter`) |
| `--email <you@…>` | get a claim link when your first subscriber confirms |
| `--offline` | don't create a list; write a placeholder id |
| `--framework <f>` | `html` \| `react` \| `vue` \| `svelte` \| `astro` (default: detected) |
| `--tailwind` / `--no-tailwind` | override Tailwind detection |
| `--out <path>` | where to write the component |
| `--force` | overwrite an existing file |

## For coding agents (MCP)

`npx codeoutbox mcp` is an MCP server, so Claude Code, Cursor or any MCP client can set up
and run the newsletter for you: lists, the form, the signup page, previews and sends.

```bash
claude mcp add codeoutbox -e CO_TOKEN=co_live_… -- npx -y codeoutbox mcp
```

Create the key at <https://app.codeoutbox.com> (Settings → API keys), then ask your agent to
"add a newsletter to this site". Sends always wait for your go-ahead. Without a key the
server can still create a list you claim later.

## Other commands

`npx codeoutbox import <list> <file.csv> --confirmed` brings subscribers over from Mailchimp,
Kit, Substack, Buttondown or any CSV (needs `CO_TOKEN`). Guides: <https://codeoutbox.com/switch/>

`npx codeoutbox form …` prints the component instead of writing it.
`npx codeoutbox init` writes a `codeoutbox.json` for config-as-code.
