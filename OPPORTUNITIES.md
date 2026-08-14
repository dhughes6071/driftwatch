# 20 Business Opportunities — Analysis & Ranking
**Date: 7 August 2026** · Companion to [MARKET_RESEARCH.md](MARKET_RESEARCH.md)

---

## How to read this document

Every revenue figure below is **hypothetical** — it is arithmetic (`requests × price`), not a forecast.
I have marked the small number of **demonstrated** market figures separately, because the difference
matters enormously and most writing in this space blurs it.

**Demonstrated market revenue, for calibration:**

| Fact | Source |
|---|---|
| Entire independent x402 Bazaar economy | **~$11,700/month** (measured, 7 Aug 2026) |
| Best independent x402 operator (`stableenrich.dev`) | **~$872/month** (measured) |
| Tavily's x402 endpoint | **~$554/month** (measured) |
| Top independent Apify Store developers | **>$10,000/month** (Apify, published) |
| Typical successful Apify Store developer | **>$1,000/month** (Apify, published) |
| Reported solo MCP-server developer range | **$500–$10,000/month** (self-reported, largely unverified) |

**Sanity anchor:** if a plan below shows $50,000/month, ask what would have to be true. Usually the
answer is "we'd have to be 4× the size of the entire current x402 economy." That is not impossible —
markets grow — but it should never be the base case.

**Scoring key** (1 = bad, 5 = excellent). "Real demand" is scored on *evidence*, not enthusiasm.

---

## Master ranking

| # | Opportunity | Real demand | Build ease | Margin | Autonomy | Discoverability | Competition (5=weak) | **Total /30** |
|---|---|---|---|---|---|---|---|---|
| **1** | **Dependency Migration Intelligence API** | 4 | 4 | 5 | 5 | 5 | 4 | **27** |
| **2** | **Package Trust / Anti-Slopsquatting API** | 4 | 5 | 5 | 5 | 5 | 3 | **27** |
| **3** | **Apify Store actor (underserved scrape niche)** | 5 | 4 | 4 | 4 | 5 | 3 | **25** |
| 4 | Agent-safe web fetch (fetch + injection scrub) | 4 | 4 | 4 | 5 | 4 | 3 | 24 |
| 5 | Live API status / outage oracle | 3 | 5 | 5 | 5 | 4 | 4 | 26 |
| 6 | Crawl-permission & AI-usage-policy oracle | 3 | 5 | 5 | 5 | 4 | 5 | 27* |
| 7 | MCP server health & trust registry | 3 | 4 | 5 | 4 | 4 | 5 | 25* |
| 8 | Public-source change detection (regulatory/procurement) | 3 | 3 | 4 | 4 | 3 | 4 | 21 |
| 9 | Sanctions / PEP screening API | 3 | 4 | 5 | 4 | 3 | 3 | 22 |
| 10 | Structured PDF / document extraction | 4 | 3 | 3 | 4 | 4 | 2 | 20 |
| 11 | Deterministic code-transform (codemod) service | 3 | 3 | 4 | 4 | 4 | 4 | 22 |
| 12 | OpenAPI spec discovery & normalization | 3 | 4 | 5 | 5 | 4 | 4 | 25 |
| 13 | License-obligation checker for generated code | 3 | 4 | 5 | 5 | 3 | 4 | 24 |
| 14 | Email / domain reputation & deliverability | 3 | 4 | 4 | 5 | 3 | 2 | 21 |
| 15 | Business-hours / holiday / timezone calendar API | 2 | 5 | 5 | 5 | 3 | 3 | 23 |
| 16 | Web-page change monitoring & diff feed | 3 | 4 | 4 | 4 | 3 | 2 | 20 |
| 17 | Entity resolution / firmographic enrichment | 4 | 2 | 2 | 4 | 4 | 2 | 18 |
| 18 | Agent-facing web search (Tavily competitor) | 5 | 2 | 2 | 4 | 4 | 1 | 18 |
| 19 | Hosted browser / sandbox compute | 4 | 2 | 2 | 3 | 4 | 1 | 16 |
| 20 | x402 ecosystem analytics & health data | 2 | 5 | 5 | 5 | 3 | 5 | 25* |

