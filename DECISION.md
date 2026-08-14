# Step 3 — The Selection

**Date: 7 August 2026**

---

## What we are building

**Working name: `driftwatch`**

> A machine-callable service that answers one question precisely and with citations:
> **"This library moved from version A to version B. What broke, and what edits does my code need?"**

Delivered three ways from one engine:
1. **MCP server** (free tier) — the distribution channel. Installs into Claude Code, Cursor, Windsurf.
2. **HTTP API** with an OpenAPI spec — for CI systems and agent fleets.
3. **x402-paid endpoints** on Base — for autonomous agents with a wallet and no credit card.

---

## Why this one

### 1. The demand is measured, not asserted
The SDKProof benchmark (July 2026) type-checked coding agents against current SDKs and found them
scoring 80/100 on Prisma v7 and 90/100 on Vercel AI SDK v5+ — failing specifically on removed and
renamed APIs. This is not a problem I inferred; someone built a benchmark because it hurt enough to
measure. Context7's dominance of MCP.Directory (≈2× the #2 server by views) independently proves that
agent users will install a tool that fixes stale library knowledge.

### 2. The buyer can verify our value with a calculator
This is the decisive reason. One $0.05 call replaces roughly 6 failed build-fix iterations at
~15k tokens each — call it $0.30–$1.50 of tokens plus 10–20 minutes of wall clock. **A 6–30× return
that the buyer computes themselves.** No brand, no trust, no relationship required. Nothing else on
the list has a value proposition this legible to a machine.

### 3. Marginal cost collapses to zero
The delta between `react@18.2.0` and `react@19.0.0` is a permanent fact. Compute it once, serve it
forever. Version pairs are finite and follow a savage power law. First serve costs a few cents of LLM
tokens; every subsequent serve is a database read. **Gross margin ~60% cold, 95%+ at steady state.**

### 4. Every input is free and public
npm and PyPI registry APIs, GitHub Releases and compare-diffs, deps.dev, OSV.dev. **No licensed data,
no upstream contract, no resale-terms violation, no recurring API bill.** Compare this to opportunity
#17, the proven x402 money-maker, which only works by reselling licensed data in probable breach of
the upstream ToS. We will not do that, and we do not need to.

### 5. It runs on your Mac Mini for $0
Nightly precompute of popular version pairs, SQLite, an HTTP server. Your headless Mac Mini is not a
compromise here — it is genuinely sufficient for the first several thousand requests a month.

### 6. Distribution requires zero human selling
Publish the MCP server to npm and the registries. It is useful on the free tier, so it spreads on
merit. This satisfies your constraint about not chasing individual human customers better than any
other option.

### 7. x402 fits without distorting the business
The payment layer is a genuinely good fit — per-call, sub-cent-capable, no account needed — and
listing on the Bazaar is free. **But we are not depending on it.** Which brings me to the part you
need to hear clearly.

---

## The honest caveat, stated plainly

**Do not expect meaningful x402 revenue in the first year. There is almost nobody there to pay us.**

I measured the entire independent x402 Bazaar economy on 7 August 2026: **~$11,700/month in total GMV
across 14,128 registered services.** The single best independent operator grosses ~$872/month. Only 32
services out of 14,128 have genuine repeat demand.

If we build a great x402 endpoint and get lucky, the ceiling in that channel today is a few hundred
dollars a month. That is the honest number.

So the plan deliberately inverts the usual pitch:
- **MCP is the business** — it reaches users who exist right now, in the millions of agent sessions
  running today.
- **The paid API is the revenue** — CI systems and agent fleets that run unattended at volume.
- **x402 is cheap, correct optionality** — a few days of work, near-zero ongoing cost, and we are
  positioned properly if agent-native payments grow into what everyone expects. If they do not, we
  have lost a few days.

I would rather you know this now than discover it in month three.

### Other risks I want on the record

| Risk | Assessment |
|---|---|
| **A funded player closes the gap** | Real. Context7 could ship deltas; Stack Overflow for Agents launched June 2026. Our defense is speed and depth in a narrow slice, plus an accumulated cache that improves with use. This is not a durable moat and I will not pretend otherwise. |
| **Free-tier usage vastly exceeds paid** | Expected, and fine — it is the acquisition cost. But it means revenue lags usage by a long way. |
| **Answer quality is the whole product** | If our deltas are wrong, agents stop calling. This is a prompt-and-eval discipline problem, and it is where most of the real work will go. |
| **Copyright** | We output facts, short quotations, and links to primary sources — never wholesale reproduction of documentation. This is both legally sound and a better product. |
| **Coding agents mostly lack wallets today** | The main structural headwind on paid conversion. Mitigated by targeting CI and unattended fleets, not interactive IDE sessions. |

---

## Second best: Apify Store actor in an underserved scraping niche

**This is the only opportunity with published, verified solo-developer revenue** — top independent
creators exceed $10,000/month, many exceed $1,000/month, developers keep 80%. Apify supplies buyers,
billing, payouts, and discovery.

I did not pick it first because it is platform-dependent, not agent-native, and scrapers carry
permanent maintenance load. **But it is the highest-probability path to your first real dollar, and
I recommend it as channel two once the core engine exists.**

## Third best: Package Trust / Anti-Slopsquatting API

Easiest thing on the list to build well, ~99% margin, real security value. Its problem is that the
natural price is close to zero. **It ships inside our MCP server as a free companion tool** — it makes
the server more useful, more installable, and creates a natural upsell surface into the paid delta API.

---

## What I need from you before I build

Three things, and then I can work for a long stretch without interrupting you.

**1. Confirm the strategy.** Specifically: are you comfortable that x402 is the *payment rail* and not
the *revenue source* in year one? If you want a plan that maximizes x402 revenue specifically, I will
build you a different (and in my judgment worse) business, and I will say so plainly rather than
quietly optimizing for something else.

**2. Confirm the name.** `driftwatch` is a placeholder. If you have a preference, now is the cheapest
moment to change it.

**3. Nothing else.** Everything in Phase 1 is free: local build, SQLite, testnet-only x402, your Mac
Mini. **No spending, no wallet funding, no mainnet, no domain purchase.** I will stop and ask before
any of those, per your Step 14 stop conditions.

---

## WHAT WE DID
Researched the agent-payments ecosystem from primary sources, and — rather than relying on secondary
commentary — **directly measured the entire live x402 Bazaar catalog**: 14,128 services, their 30-day
call counts, unique payers, and pricing, plus a liveness probe of 350 endpoints. Generated and ranked
20 business opportunities against your criteria. Selected one, with two alternates.

## WHAT IT COST
**$0.00.** No paid APIs, no infrastructure, no subscriptions. Research used only public endpoints and
web search.

## WHAT WE LEARNED
The most important thing we learned is a negative result, and it reshaped the plan: **the independent
x402 seller economy is roughly $11,700/month in total, and 99.8% of registered services have no real
repeat demand.** Building an x402-revenue-dependent business in 2026 means competing for a pool
smaller than one good freelancer's income. Meanwhile MCP has the users, Apify has the proven
solo-developer payouts, and the best-evidenced unsolved problem is coding agents writing code against
library versions that no longer exist.

We also learned the one thing that *does* work on x402 today — reselling access to premium APIs that
agents cannot buy accounts for — is usually a breach of the upstream terms of service. We ruled it out.

## WHAT HAPPENS NEXT
On your go-ahead: Step 4 (architecture) and Step 5 (build the MVP) — project scaffold, the delta
engine, SQLite cache, HTTP API, MCP server, tests, and a testnet-only x402 layer. All free, all local,
all reversible.
