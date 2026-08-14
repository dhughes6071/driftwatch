# driftwatch

**Dependency migration intelligence for AI coding agents.**

Answers one question, precisely and with citations:

> *This library moved from version A to version B. What broke, and what edits
> does my code need?*

New here? Start with the [Beginner's Guide](BEGINNER_GUIDE.md).

---

## Why this exists

Every LLM is frozen at a training cutoff. Libraries are not. When an agent
writes code against a version newer than its cutoff, it confidently emits an API
that no longer exists — and then burns roughly six failed build-fix iterations
converging on the truth.

The **SDKProof benchmark (July 2026)** measured this: models score 80/100 on
Prisma v7 (the v6 `PrismaClient` pattern was removed) and 90/100 on Vercel AI
SDK v5+ (parameters renamed, `maxSteps` deleted).

```
Without driftwatch:  ~6 failed iterations x ~15k tokens  ->  $0.30-$1.50 + 10-20 min
With driftwatch:     1 call                              ->  $0.05
```

A 6–30x return the buyer computes for themselves. No trust required.

---

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

```bash
# The product
curl "localhost:4021/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0"

# Free safety check -- catches hallucinated and typosquatted packages
curl "localhost:4021/v1/check?ecosystem=npm&name=recat"
```

Runs with payments off and paid AI features off. **Costs nothing.**

---

## What you get

```jsonc
{
  "package": "react",
  "from": "18.2.0", "to": "19.0.0",
  "jump": { "kind": "major", "majorsCrossed": 1, "releasesInRange": 583 },
  "tier": "evidence",
  "breakingChanges": [
    {
      "summary": "Removed: `ReactDOM.render`, `ReactDOM.hydrate` ...",
      "version": "19.0.0",
      "confidence": "medium",
      "symbols": ["ReactDOM", "render", "hydrate"],
      "citations": [{ "kind": "release-note", "url": "https://github.com/..." }]
    }
  ],
  "advisories": [],
  "citations": [ /* every source we relied on */ ]
}
```

Every claim links to a primary source. We publish facts and short citations —
never wholesale documentation.

---

## Architecture

```
                 ┌──────────────────────────────────────────┐
                 │   FREE PUBLIC SOURCES  (no licensed data) │
                 │   npm · PyPI · GitHub Releases · OSV.dev  │
                 └────────────────────┬─────────────────────┘
                                      │
                          ┌───────────▼───────────┐
                          │   ENGINE               │
                          │  ┌──────────────────┐  │
                          │  │ deterministic    │  │  always on, $0
                          │  │ extraction       │  │
                          │  └────────┬─────────┘  │
                          │  ┌────────▼─────────┐  │
                          │  │ LLM synthesis    │  │  OPTIONAL, capped
                          │  │ (off by default) │  │
                          │  └────────┬─────────┘  │
                          └───────────┼────────────┘
                                      │
                          ┌───────────▼───────────┐
                          │  SQLite PERMANENT CACHE│  ← the margin
                          │  + revenue ledger      │
                          └───────────┬───────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
      ┌───────▼───────┐      ┌────────▼────────┐    ┌────────▼────────┐
      │  MCP server   │      │   HTTP API      │    │  x402 layer     │
      │  (stdio)      │      │   + OpenAPI     │    │  (Base, USDC)   │
      │               │      │                 │    │                 │
      │ DISTRIBUTION  │      │    REVENUE      │    │   OPTIONALITY   │
      └───────────────┘      └─────────────────┘    └─────────────────┘
```

**The strategy in one line:** MCP has the users, the API has the revenue, x402 is
cheap positioning. See [DECISION.md](DECISION.md) for why, and
[MARKET_RESEARCH.md](MARKET_RESEARCH.md) for the measured evidence.

---

## Endpoints

| Endpoint | Price | Purpose |
|---|---|---|
| `GET /v1/delta` | $0.05 | The product — breaking changes between two versions |
| `POST /v1/manifest` | $0.15 | Batch analysis, up to 50 packages |
| `GET /v1/check` | free | Does this package exist? Is it a typosquat? |
| `GET /health` | free | Liveness |
| `GET /openapi.json` | free | Machine-readable spec |
| `GET /llms.txt` | free | Agent-readable summary |
| `GET /.well-known/x402` | free | Payment discovery |
| `GET /admin/stats` | localhost | Revenue and cost ledger |

Ecosystems: **npm**, **PyPI**.

---

## MCP server

The distribution channel. Two tools: `get_migration_delta` and `check_package`.

```json
{
  "mcpServers": {
    "driftwatch": {
      "command": "node",
      "args": ["--experimental-strip-types", "/path/to/X402/src/mcp/server.ts"]
    }
  }
}
```

Runs the engine locally by default — no network calls to us, no payment. Set
`DRIFTWATCH_REMOTE_URL` to point it at a hosted instance instead.

---

## Commands

```bash
npm start           # run the API server
npm run dev         # run with auto-reload
npm run mcp         # run the MCP server (stdio)
npm test            # unit tests -- no network, no cost
npm run testclient  # simulate a customer end to end
npm run wallet:new  # generate a TESTNET wallet
```

---

## Security in one paragraph

**This server never holds a private key.** Receiving crypto needs only a public
address; only spending needs a key, and we only ever receive. Compromise the
server and you get a cache and a ledger — you cannot get funds, because there is
nothing to get. LLM spending is capped daily and checked before every call.
Full detail: [docs/SECURITY.md](docs/SECURITY.md).

---

## Honest status

**This is an unvalidated business.** The measured facts:

- The entire independent x402 seller economy is **~$11,700/month** across
  14,128 registered services (measured 2026-08-07 — see
  [MARKET_RESEARCH.md](MARKET_RESEARCH.md)).
- The best independent operator makes **~$872/month**.
- Most coding agents run inside a human's subscription and **have no wallet**.

So: expect free MCP usage to vastly exceed paid calls, and expect x402 revenue
near zero in year one. The service is built so that outcome costs ~$1/month and
still produces something genuinely useful.

The metric that matters is not revenue — it is **calls per unique payer**. Below
5 means tourism. Above 20 means a real business, even at tiny revenue.

---

## Documentation

| File | What's in it |
|---|---|
| [BEGINNER_GUIDE.md](BEGINNER_GUIDE.md) | Everything, in plain English |
| [MARKET_RESEARCH.md](MARKET_RESEARCH.md) | Measured state of x402, MCP, and agent payments |
| [OPPORTUNITIES.md](OPPORTUNITIES.md) | 20 businesses considered, ranked |
| [DECISION.md](DECISION.md) | Why this one, and the honest caveats |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Done / in progress / next |
| [docs/SECURITY.md](docs/SECURITY.md) | Key custody, spending controls, threat model |
| [docs/ECONOMICS.md](docs/ECONOMICS.md) | Unit economics and three scenarios |
| [docs/COSTS.md](docs/COSTS.md) | Every recurring cost, before you commit |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Mac Mini → internet → mainnet → VPS |
| [DAY_1.md](DAY_1.md) … [MONTH_1.md](MONTH_1.md) | Concrete launch plan |

---

## Data sources and ethics

All inputs are **free, public, and unlicensed**: the npm registry, PyPI, GitHub
Releases, and OSV.dev.

We deliberately do **not** resell licensed data. The highest-earning independent
x402 operators today proxy paid APIs (People Data Labs, Exa, Firecrawl) in
probable breach of their terms. That is the one business model demonstrably
working on x402, and we ruled it out.

We publish facts with short citations and links — never reproduced
documentation.