\* Scores high on mechanics but is capped by a small or non-paying buyer pool — see notes. Total score
is deliberately not the sole ranking criterion; **demand evidence and buyer budget break ties.**

---

# Detailed analysis — top candidates

## #1 — Dependency Migration Intelligence API  ⭐ RECOMMENDED

**Customer.** Coding agents and agent harnesses: Claude Code, Cursor, Windsurf, Devin-style autonomous
SWE agents, CI bots doing automated dependency upgrades (Renovate/Dependabot successors), and the
developers running them.

**The exact problem.** Every LLM is frozen at a training cutoff. Libraries are not. When an agent writes
code against a library version newer than its cutoff, it confidently emits an API that no longer exists.
The **SDKProof benchmark (July 2026)** measured this: models score 80/100 on Prisma v7 because the v6
`PrismaClient` pattern was removed, and 90/100 on Vercel AI SDK v5+ because parameters were renamed to
`inputSchema` and `maxSteps` was deleted.

The cost is not the wrong line of code — it is the **debug loop**. The agent writes it, the build fails,
it reads the error, guesses, tries again. Industry writing on this ("the Ephemeral Intelligence Gap")
describes agents spending *20 minutes of compute and token budget* brute-forcing a single breaking change
that another agent solved minutes earlier elsewhere.

**Why an AI agent would pay.** This is the crux, and it is the strongest value proposition in this
entire document: **we can prove the buyer saves more than we charge, arithmetically.**

```
Without us:  ~6 failed build/fix iterations × ~15k tokens × ~$3–15/M tokens  ≈  $0.30 – $1.50
             plus 10–20 minutes of wall-clock time
With us:     1 call, ~800 tokens of answer                                    ≈  $0.05
```

A 6–30× return on the call. An agent operator does not need to like us or trust our brand to justify
that; they need a calculator. That is the only kind of demand that survives contact with reality.

**What the service does.** Given `(ecosystem, package, from_version, to_version)` — or a whole
`package.json` / `requirements.txt` / `go.mod` — return a structured, cited answer:

- breaking changes, ranked by likelihood of affecting the caller
- removed/renamed/moved symbols, with old → new mappings
- required code edits, as concrete before/after snippets
- security advisories introduced or fixed across that range
- links to the primary source for every claim (changelog entry, release note, commit, migration guide)

**How we'd build it.** Free public inputs only: npm and PyPI registry APIs, GitHub Releases and
compare-diffs, `deps.dev`, and OSV.dev for advisories. An LLM pass converts release notes and diffs
into structured deltas. **Every result is cached permanently** — the delta between `react@18.2.0` and
`react@19.0.0` never changes. Precompute the top few thousand version pairs on the Mac Mini overnight.

**Pricing.** $0.05 per version-pair delta; $0.15 for a full manifest analysis. Fixed, not usage-based.

**Costs.** First computation of a pair: ~$0.02–0.15 in LLM tokens. Every subsequent serve: ~$0.0001
(a database read). Hosting: $0 initially (your Mac Mini), ~$6/month on a VPS later.

**Gross margin.** ~60% in month one while the cache is cold. **95%+ at steady state.** Version pairs are
finite and follow a brutal power law — a few thousand pairs will cover most traffic forever.

**Difficulty.** Medium. The engineering is ordinary; the hard part is answer *quality*, which is a
prompt-and-eval problem, not a systems problem.

**Competition.** Context7 (free, VC-backed, serves *current* docs — not deltas). Stack Overflow for
Agents (June 2026, direction unclear). Google agent skills. **Nobody currently sells version-to-version
migration deltas as a machine-callable service.** That is the gap. It is also the risk: it is a gap a
funded player could close.

**Discoverability.** Excellent, and it requires no human sales:
- MCP server published to npm and the MCP registries — this is the main channel
- x402 Bazaar listing (free)
- OpenAPI spec + `llms.txt` + `/.well-known/` metadata
- The MCP server is genuinely useful on a free tier, which is how it spreads

**Likelihood of real demand.** **High for usage, unproven for payment.** Be clear-eyed: most coding
agents today run inside a human's Claude/Cursor subscription and have no wallet. Free-tier installs
will vastly exceed paid calls at first. Paid demand comes from CI systems and autonomous agent fleets
that run unattended at volume — a smaller but real and growing cohort with actual budgets.

