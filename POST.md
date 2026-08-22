# I measured the entire x402 economy. It's $11,748 a month.

There is a lot of writing about AI agents paying each other for services. The
protocol backing most of it — x402, revived by Coinbase from an HTTP status
code reserved in 1997 and never used — has real infrastructure, real SDKs, and
headline numbers in the hundreds of millions.

I wanted to build a business on it, so I went looking for the demand rather
than the headlines. What I found changed what I built.

**Everything below is measured, and the raw data and scripts are linked at the
bottom so you can check me.**

---

## The measurement

On 7 August 2026 I pulled the complete Coinbase CDP x402 Bazaar discovery
catalog — every service registered as discoverable. The Bazaar publishes, per
service, the 30-day call count and the number of unique payers. That is an
unusually honest thing for a marketplace to expose, and it makes the whole
economy countable.

```
Registered discoverable services              14,128
  with ≥100 paid calls in 30 days                287   (2.0%)
  with ≥1,000 paid calls in 30 days               26   (0.18%)

Total 30-day GMV, every seller combined     $11,748
```

Eleven thousand, seven hundred and forty-eight dollars. That is the entire
independent x402 seller economy, worldwide, for a month.

The best-performing independent operator grosses about **$872/month**. Tavily's
x402 endpoint — the most widely adopted single service by unique payers —
grosses about **$554/month**.

## But the public numbers say $600M

They do, and they aren't lying exactly. They're just measuring something else.

- **Coinbase is 58.7% of all-time settlement volume.** That is CDP's own
  internal API usage, not a third-party marketplace.
- **Roughly half of x402 transactions are artificial** — self-dealing, where
  the same wallet is buyer and seller, and wash trading, where a seller funds
  the buyer wallet that immediately returns the funds.
- **Much of the 2025 spike was a meme coin.** PING's "pay-to-mint" mechanic
  drove transactions up over 10,000% in a week. Wallet retention then fell from
  ~87% to ~5%.

Strip those out and what remains for someone building a service is the number
above.

## The most interesting thing in the data

Look at the shape of one well-built service — 25 clean Ethereum RPC endpoints:

```
641 unique payers  →  1,018 total calls     (1.6 calls per payer)
```

Six hundred and forty-one different agents found it, paid once, and never came
back. That is not a customer base. That is a tasting menu.

Now compare it to the few services with actual demand:

```
x402.tavily.com    422 payers  →  55,372 calls    (131 per payer)
stableenrich/exa   277 payers  →  12,085 calls     (44 per payer)
```

**Only 32 services out of 14,128 clear the bar of "≥20 unique payers AND ≥10
calls per payer."** That is 0.23% of the catalog. Twenty-two services have 300+
payers but fewer than 2 calls each — pure tourism.

If you build here, calls-per-payer is the only metric worth watching. Revenue
will flatter you; repeat usage won't.

## What the 32 survivors have in common

Almost all of them resell premium APIs that agents cannot otherwise buy. The
top independent operator proxies People Data Labs, FullEnrich, Exa, Firecrawl,
and Clado on a per-call basis. Others resell flight search, or neural search.

The actual business being done on x402 is **arbitrage on account-creation
friction**. An autonomous agent has a wallet but no credit card, no legal
entity, and no ability to sign a SaaS contract. Selling it per-call access to
something that normally requires an account is the one model that demonstrably
works.

It is also, in most cases, a breach of the upstream provider's terms of
service. I ruled it out for that reason and I'd encourage you to as well.

## The catalog is mostly a graveyard

I probed 350 registered endpoints directly:

```
73.4%   return HTTP 402 correctly
 9.1%   405 — usually POST-only, probably fine
 7.4%   404 — dead route
 4.3%   DNS / TLS failure — service gone
 2.9%   200 OK with no paywall — accidentally free
 1.1%   500
```

So about 13% are hard-broken, and another 3% are giving their service away by
mistake.

---

## The same exercise on a market that works

To check I wasn't just describing "new marketplace is small", I ran the same
measurement on Apify — a mature scraping marketplace where solo developers
publicly report $1,000–$10,000/month.

I pulled 11,348 actors with 30-day user counts, ratings, and pricing. Two
findings were worth the effort:

**1. The most attractive-looking gaps are the ones you can't legally take.**
Sorting by "high demand, weak incumbent" surfaces Instagram at 3.39★ with 9,113
monthly users, LinkedIn at 2.93★, Facebook at 2.33★. Tempting — until you
notice the bad ratings *are* the anti-bot difficulty, and those platforms
prohibit scraping. Filtering them removes 356 of 578 high-traction actors. 62%
of the visible opportunity, gone.

**2. The best legitimate weak incumbents are free.** Of the 578 actors with
≥100 monthly users, 15 are free — and they include the poorly-rated ones you'd
most want to displace. `apify/screenshot-url`: 901 users, 95,641 runs, 3.69★,
$0. Users tolerate a mediocre free tool. A paid competitor needs to be
dramatically better, not marginally better.

**That second one is invisible unless you check the pricing field.** I nearly
built against it.

---

## What I'd tell someone starting here

- **x402 is a good protocol with almost no demand behind it yet.** Implementing
  it costs a few days and near-zero ongoing money, so it's cheap optionality.
  Building a business that depends on x402 revenue in 2026 means competing for
  a pool smaller than one senior engineer's salary.
- **Measure the marketplace before you build for it.** Both of these datasets
  were a few hours of work against public APIs. Both changed my plan.
- **Watch repeat usage, not revenue.** 641 payers and 1,018 calls is a worse
  business than 44 payers and 12,085 calls, and only one of those looks good in
  a screenshot.

I did build something in the end — an MCP server that tells coding agents what
broke between two versions of a dependency, and a job-listing actor that reads
ATS APIs instead of scraping HTML. Whether anyone wants either is still an open
question, and I'll write that up when I know.

But the measuring was the useful part, and nobody else seemed to have published
it.

---

## Data and method

Everything is reproducible:

- `research/data/x402_bazaar_slim_2026-08-07.json` — 14,128 services with call
  counts, unique payers, pricing
- `research/data/apify_store_2026-08-07.json` — 11,348 actors with usage,
  ratings, pricing model
- `research/data/analyze*.py`, `an*.py` — the analysis
- `research/data/pull_all.py`, `pull_apify.py` — the collectors
- `research/data/liveness.py` — the endpoint probe

Both catalogs come from public, unauthenticated APIs:
`api.cdp.coinbase.com/platform/v2/x402/discovery/resources` and
`api.apify.com/v2/store`.

Figures are a snapshot of 7 August 2026 and will drift.
