# driftwatch-mcp

**Your coding agent writes code against the version of a library it saw in
training. Libraries move.** This MCP server tells it exactly what changed
between two versions — with citations.

```
"What broke between React 18.2 and React 19?"
"I'm upgrading Express 4.18 to 5.0 — what do I need to change?"
"Is the npm package `recat` safe to install?"
```

## Install

```json
{
  "mcpServers": {
    "driftwatch": {
      "command": "npx",
      "args": ["-y", "driftwatch-mcp"]
    }
  }
}
```

Works with Claude Desktop, Claude Code, Cursor, Windsurf, Zed — anything that
speaks MCP. Requires Node 22.6+. No API key needed.

## Two tools

### `get_migration_delta`
Breaking changes between two versions: removed and renamed symbols, concrete
before/after code, and security advisories the upgrade resolves.

Real output for `express 4.18.0 → 5.0.0`:

```
res.send(200, body)        →  res.status(200).send(body)
app.get('/foo/*', h)       →  app.get('/foo/*splat', h)
req.param('id')            →  req.params.id
res.redirect('back')       →  res.redirect(req.get('Referrer') || '/')
```

…21 changes in total, plus two CVEs both fixed by the upgrade.

### `check_package`
Does this package exist, and is it safe to install? Flags typosquats before
your agent runs `npm install`.

`recat` is a real package on npm. One keystroke from `react`, version 0.0.0,
no repository, no description. It is flagged **suspicious**.

## Where the data comes from

npm · PyPI · GitHub Releases · project changelogs · OSV.dev — all public, all
cited. Every claim links back to the release note it came from. We publish
facts and short quotations, never reproduced documentation.

## Optional: better answers

Without configuration you get **deterministic extraction** — free, fast, and
good on projects with well-written release notes.

Some projects write prose, or commit logs, or nothing at all. Set an Anthropic
API key and those get parsed too:

```json
{
  "mcpServers": {
    "driftwatch": {
      "command": "npx",
      "args": ["-y", "driftwatch-mcp"],
      "env": {
        "LLM_ENABLED": "true",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "LLM_MAX_DAILY_SPEND_USD": "1.00"
      }
    }
  }
}
```

Measured on a deliberately hard sample: 4/6 useful without a key, 6/6 with one.
Costs roughly $0.09 per *new* version pair and **nothing thereafter** — results
cache permanently to `~/.driftwatch/`. The daily cap is enforced before every
call; exceed it and it silently falls back to the free tier rather than
spending more.

**Your key, your account, your spend.** It is never sent anywhere but Anthropic.

## Honest limitations

- **Some projects document nothing.** Flask 3.0's changelog says only "Remove
  previously deprecated code" without listing what. You get a thin answer,
  because inventing the list would be worse.
- **npm and PyPI only.** Go, Rust, and Maven are not supported yet.
- **Unauthenticated GitHub allows 60 requests/hour.** Set `GITHUB_TOKEN` (free,
  no scopes needed) to raise it to 5,000 and improve coverage.
- **Verify anything load-bearing** against the citations. It is a research
  assistant, not an oracle.

## Config reference

| Variable | Default | Purpose |
|---|---|---|
| `LLM_ENABLED` | `false` | Turn on LLM synthesis |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_ENABLED` |
| `LLM_MODEL` | `claude-opus-5` | Model for synthesis |
| `LLM_MAX_DAILY_SPEND_USD` | `1.00` | Hard daily ceiling |
| `GITHUB_TOKEN` | — | Raises GitHub's rate limit |
| `DB_PATH` | `~/.driftwatch/driftwatch.db` | Cache location |

MIT licensed.