**Autonomy.** Very high. Scheduled crawl → precompute → serve → collect. Human input needed only for
quality spot-checks and coverage decisions.

**Hypothetical monthly revenue** (at $0.05/request):

| Paid requests/mo | Revenue | Variable cost | Gross profit |
|---|---|---|---|
| 10 | $0.50 | ~$1 (cold cache) | –$0.50 |
| 100 | $5 | ~$3 | $2 |
| 1,000 | $50 | ~$12 | $38 |
| 10,000 | $500 | ~$40 | $460 |
| 100,000 | $5,000 | ~$150 | $4,850 |

At 100,000 paid requests/month we would be roughly **40× the size of the largest independent x402
operator today**. Treat 1,000–10,000 as the realistic 12-month band, with most volume arriving free
via MCP and a small paid tail.

---

## #2 — Package Trust / Anti-Slopsquatting API

**Customer.** Coding agents at generation time; CI security gates; package-manager wrappers.

**The exact problem.** LLMs hallucinate package names. Attackers register the hallucinated names and
ship malware — "slopsquatting." An agent about to run `npm install <name>` has no cheap, deterministic
way to ask *"is this real, is it the package I actually mean, is it malicious, is it abandoned?"*

**Why an agent would pay.** Installing malware into a customer's repository is a catastrophic,
unrecoverable failure. The cost of one bad install dwarfs a fraction of a cent. Also fast: this sits in
the inner loop and must answer in <100ms, which a bundled-data service can do and a live registry
round-trip often cannot.

**What it does.** `check(ecosystem, name)` → exists / typo-distance to popular packages / download
rank / last-publish date / known advisories / maintainer-change flags / deprecation / suggested correction.

**How we'd build it.** Mirror npm + PyPI metadata and OSV.dev advisories locally; refresh nightly.
Answers served from a local index — no upstream call per request.

**Pricing.** $0.001/check, or bundled free in the MCP tier and metered on the API.

**Costs.** Storage + nightly sync only. ~$0 marginal per call.

**Margin.** ~99%.

**Difficulty.** Low — the easiest thing on this list to build well.

**Competition.** Socket.dev, Snyk (both enterprise-priced, human-sold). deps.dev and OSV are free but
require multiple calls and give no single verdict. **Weakness: our upstream data is free, so a
sophisticated buyer can do it themselves.** We sell convenience and latency, which is a thin moat.

**Real demand.** High usage, **low willingness to pay** — the natural price of this is near zero.

**Verdict.** Ties #1 on score but loses on monetizability. **Best used as a free companion tool that
makes our MCP server more installable, and as an upsell surface for #1.** Ships in the same server.

---

## #3 — Apify Store Actor in an underserved scraping niche

**Customer.** Anyone — human or agent — needing structured data from a site with no API.

**Why they pay.** The data does not otherwise exist in usable form.

**This is the only opportunity on the list with *published, verified* solo-developer revenue:**
top independent Apify creators exceed **$10,000/month**; many exceed **$1,000/month**; developers keep
80% of revenue. Apify supplies the buyers, the billing, the payouts, and the discovery. Apify is
itself now x402-accessible (`agi.apify.com`, 34 unique payers measured).

**Downside relative to #1.** It is platform-dependent (Apify sets the rules and took a knife to rental
pricing in 2026), it is not agent-native, scrapers break constantly under maintenance load, and the
legal surface is real — we would only build against sites whose terms permit it.

**Verdict. Strong recommended second channel, not the first build.** Once the core engine of #1 exists,
packaging a related capability as an Apify actor is a cheap way to reach buyers who already pay.

---

## #5 — Live API status / outage oracle

Aggregate the status pages and health endpoints of the top few hundred developer APIs into one
machine-readable feed, so an agent can decide *retry vs. fail vs. route around* instead of burning
retries into a dead endpoint. Trivial to build, ~99% margin, fully autonomous, and genuinely useful.

**Why not #1:** the willingness to pay is very low (status pages are free and public), and the value
per call is small. A good free add-on; a weak standalone business.

## #6 — Crawl-permission & AI-usage-policy oracle

`may_i_crawl(url, purpose)` → robots.txt verdict, AI-training policy, detected ToS restrictions,
rate-limit guidance. Legal pressure on AI crawling is rising fast, and agents currently guess. Free
inputs, near-100% margin, no real competitor.

