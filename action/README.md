# CodeOutbox GitHub Action

Newsletters reviewed like code. Open a PR that adds `campaigns/oct.md` and CodeOutbox
comments on it:

> ### ✉️ CodeOutbox preview
> | Campaign | Subject | List | On merge | Preview |
> |---|---|---|---|---|
> | `campaigns/oct.md` | October update | `newsletter` | sends to **1,204** subscribers | [view email](#) |

Merge it and it sends. Sends are idempotent per content, so re-runs never double-send.
Put `draft: true` in a campaign's frontmatter to merge it without sending.

```yaml
# .github/workflows/newsletter.yml
name: Newsletter
on:
  pull_request:
    paths: ["campaigns/**"]
  push:
    branches: [main]
    paths: ["campaigns/**"]
permissions:
  contents: read
  pull-requests: write
jobs:
  codeoutbox:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Cellcote/CodeOutbox/action@main
        with:
          api-token: ${{ secrets.CODEOUTBOX_TOKEN }}
```

Create the token with `co token create --name github` and store it as the
`CODEOUTBOX_TOKEN` repository secret.

| Input | Default | |
|---|---|---|
| `api-token` | — | required |
| `paths` | `campaigns/**/*.md` | comma/newline-separated globs |
| `mode` | `auto` | `auto` = preview on `pull_request`, send on `push`; or force `preview` / `send` |
| `url` | `https://demo.codeoutbox.com` | CodeOutbox app URL |
| `github-token` | `${{ github.token }}` | used to post the PR comment |

A campaign that fails to render (missing `subject`, unknown list) fails the check.
On PRs from forks the secret isn't available; the action logs a warning and skips.
