# Week 2 — Publish and find out if anyone wants it

**Cost: ~$12 for a domain (needs your approval). Everything else: $0.00.**

Week 1 made it good. This week we find out whether anyone else agrees.

**Prerequisite: you hit 15/20 on the scorecard.** If not, go back.

---

## Day 8 — Domain and public URL

**APPROVAL NEEDED: ~$12/year.** This is the first real money in the project.

Buy from Cloudflare Registrar (at-cost, no markup) or Namecheap. Something
short and honest — `driftwatch.dev`, `depdrift.com`.

```bash
# .env
PUBLIC_URL=https://yourdomain.com
```

Restart. That URL is now baked into your OpenAPI spec, `llms.txt`, and Bazaar
listing, so get it right before publishing anywhere.

---

## Day 9 — Go public, safely

Follow [Phase 2 of the deployment guide](docs/DEPLOYMENT.md#phase-2--put-it-on-the-internet-safely).

**Use a Cloudflare Tunnel. Do not port-forward your router.** The tunnel makes
an outbound connection, so no inbound port on your home network is ever opened.

Verify from a machine that is not yours:

```bash
curl https://yourdomain.com/health
curl https://yourdomain.com/llms.txt
curl -i https://yourdomain.com/admin/stats     # MUST be 403
```

That last one is not optional. Confirm it.

---

## Day 10 — Publish the MCP server

This is the actual distribution channel. Everything else is secondary.

```bash
npm publish --access public
```

Then submit to, in order of value:

1. **`awesome-mcp-servers`** on GitHub (PR) — highest signal
2. **mcp.directory**
3. **mcp-marketplace.io**
4. **Cursor's MCP directory**

Write the listing for a developer skimming twenty options. Lead with the
problem, not the technology:

> *Your AI writes code against the version of a library it learned in training.
> Libraries move. driftwatch tells your agent exactly what changed between two
> versions, with citations, so it stops guessing.*

Nobody cares that it speaks x402. They care that their build stops failing.

---

## Day 11 — List on the x402 Bazaar

Free and automatic with `X402_DISCOVERABLE=true`. Verify after your first paid
call:

```bash
curl "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100" | grep -i driftwatch
```

**Keep your expectations calibrated.** The entire Bazaar is ~$11,700/month
across 14,128 services. This is worth doing because it costs nothing, not
because it is distribution.

---

## Day 12 — Tell humans, honestly

Write one genuinely useful post. Not a launch announcement — a piece of writing
someone would want to read anyway.

Good angle: **publish the market research.** You have data nobody else has —
the complete Bazaar catalog with real call counts, showing the entire x402
economy is ~$11,700/month and 99.8% of listings have no repeat demand. That is
a genuinely interesting, honest post. The tool is the footnote.

Where: Hacker News (Show HN), r/LocalLLaMA, r/ChatGPTCoding, dev.to.

**Rules:** disclose that it is yours, never post fake enthusiasm from alt
accounts, and if the response is "this isn't useful because X", that is a gift.
Write X down.

---

## Day 13–14 — Watch, and listen

```bash
curl localhost:4021/admin/stats
```

Track daily: installs, unique callers, **calls per caller**, and which packages
people ask about.

**Calls per caller is the number that matters.** From the market data:

| Signal | Meaning |
|---|---|
| < 2 calls/caller | Tourism. People try it once and leave. |
| 5–20 | Something real is forming. |
| > 20 | Genuine repeat demand — the rarest thing in this market. |

Only 32 of 14,128 x402 services clear the repeat-demand bar. If you land there,
you have something regardless of what revenue says.

---

## End of week — checklist

- [ ] Domain bought and `PUBLIC_URL` set *(needs approval)*
- [ ] Publicly reachable over a Cloudflare Tunnel
- [ ] `/admin/stats` returns 403 externally
- [ ] MCP server published and submitted to registries
- [ ] Listed on the x402 Bazaar
- [ ] One honest post written
- [ ] Tracking calls-per-caller daily

**Spent so far: ~$12.**
