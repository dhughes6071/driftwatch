# Month 1 — Decide what this actually is

**Cost so far: ~$12. Everything this month stays under $50 unless you approve
otherwise.**

Weeks 1 and 2 built it and published it. This month you find out what you have,
and make one honest decision about whether to continue.

---

## The month in one sentence

> Gather enough real evidence to decide, without flinching, whether to invest
> more, change direction, or stop.

---

## Week 3 — Improve what usage tells you to

By now you have real data on what people ask for. Let it drive the work, not
your assumptions.

### Look at the actual queries

```bash
sqlite3 data/driftwatch.db \
  "SELECT ecosystem, name, COUNT(*) c FROM deltas GROUP BY 1,2 ORDER BY c DESC LIMIT 30;"
```

Two things to look for:

1. **Packages people ask about that we answer badly.** Fix those first.
2. **Ecosystems we don't support.** If half the requests are for Go, Rust, or
   Maven, that is a roadmap, not a complaint.

### Improve the top failure class

Whatever the data says. Likely candidates, in rough value order:

| Improvement | Effort | Value |
|---|---|---|
| CHANGELOG.md fallback when GitHub Releases are absent | Medium | **High** — the biggest coverage gap |
| A third ecosystem (Go modules or crates.io) | Medium | High if demand shows it |
| Better before/after code fragments | Needs the LLM | High |
| Transitive dependency analysis | High | Medium |
| Framework-specific migration guides | High | Medium |

### Decide on the LLM

**APPROVAL NEEDED if you enable it — up to $31/month, hard capped.**

Enable it only if the honest answer to *"is answer quality what's limiting
growth?"* is yes. If usage is the constraint, better answers won't fix that,
and you would be spending money to avoid a harder question.

See [docs/COSTS.md](docs/COSTS.md).

---

## Week 4 — Add the channel most likely to actually pay

The market data is clear that x402 will not carry revenue in 2026. Two channels
plausibly will. Pick **one**.

### Option A — Apify Store (recommended)

**The only channel with published, verified solo-developer revenue**: top
independent creators exceed $10,000/month, many exceed $1,000/month, developers
keep 80%. Apify supplies buyers, billing, payouts, and discovery — no human
selling.

Package the engine as an Actor. Reuses everything already built.

**Why I'd pick this:** it is the fastest path to a first real dollar, and a real
dollar from a stranger tells you more than any amount of analysis.

### Option B — Stripe billing for the API

Prepaid credit packs ($10 for 250 calls) or a monthly plan. Per-call card
billing does not work at $0.05 — Stripe's $0.30 minimum eats it.

**When:** only once someone has actually asked how to pay you. Building billing
before demand is a classic way to spend a week feeling productive.

---

## The end-of-month review

Answer these with numbers, not impressions.

### The four questions

**1. Is anyone using it?**

```bash
curl localhost:4021/admin/stats
```

| Signal | Read |
|---|---|
| < 50 total calls | Distribution problem, not a product problem |
| 50–1,000 | Something is working; find out what |
| > 1,000 | Real early traction |

**2. Do they come back?** *(the one that matters most)*

```
calls per unique caller = requests / unique callers
```

| Value | Verdict |
|---|---|
| < 2 | Tourism. Same shape as the 641-payer service that got 1,018 calls. |
| 2–5 | Weak signal |
| 5–20 | Real usage forming |
| > 20 | Genuine repeat demand — only 32 of 14,128 x402 services reach this |

**3. Has anyone paid?**

Honestly, probably not, and that was the base case. What matters is whether
anyone *asked how to*. One person asking how to pay is worth more than a
thousand free calls.

**4. What did you learn that you couldn't have guessed?**

The most valuable output of month one. Write it down.

---

## The decision

Pick one. Be honest — the sunk cost is about $12 and a few weekends.

### Continue as-is
**If:** calls/caller > 5, usage growing, and you still find it interesting.
**Then:** month 2 is more ecosystems, the Apify channel, and a Stripe path.

### Pivot the product, keep the engine
**If:** people use it but for something adjacent — package security, license
checks, dependency health.
**Then:** follow the usage. The sources, cache, MCP layer, and payment plumbing
all transfer.

### Pivot the channel, keep the product
**If:** the answers are good but nobody finds it.
**Then:** the problem is distribution. Go all-in on Apify, or on writing that
earns attention. Do not rebuild a product that already works.

### Stop
**If:** calls/caller < 2 after real distribution effort, and you have lost
interest.
**Then:** stop cleanly. Withdraw any funds, back up the database, write down
what you learned, publish the market research as a standalone piece — it has
genuine value on its own.

**Stopping here is a good outcome, not a failure.** You will have built and
shipped a real service, learned how agent payments actually work, and produced
a dataset nobody else has — for about $12. Most people spend far more to learn
far less.

---

## What "working" looks like at month 3, if it works

Not a forecast. A picture of the modest, real thing this could become:

| Metric | Plausible |
|---|---|
| MCP installs | 500–2,000 |
| Calls/month | 20,000–100,000 (mostly free) |
| Paid calls/month | 200–2,000 |
| Revenue | $10–$100/month |
| Costs | $1–$30/month |
| Your time | 2–4 hours/week |

**$100/month is not a business.** It is a signal — evidence that a real service
exists that people return to, run by one person, running itself. That signal is
what you would then decide whether to scale.

The alternative outcome is $0/month and 1,200 users who like it. That is also
information, and it cost almost nothing to obtain.

---

## Costs at end of month 1

| Item | Spent |
|---|---|
| Domain | $12/year |
| Hosting | $0 (Mac Mini) |
| Data | $0 (all free public APIs) |
| LLM | $0, or up to $31 if you approved it |
| **Total** | **$12–$43** |

---

## What happens next

Update [PROJECT_STATUS.md](PROJECT_STATUS.md) with real numbers — not estimates —
and write the four-part summary:

**WHAT WE DID · WHAT IT COST · WHAT WE LEARNED · WHAT HAPPENS NEXT**

Then make the decision above. One decision, made honestly, on evidence.
