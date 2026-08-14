# Day 2 — Use it yourself, and be honest about whether it helps

**Time: about 1 hour. Cost: $0.00.**

Goal: install the MCP server into your own AI coding tool and find out whether
the answers are good. This is a product-quality day, not a technical one.

---

## 1. Install the MCP server (15 min)

**Claude Code / Claude Desktop** — edit your MCP config:

```json
{
  "mcpServers": {
    "driftwatch": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/Users/YOUR_USERNAME/X402/src/mcp/server.ts"
      ]
    }
  }
}
```

**Cursor** — Settings → MCP → Add Server, same command and args.

Restart the app. You should see `driftwatch` with two tools:
`get_migration_delta` and `check_package`.

---

## 2. Actually use it (20 min)

Ask your coding agent things like:

- *"What broke between React 18.2 and React 19?"*
- *"I'm upgrading Express from 4.18 to 5.0. What do I need to change?"*
- *"Is the npm package `crypto-js-utils` safe to install?"*

Watch whether the agent calls the tool, and whether the answer actually helps.

---

## 3. Judge it honestly (20 min)

This is the important part of the day. For each of five upgrades you personally
care about, score the answer:

| Package | from → to | Useful? | What was missing? |
|---|---|---|---|
| | | | |

**The question to answer:** *would I keep this installed?*

If the honest answer is no, that is the single most valuable thing you could
learn today, and it is better to learn it now than in month three. Write down
specifically what was missing — that list becomes the roadmap.

Common gaps and what they mean:

| Symptom | Cause | Fix |
|---|---|---|
| "No release notes found" | Package has no GitHub releases | Add CHANGELOG.md parsing (Week 1) |
| Breaking changes listed but no code fix | Deterministic tier only | Enable the LLM (needs approval) |
| Missed an obvious break | Extraction pattern gap | Improve `src/engine/extract.ts` |
| Too much noise | Over-matching | Tighten confidence thresholds |

---

## 4. Fix the biggest gap (bonus)

If one gap dominated, the extraction logic is in `src/engine/extract.ts` and is
deliberately readable. Add a pattern, run `npm test`, try again.

---

## Done — checklist

- [ ] MCP server installed and visible in your coding tool
- [ ] Used it on at least 5 real upgrades
- [ ] Written down what was missing
- [ ] Decided honestly whether you would keep it installed

**Spent so far: $0.00.**

Tomorrow: prove the payment path works, with play money.
