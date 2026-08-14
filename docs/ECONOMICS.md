# Economics

Every number here is either **measured**, **quoted from a vendor**, or
**modelled**. Each is labelled. Do not let the modelled ones drift into being
treated as forecasts.

---

## The unit economics

### Revenue

```
Revenue = paid requests x average price
```

Fixed pricing, chosen for legibility over optimization:

| Endpoint | Price | Why this number |
|---|---|---|
| `GET /v1/delta` | **$0.05** | Roughly 1/10th of the token cost it saves. Cheap enough to be an obvious yes, high enough to matter at volume. |
| `POST /v1/manifest` | **$0.15** | Batch of up to 50. Priced at 3x a single call for up to 50x the work — volume discount that still clears our cost. |
| `GET /v1/check` | **free** | Loss leader. Makes the MCP server worth installing and creates the upsell surface. |

**Why not usage-based pricing?** Because the buyer is a machine deciding in
milliseconds whether to call. "$0.05" is a decision it can make instantly.
"$0.0003 per token of release notes analyzed" is not. We revisit this only if
fixed pricing demonstrably leaves money on the table.

### Costs

| Cost | Amount | Notes |
|---|---|---|
| Data sources | **$0.00** | npm, PyPI, GitHub, OSV.dev — all free and public |
| Hosting (phase 1) | **$0.00** | Your Mac Mini, already running 24/7 |
| Hosting (phase 2) | **~$6/mo** | Hetzner CX22 or equivalent, if traffic justifies it |
| Domain | **~$1/mo** | ~$12/year |
| Storage | **~$0.00** | SQLite. The entire Bazaar dataset we collected is 7MB; our cache is smaller. |
| Bandwidth | **~$0.00** | Responses are 2–20KB of JSON |
| x402 facilitator | **$0.00** | Public testnet facilitator is free; Coinbase CDP charges no fee on Base at time of writing — **verify before mainnet** |
| Gas fees | **$0.00 to us** | Under the `exact` scheme the payer authorizes the transfer; we do not submit the transaction |
| **LLM (optional)** | **$0.02–0.15 per NEW version pair, then $0 forever** | The only real variable cost |

### The cache is the business

This is the mechanic that makes the margin work, so it is worth being precise
about.

The delta between `react@18.2.0` and `react@19.0.0` is a **permanent fact**. It
will never change. We compute it once and serve it forever.

```
First serve of a version pair:   ~$0.02–0.15   (LLM tokens)
Every subsequent serve:          ~$0.0001      (one SQLite read)
```

Version pairs are finite and follow a brutal power law — a few thousand pairs
will cover the overwhelming majority of real traffic. So:

| Stage | Cache hit rate | Gross margin |
|---|---|---|
| Month 1 (cold) | ~20% | **~60%** |
| Month 3 | ~75% | **~88%** |
| Steady state | ~95% | **~97%** |

**Measured today:** with `LLM_ENABLED=false` (the default), marginal cost per
request is effectively **$0.00** and gross margin is ~100%. The deterministic
tier is genuinely free to run.

---

## Revenue by volume

At $0.05/call, with the LLM enabled and a 90% cache hit rate.

| Paid requests/mo | Revenue | LLM cost | Infra | Gross profit | Margin |
|---:|---:|---:|---:|---:|---:|
| 10 | $0.50 | $0.60 | $0 | **–$0.10** | negative |
| 100 | $5.00 | $1.20 | $0 | **$3.80** | 76% |
| 1,000 | $50.00 | $6.00 | $0 | **$44.00** | 88% |
| 10,000 | $500.00 | $22.00 | $6 | **$472.00** | 94% |
| 100,000 | $5,000.00 | $110.00 | $12 | **$4,878.00** | 98% |

**All five rows are arithmetic, not forecasts.** The only honest statement about
them is the one below.

---

## Calibration: what these numbers mean against the real market

I measured the actual x402 market on 7 August 2026 by pulling the complete
Bazaar catalog (see [../MARKET_RESEARCH.md](../MARKET_RESEARCH.md)):

| Benchmark | Reality |
|---|---|
| **Entire independent x402 seller economy** | ~$11,700/month, all sellers combined |
| **Best independent operator** | ~$872/month |
| **Tavily's x402 endpoint** | ~$554/month |
| **Services with ≥1,000 calls/month** | 26 out of 14,128 |

Now re-read the table above with that in mind:

- **1,000 requests/month ($50)** would put us in the **top 0.2%** of x402 sellers.
- **10,000 requests/month ($500)** would make us the **single largest independent
  operator on x402**, by a wide margin.
- **100,000 requests/month ($5,000)** would be roughly **40% of the entire
  current x402 economy**, flowing through one service.

