# Day 2 Scorecard

**The only question this day answers: would I keep this installed?**

Everything else is already built and tested. What has *not* been tested is
whether the answers are actually useful to a person doing real work. That is
the thing no amount of engineering can tell us, and it is the thing that
decides whether this is a product or a demo.

---

## Setup — already done for you

`driftwatch` is registered in Claude Desktop. **Quit Claude Desktop completely
(Cmd+Q, not just closing the window) and reopen it.** MCP servers are only
loaded at startup.

To confirm it loaded: look for the tools/connector indicator in the chat input.
You should see `driftwatch` with two tools.

If it does not appear, run this and send me the output:

```bash
tail -50 ~/Library/Logs/Claude/mcp*.log
```

---

## The test

Ask Claude Desktop each of these in a **new conversation**. Score each answer.

### Round 1 — upgrades you actually care about

Replace these with libraries *you* use if you have them. Real questions beat
synthetic ones.

| # | Ask it | Useful? | What was missing? |
|---|---|---|---|
| 1 | "What broke between React 18.2 and React 19?" | | |
| 2 | "I'm upgrading Express from 4.18 to 5.0 — what do I need to change?" | | |
| 3 | "What changed in Vite between 4 and 5?" | | |
| 4 | "Upgrading Next.js 14 to 15. What breaks?" | | |
| 5 | "What do I need to change going from Pydantic 1.10 to 2.0?" | | |

### Round 2 — the safety check

| # | Ask it | Expected |
|---|---|---|
| 6 | "Is the npm package `recat` safe to install?" | Should flag it **suspicious** — real typosquat, v0.0.0, no repo |
| 7 | "Is `crypto-js-utils` safe to install?" | Should say it does not exist, warn about hallucinated names |
| 8 | "Check the npm package `express` before I install it" | Should come back clean |

### Round 3 — the honest one

| # | Ask it | What to watch for |
|---|---|---|
| 9 | Ask about a library you know **very well**, upgrading across a major | Does it tell you anything you did not already know? |
| 10 | Ask about an obscure or tiny package | Does it degrade gracefully, or produce confident nonsense? |

---

## Scoring

For each answer, mark one:

- **USEFUL** — told me something actionable I would have had to look up
- **THIN** — technically correct, not worth the tool call
- **WRONG** — inaccurate, or invented something

Then answer the only question that matters:

> **Would I keep this installed on my own machine?**  YES / NO

---

## What the result means

| Outcome | What it says | What to do |
|---|---|---|
| **8+ useful, would keep** | Real product. Quality is not the bottleneck. | Publish the MCP server to npm and the registries. Distribution is the work. |
| **5–7 useful, would keep** | Promising but patchy. | Note *which* ones failed and why. Fix the dominant failure class before publishing. |
| **Under 5, or would not keep** | Not ready, and possibly not viable. | **Do not publish.** Better to know now. Decide whether the gap is fixable or whether this idea does not survive contact with real use. |
| **Any WRONG answers** | Most serious outcome. | A tool that invents breaking changes is worse than no tool. Fix before anything else. |

---

## Notes on what you are likely to see

**It will be strong on:** React, Next.js, ESLint, Vite — libraries with
well-written release notes. Measured 5/6 useful on a hard sample.

**It will be weak on:** Flask, and libraries whose changelog says something
like *"Remove previously deprecated code"* without enumerating what. The model
declines to invent the list, which is correct behaviour, but it means a thin
answer. If you hit one of these, that is the known limitation, not a bug.

**First call on a new version pair takes 20–60 seconds** (it fetches release
notes and runs the LLM). Every call after that is instant — the result is
cached permanently. Do not judge the latency on the first call.

**Cost:** roughly $0.09 per *new* version pair, then free forever. Capped at
$1/day. Check spend any time:

```bash
sqlite3 ~/X402/data/driftwatch.db "SELECT day, ROUND(llm_usd,4), calls FROM spend_daily;"
```

---

## When you're done

Bring me the scorecard — especially the failures. The failures are the roadmap.
A list of "these five upgrades gave me nothing useful" is worth more to me than
"it seemed fine."