**Why not #1:** demand is anticipated rather than demonstrated, and a wrong answer carries legal
implication we would not want to underwrite as a beginner operation. Revisit in 6–12 months.

## #7 — MCP server health & trust registry

I measured the equivalent problem on x402 directly (13% of registered endpoints hard-broken, 3%
accidentally free), and community reporting puts MCP install-failure rates at 30–50%. The data is
genuinely missing and we could produce it credibly.

**Why not #1:** the buyers are directory operators and hobbyist builders. **They have no budget.**
Correct problem, wrong customer.

## #20 — x402 ecosystem analytics

I have already built most of this dataset while doing the research in this repo. It is genuinely novel
and nobody publishes it well.

**Why not #1:** the total customer base is people building on a $12k/month market. **Selling shovels
into a market with no gold is worse than mining.** Best use: publish it free as credibility and
marketing for whatever we actually sell.

---

# Opportunities 8–19 — summary judgments

| # | Opportunity | Why it's interesting | Why it's not the pick |
|---|---|---|---|
| 4 | **Agent-safe web fetch** — fetch a URL, strip prompt-injection payloads, return clean LLM-ready text with citation anchors | Real and growing security need; agents ingest hostile web content constantly | Jina Reader is free, Firecrawl is funded; "is your scrubbing good enough" is an unwinnable trust argument for an unknown vendor |
| 8 | **Public-source change detection** (regulatory, procurement, recalls) | History compounds into a moat latecomers cannot replicate | Slow to reach useful coverage; buyers are enterprises requiring human sales |
| 9 | **Sanctions / PEP screening** | Free authoritative data (OFAC, UN, EU); compliance budgets are real; agent commerce will need it | **Liability.** A missed hit is our problem. Not an appropriate risk for a first business |
| 10 | **Structured PDF extraction** | Large, durable demand | Compute-heavy, low margin, brutally crowded |
| 11 | **Deterministic codemod service** | Natural sibling to #1 — sell the *fix*, not just the diagnosis | Higher risk (we're mutating customer code); better as a phase-2 upsell on #1 |
| 12 | **OpenAPI spec discovery & normalization** | Cheap, high margin, agents need machine-readable specs constantly | Low value per call; strong free-tier product, weak business |
| 13 | **License-obligation checker** | Deterministic, real legal need, free inputs | Modest call volume; buyers want a human-signed opinion, not an API |
| 14 | **Email/domain reputation** | Steady demand | Crowded, commoditized, and adjacent to spam tooling — reputationally wrong for us |
| 15 | **Business hours / holiday / timezone API** | Genuinely hard for LLMs; cheap to run | Very low willingness to pay; largely solved by free libraries |
| 16 | **Web page change monitoring** | Recurring revenue shape | Crowded (Visualping et al.); storage and bandwidth grow linearly with customers |
| 17 | **Entity resolution / firmographics** | Proven x402 demand — this is what the #1 operator resells | **Requires expensive licensed upstream data.** Reselling it usually breaches the upstream ToS. Ruled out on both cost and ethics |
| 18 | **Agent web search** | The single largest proven agent-tooling demand | Tavily raised $25M; Exa, Brave, Firecrawl are funded. We cannot win a crawl-infrastructure war from a Mac Mini |
| 19 | **Hosted browser / sandbox compute** | Real demand (Playwright is the #1 MCP server) | Capital-intensive, thin margin, Browserbase is entrenched |

---

## Cross-cutting conclusions

**Three ideas were ruled out on ethics or risk, not economics:**
- **#17 (reselling licensed data)** — the proven x402 model, but it usually violates upstream terms.
- **#9 (sanctions screening)** — real budget, unacceptable liability for a first venture.
- **#14 (email reputation)** — adjacent to spam infrastructure.

**The pattern among the winners:** free or public upstream inputs, permanent caching so marginal cost
collapses toward zero, a value proposition the buyer can verify with arithmetic, and a distribution
channel (MCP) that reaches users without any human selling.

**The pattern among the losers:** expensive upstream data, funded incumbents, or a correct problem
attached to a customer with no money.

→ Selection and rationale: [DECISION.md](DECISION.md)