That last row is not a target. It is a demonstration that the x402 channel alone
cannot get us there in 2026.

---

## Three scenarios

### Conservative — the base case

**What happens:** The MCP server gets modest organic adoption. Almost nobody
pays, because most coding agents run inside a human's Claude or Cursor
subscription and have no wallet.

| Month | MCP installs | Free calls/mo | Paid calls/mo | Revenue | Costs | Net |
|---|---|---|---|---|---|---|
| 1 | 20 | 400 | 0 | $0 | $1 | **–$1** |
| 3 | 150 | 4,000 | 20 | $1 | $3 | **–$2** |
| 6 | 400 | 12,000 | 100 | $5 | $8 | **–$3** |
| 12 | 1,200 | 40,000 | 500 | $25 | $15 | **+$10** |

**Year 1 total: roughly break-even, in the ±$50 range.**

**Is this failure?** No — and this matters. You would have built a real service
with 1,200 users, learned what agents actually need, and spent under $50 to find
out. That is a cheap, honest education. The failure mode is not "small revenue";
it is "spent a year and learned nothing".

### Moderate — a real niche tool

**What happens:** The MCP server gets picked up in a few "best MCP servers"
roundups. A handful of CI teams and agent-fleet operators hit it programmatically.

| Month | MCP installs | Free calls/mo | Paid calls/mo | Revenue | Costs | Net |
|---|---|---|---|---|---|---|
| 1 | 50 | 1,000 | 0 | $0 | $1 | **–$1** |
| 3 | 600 | 15,000 | 200 | $10 | $6 | **+$4** |
| 6 | 2,500 | 60,000 | 1,500 | $75 | $18 | **+$57** |
| 12 | 8,000 | 200,000 | 8,000 | $400 | $45 | **+$355** |

**Year 1 total: roughly $1,500 revenue, ~$1,200 profit.**

At month 12 this would be the largest independent x402 seller in existence. Sit
with how modest $400/month is, and how much would have to go right to reach it.

### Aggressive — requires something outside our control

**What happens:** Agent-native payments actually take off in 2026 as the
protocol backers expect. Autonomous coding fleets become normal and carry
wallets. We are early and well-positioned.

| Month | MCP installs | Free calls/mo | Paid calls/mo | Revenue | Costs | Net |
|---|---|---|---|---|---|---|
| 3 | 2,000 | 50,000 | 2,000 | $100 | $12 | **+$88** |
| 6 | 15,000 | 400,000 | 25,000 | $1,250 | $60 | **+$1,190** |
| 12 | 60,000 | 2,000,000 | 150,000 | $7,500 | $200 | **+$7,300** |

**Year 1 total: roughly $30,000 revenue.**

**Be clear about what this scenario assumes:** that the agentic payments market
grows more than 10x and we capture a large share. That is not something we
control or can execute toward. It is a bet on the ecosystem. Treat it as the
upside tail, not the plan.

---

## Where revenue actually comes from, ranked

Given the measured market, in likelihood order:

1. **Card-billed API access** for CI systems and agent fleets. Boring, proven,
   requires adding Stripe. **The most probable real revenue.**
2. **Apify Store**, packaging the engine as an actor. The only channel with
   published solo-dev revenue ($1k–$10k/month for top creators, 80% share).
3. **x402**, if and only if agent-native payments grow. Cheap optionality.
4. **Sponsorship or acquisition** of a widely-installed MCP server. Real, but
   not something to plan around.

The MVP ships #3 because it is nearly free and positions us correctly. **Do not
mistake that for a bet on #3 being the revenue.**

---

## Break-even

With `LLM_ENABLED=false` and hosting on the Mac Mini, **fixed costs are ~$1/month**
(the domain). Break-even is **20 paid calls a month**.

With the LLM enabled at the default $1/day cap, worst-case fixed costs are
$31/month, and break-even is **620 paid calls a month**.

**Recommendation: run with the LLM off until paid volume justifies it.** The
deterministic tier produces genuinely useful, cited output — we verified that
against React 19 — and it costs nothing.

---

## The number to actually watch

Not revenue. **Calls per unique payer.**

From the Bazaar data, that single metric separates real demand from tourism:

| Service | Payers | Calls | Calls/payer | Verdict |
|---|---|---|---|---|
| `api.onesource.io` | 641 | 1,018 | **1.6** | Discovery, not demand |
| `x402.tavily.com` | 422 | 55,372 | **131** | Real, repeated demand |

Six hundred and forty-one agents found onesource, paid once, and never returned.
That is a tasting menu, not a customer base.

**If our calls-per-payer stays below ~5, we do not have a business regardless of
what revenue says.** If it climbs above 20, we have something real even at tiny
revenue. Check it monthly:

```bash
curl localhost:4021/admin/stats
```
