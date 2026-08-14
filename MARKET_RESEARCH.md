# Market Research — Agent Payments & Agent-to-Agent Commerce
**Date of research: 7 August 2026**
**Method: web research on primary sources + direct measurement of the live x402 Bazaar catalog (14,128 services)**

---

## The headline finding, stated plainly

**You cannot build a business today whose revenue depends on x402 buyers finding you.**

I measured this rather than guessed. On 7 August 2026 I pulled the complete Coinbase CDP x402 Bazaar
discovery catalog — every service registered as discoverable, 14,128 of them — including each service's
last-30-day call count and unique-payer count, which the Bazaar publishes per resource.

Here is the entire independent x402 seller economy:

| Measure | Value |
|---|---|
| Registered discoverable services | 14,128 |
| Services with ≥10 paid calls in 30 days | 1,197 (8.5%) |
| Services with ≥100 paid calls in 30 days | **287 (2.0%)** |
| Services with ≥1,000 paid calls in 30 days | **26 (0.18%)** |
| Total paid calls across the entire catalog, 30 days | 370,101 |
| **Estimated total GMV across the entire catalog, 30 days** | **~$11,700** |
| Top-10 services' share of that GMV | 39.6% |
| Top-25 services' share | 52.6% |

The single highest-earning independent operator in the whole Bazaar (`stableenrich.dev`) grosses
approximately **$872/month**. Tavily's x402 endpoint — the most widely-adopted single service by
unique payers — grosses approximately **$554/month**.

That is the prize. The entire addressable "an agent discovers my x402 API and pays me" market is
roughly **$12,000 per month, worldwide, split across 14,000 sellers.**

Reproduce this yourself: `research/data/analyze2.py` against `research/data/x402_bazaar_slim_2026-08-07.json`.

---

## STEP 1 — What is actually working, what is experimental, what is hype

### x402 (Coinbase / x402 Foundation)

**Status: real protocol, real infrastructure, negligible independent seller revenue.**

The protocol works. It is genuinely elegant — HTTP 402, stablecoin settlement, no account creation,
no chargebacks. The SDKs are good. Cloudflare, Circle, and Coinbase back it. None of that is hype.

The *demand* is the problem, and the ecosystem's own headline numbers obscure it:

- Reported: 200M+ cumulative transactions, ~$46.5M all-time volume, ~$600M annualized run-rate.
- Reality check #1: Artemis on-chain analysis finds **roughly half of x402 transactions are artificial**
  — self-dealing (same wallet is buyer and seller) and wash trading (seller funds the buyer wallet,
  which immediately returns the funds).
- Reality check #2: **Coinbase itself accounts for 58.7% of all-time settlement volume.** That is CDP's
  own internal API and data-feed usage, not a third-party marketplace.
- Reality check #3: Much of the 2025–26 transaction spike was the PING meme coin's "pay-to-mint"
  mechanic, not commerce. Wallet retention collapsed from ~87% to ~5% when the speculation faded, and
  daily transactions fell 92% from the December 2025 peak.
- Reality check #4 (CoinDesk, March 2026): daily volume ≈ **$28,000 across ~131,000 transactions**,
  average payment ≈ **$0.20**. Coinbase's own head of CDP engineering offered no revenue data, only
  that "experimentation is expected."

My independent Bazaar measurement is consistent with all of this and sharpens it: strip out Coinbase,
strip out wash trading, strip out meme-coin minting, and what remains for an independent seller is a
low-five-figure monthly market.

**A second measured problem: the catalog is mostly junk.** I probed 350 registered endpoints directly.

| Result | Share |
|---|---|
| Returns HTTP 402 correctly (healthy) | 73.4% |
| HTTP 405 (usually POST-only, probed with GET — probably fine) | 9.1% |
| 404 Not Found — dead route | 7.4% |
| DNS / TLS / connection failure — service gone | 4.3% |
| **200 OK with no paywall — misconfigured, giving the service away free** | 2.9% |
| 500 server error | 1.1% |

