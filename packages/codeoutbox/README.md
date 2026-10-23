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

No form id yet? Sign up free at <https://demo.codeoutbox.com/signup>, or set `CO_TOKEN`
and the list is created for you:

```bash
CO_TOKEN=… npx codeoutbox --group launch
```

| Option | |
|---|---|
| `--id <public_id>` | your form id (dashboard or `co groups`) |
| `--group <slug>` | list to create when `CO_TOKEN` is set (default `newsletter`) |
| `--framework <f>` | `html` \| `react` \| `vue` \| `svelte` \| `astro` (default: detected) |
| `--tailwind` / `--no-tailwind` | override Tailwind detection |
| `--out <path>` | where to write the component |
| `--force` | overwrite an existing file |

`npx codeoutbox form …` prints the component instead of writing it.
`npx codeoutbox init` writes a `codeoutbox.json` for config-as-code.