So ~13% of registered x402 services are hard-broken, and another ~3% are accidentally free. This is
an abandoned-project graveyard with a search index on top.

**Third problem: discovery does not convert.** Look at the usage shape of `api.onesource.io`, a
well-built set of 25 Ethereum RPC endpoints:

```
641 unique payers  →  1,018 total calls   (1.6 calls per payer)
```

Six hundred and forty-one different agents found it, paid once, and never came back. That is not a
customer base; that is a tasting menu. Agents are running discovery sweeps and trying everything once.

Compare that to the only services with genuine repeat demand:

```
x402.tavily.com      422 payers →  55,372 calls  (131 calls/payer)   ~$554/mo
stableenrich.dev/exa 277 payers →  12,085 calls  (44 calls/payer)    ~$121/mo
x402.twit.sh          44 payers → 104,476 calls  (2,374 calls/payer) ~$627/mo
```

Only **32 services out of 14,128** clear the bar of "≥20 unique payers AND ≥10 calls per payer."
That 0.23% is the real x402 economy.

### What the 32 real services have in common

This is the most useful pattern in the entire dataset. The services with genuine repeat demand are
almost all **resellers of premium APIs that agents cannot otherwise buy**:

- `stableenrich.dev` — the #1 independent operator — resells People Data Labs, FullEnrich, Exa,
  Firecrawl, and Clado on a per-call basis.
- `stabletravel.dev` — resells Google Flights search.
- `vaaya.ai` — resells Exa "via our API key."
- `blockrun.ai` — resells neural search and Polymarket data.

The business being done on x402 today is **arbitrage on account-creation friction**. An autonomous agent
has a wallet but no credit card, no legal entity, and no ability to sign a SaaS contract. Reselling
per-call access to APIs that require an account is the one thing that demonstrably works.

Two cautions on that pattern: margins are thin, and **most upstream API terms of service prohibit
resale**. Several of these operators are probably in breach. We will not build on that basis.

### x402 Bazaar (discovery layer)

Works as advertised, is free, requires no API key, and is trivially easy to list on
(`discoverable: true` when using the CDP facilitator). It publishes per-resource call counts and unique
payers over 30 days, ranks by a blend of relevance and quality, and returns at most 20 results per query.

**Listing is worth doing because it costs nearly nothing. It is not a growth strategy.** Being one of
14,128 entries in a directory whose entire economy is $12k/month is not distribution.

### MCP (Model Context Protocol)

**Status: this is where the actual users are.**

- ~22,000 MCP servers exist as of early 2026; roughly 8,000–12,000 distinct servers are directory-listed.
- Clients in production: Claude Code, Claude Desktop, Cursor, Windsurf, Zed, Continue, OpenAI Custom GPTs.
- Most-used servers: Playwright (ranked #1 globally mid-2026), GitHub, Context7, Figma, Slack, Notion, Postgres.
- **Context7 dominates MCP.Directory with nearly 2× the views of the #2 server.** Context7's entire job
  is injecting current library documentation into coding agents. That popularity is a hard signal about
  what agent users actually want.
- Reported quality crisis: **30–50% installation failure rates on community servers.**

Monetization is immature but emerging: per-call, subscription, freemium, and outcome-based models;
MCP Marketplace offers a Stripe Connect creator stack. Reported solo-developer revenue clusters at
**$500–$10,000+/month**, with the higher end unverified.

**The important asymmetry: MCP has the users, x402 has the payment rail, and neither has both.**

### Stripe Machine Payments Protocol (MPP)

**Status: credible, early, and the likely long-term winner on volume.**

Launched 18 March 2026, co-authored with Tempo. 100+ services at launch including Anthropic, OpenAI,
Shopify, Alchemy, Dune. Visa, Lightspark, and Cloudflare extended it to their networks. Existing Stripe
merchants can accept it through the PaymentIntents API with near-zero switching cost — which is a
devastating distribution advantage over x402.

Caveat: launched as a developer preview, USDC-only settlement, limited merchant support. Fiat settlement
and broad availability are roadmapped for H2 2026.

### Google AP2 (Agent Payments Protocol)

**Status: the governance/standards layer, not a product you sell through.**

Announced September 2025 with 60+ partners; **donated to the FIDO Alliance in May 2026** for
community governance. Payment-method agnostic, built on W3C Verifiable Credentials. v0.2 added
"Human Not Present" payments for autonomous transactions.

AP2 is the umbrella. Visa TAP and Mastercard Agent Pay plug into it as funding instruments. It is not
somewhere you list a service.

### Visa Trusted Agent Protocol (TAP)

**Status: real commercial rollout, but enterprise-only.**

Commercial launch Q1 2026. 100+ partners enrolled, 30+ in sandbox, 20+ integrating in production.
Fiserv adopted at scale in January 2026. This is card-rail tokenization for agent commerce — relevant
to us only as evidence that agent payments are being taken seriously by people with real budgets.

### Virtuals Protocol ACP

Real volume — its x402 server processed 54,910 transactions and ~$34,810 in a single day in March 2026,
and the top-10 services capture 97.6% of that. But it is an AI-character/token economy, heavily
speculative, and the demand is for agent-persona services rather than general utility APIs. Not a
credible foundation for a legitimate service business.

---

## Where money is actually moving in agent tooling

Setting the payment protocols aside, here is what agents and agent developers verifiably pay for:

| Category | Evidence | Notes |
|---|---|---|
| **Web search for agents** | Tavily raised a $25M Series A late 2025, is the default search tool in most LangChain agents. Exa, Brave, Firecrawl all commercial. | Highest call-per-payer on x402 (131). Inner-loop demand. **Heavily funded competition.** |
| **Scraping / structured extraction** | **Apify pays out to developers monthly; top independent creators exceed $10,000/month, many exceed $1,000/month.** 80% revenue share. | The single best-proven solo-developer revenue channel in this space. Marketplace supplies the buyers. |
| **Data enrichment** | PDL, FullEnrich, Clado — the #1 x402 operator is a reseller of exactly these. | Real repeat demand; expensive upstream data. |
| **Browser automation** | Browserbase on x402 (20 payers, 1,012 calls); Playwright is the #1 MCP server globally. | Real, infrastructure-heavy. |
| **Current library documentation** | **Context7 is the most-viewed server on MCP.Directory by ~2×.** | Massive demonstrated demand, currently monetized at $0. |

### The measured problem nobody has solved well

The **SDKProof benchmark (July 2026)** type-checks whether coding agents write code against current SDK
APIs. Measured results: models score **80/100 on Prisma v7** (the v6 `PrismaClient` pattern no longer
exists) and **90/100 on Vercel AI SDK v5+** (renamed `inputSchema`, removed `maxSteps`).

The cost of this is concrete and has been named the "Ephemeral Intelligence Gap": *an agent may spend
20 minutes of compute and token budget brute-forcing a breaking API change that another agent solved
five minutes earlier.* When the session ends, that knowledge evaporates.

Stack Overflow launched **"Stack Overflow for Agents" in June 2026**, and Google is pushing agent
skills at the same problem — which confirms the problem is real and also warns that larger players
are moving into it.

---

## Underserved niches I identified

1. **Version-to-version migration deltas.** Context7 serves *current* docs. Nothing serves *"what
   changed between v6 and v7 and what edits does my code need."* That is the expensive question.
2. **Package existence and trust at generation time.** Coding agents hallucinate package names
   ("slopsquatting"). Free upstream data (npm, PyPI, OSV.dev, deps.dev) but no single deterministic answer.
3. **Endpoint/server health as a service.** 13% of x402 services are hard-broken; 30–50% of community
   MCP servers fail to install. Nobody publishes trustworthy liveness data. (Real problem, but the
   buyers — directory operators and broke builders — have no budget.)
4. **Crawl-permission and AI-usage-policy oracle.** Growing legal pressure, free source data, unclear
   willingness to pay.
5. **Change detection over public structured sources** (regulatory, procurement, recalls). Compounds
   into a proprietary history that latecomers cannot replicate.

---

## What this means for our strategy

Three conclusions drive everything downstream:

**1. Treat x402 as a payment option, never as the business model.**
Implementing x402 costs us a few days and near-zero ongoing money, and it positions us correctly if
agent-native payments grow. Depending on x402 buyers for revenue in 2026 means competing for a
$12k/month pool. We will ship x402 because it is cheap and correct, not because it will pay us.

**2. Distribute where the users already are: MCP.**
MCP has ~22,000 servers and millions of sessions across Claude Code, Cursor, and friends. Context7's
dominance proves that agent users will install a server that makes their agent write correct code.
That is our acquisition channel and it requires zero human sales.

**3. Sell something whose value we can prove in dollars to the buyer.**
The strongest possible reason for a software system to pay is *"this call costs you $0.05 and saves
you $2.00 of tokens."* That is computable, verifiable, and does not require trust or a brand.

Ranked opportunities follow in [OPPORTUNITIES.md](OPPORTUNITIES.md).

---

## Sources

- [Inside x402: 100M Agentic Payments on Base — Chainalysis](https://www.chainalysis.com/blog/x402-agentic-payments-adoption/)
- [Coinbase-backed AI payments protocol wants to fix micropayment but demand is just not there yet — CoinDesk, 11 Mar 2026](https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet)
- [x402 Bazaar (Discovery Layer) — Coinbase Developer Documentation](https://docs.cdp.coinbase.com/x402/bazaar)
- [x402 Directory — x402-list.com](https://x402-list.com/)
- [The x402 Foundation Activated a 27-Year-Old Internet Code. 200 Million Transactions Later, the Real Volume Is Still Tiny. — Yahoo Finance](https://finance.yahoo.com/markets/crypto/articles/x402-foundation-activated-27-old-152440828.html)
- [Introducing the Machine Payments Protocol — Stripe](https://stripe.com/blog/machine-payments-protocol)
- [x402 vs. Stripe MPP — WorkOS](https://workos.com/blog/x402-vs-stripe-mpp-how-to-choose-payment-infrastructure-for-ai-agents-and-mcp-tools-in-2026)
- [Announcing Agent Payments Protocol (AP2) — Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)
- [FIDO Alliance to Develop Standards for Trusted AI Agent Interactions](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/)
- [Visa Trusted Agent Protocol (TAP): 2026 Guide — Paz.ai](https://www.paz.ai/glossary/visa-trusted-agent-protocol)
- [Agent Commerce Protocol (ACP) — Virtuals Protocol Whitepaper](https://whitepaper.virtuals.io/about-virtuals/agent-commerce-protocol-acp)
- [MCP Server Ecosystem Statistics 2026 — Presenc AI](https://presenc.ai/research/mcp-server-ecosystem-statistics-2026)
- [The State of MCP Monetization in 2026 — MCP Marketplace](https://mcp-marketplace.io/blog/state-of-mcp-monetization-2026)
- [Make money publishing your Actors on Apify Store](https://help.apify.com/en/articles/8684010-make-money-publishing-your-actors-on-apify-store)
- [AI Coding Agents Still Write Your SDK's Old API — SDKProof, Jul 2026](https://earezki.com/ai-news/2026-07-20-ai-coding-agents-still-write-your-sdks-old-api-so-i-built-a-type-checker-to-measure-it/)
- [Announcing Stack Overflow for Agents — Stack Overflow, Jun 2026](https://stackoverflow.blog/2026/06/10/announcing-stack-overflow-for-agents/)
- [Context7 MCP by Upstash](https://www.augmentcode.com/mcp/context7)
- [Best Search Tools for AI Agents in 2026 — Firecrawl](https://www.firecrawl.dev/blog/best-search-tools-for-agents)
- [2026 Know Your Agent: Agent Identity Infrastructure — Tiger Research](https://reports.tiger-research.com/p/2026-know-your-agent-eng)
