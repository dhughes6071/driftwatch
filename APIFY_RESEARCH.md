# Apify Store — Measured Opportunity Analysis

**Date: 7 August 2026**
**Method: pulled the Apify Store API — 12,841 actors sampled (of 44,173 listed), with 30-day user counts, run counts, ratings, and pricing models.**

Raw data: `research/data/apify_store_2026-08-07.json` · scripts: `research/data/an*.py`

---

## Why Apify, and why measure it

Apify is the only channel in this space with **published, verified solo-developer
revenue**: top independent creators exceed $10,000/month, many exceed $1,000/month,
and developers keep 80%. Apify supplies the buyers, the billing, the payouts, and
the discovery — which satisfies your "don't make me chase individual customers"
constraint.

So rather than guess at a niche, I measured the store the same way I measured the
x402 Bazaar.

---

## The shape of the market

| Measure | Value |
|---|---|
| Actors sampled | 12,841 |
| With any users in the last 30 days | 11,348 (88.4%) |
| **With ≥100 users/30 days** | **578 (4.5%)** |
| With ≥1,000 users/30 days | 84 (0.65%) |
| Pricing model | 12,355 pay-per-event · 486 free |

Demand is far more concentrated than the listing count suggests — the same
power law as x402, but with a **much larger base**. Where the entire independent
x402 economy is ~$11,700/month, Apify's top single actor alone serves 35,812
users in 30 days.

### Demand per actor, by category

| Category | Actors | Users (30d) | Users per actor |
|---|---:|---:|---:|
| SOCIAL_MEDIA | 3,403 | 388,170 | 114.1 |
| VIDEOS | 843 | 89,749 | 106.5 |
| TRAVEL | 586 | 55,509 | 94.7 |
| LEAD_GENERATION | 5,086 | 310,266 | 61.0 |
| AI | 1,663 | 91,664 | 55.1 |
| **JOBS** | **1,276** | **69,832** | **54.7** |
| SEO_TOOLS | 969 | 36,163 | 37.3 |
| DEVELOPER_TOOLS | 4,187 | 92,829 | 22.2 |
| ECOMMERCE | 2,458 | 45,763 | 18.6 |
| REAL_ESTATE | 1,227 | 15,919 | 13.0 |

---

## Two findings that killed my first two ideas

### 1. The biggest "weak incumbent" gaps are legally fraught

The most tempting signal in the data is high-demand actors with poor ratings:

| Actor | Users/30d | Rating |
|---|---:|---:|
| `apify/instagram-reel-scraper` | 10,539 | **3.79★** |
| `apify/instagram-hashtag-scraper` | 9,113 | **3.39★** |
| `apify/instagram-comment-scraper` | 4,486 | **3.65★** |
| `apimaestro/linkedin-company-employees` | 1,602 | **2.93★** |
| `pipelinelabs/lead-scraper-apollo-zoominfo` | 1,268 | **2.80★** |
| `apify/facebook-reels-scraper` | 697 | **2.33★** |

**The bad ratings are the opportunity and the warning at once.** These score
poorly *because* the platforms fight back — Instagram, LinkedIn, and Facebook
all prohibit scraping in their terms, and LinkedIn has litigated it. The low
ratings reflect actors that break constantly under anti-bot pressure.

Filtering out platforms with prohibitive terms removes **356 of the 578**
high-traction actors — 62% of the visible opportunity. We are not building
there, for the same reason we ruled out reselling licensed data on x402.

### 2. The best legitimate weak incumbents are **free**

The next tempting group — poorly-rated, legitimate, high-demand:

| Actor | Users/30d | Runs/30d | Rating | Price |
|---|---:|---:|---:|---|
| `apify/screenshot-url` | 901 | 95,641 | 3.69★ | **FREE** |
| `apify/playwright-scraper` | 996 | 172,286 | 3.58★ | **FREE** |
| `lukaskrivka/article-extractor-smart` | 273 | 39,130 | 4.15★ | **FREE** |
| `apify/rag-web-browser` | 28,260 | 1,244,934 | 4.62★ | **FREE** |

Users tolerate a 3.6★ tool when it costs nothing. A paid competitor would have
to be dramatically better, not marginally better. **A weak-incumbent signal is
worthless when the incumbent is free** — that is the trap in this dataset, and
it is invisible unless you check the pricing field.

---

## What survives: job listings from company career sites

Filter for **legitimate sources**, **real demand**, **weak incumbents**, and
**paid pricing**, and one niche stands out.

| Actor | Users/30d | Runs/30d | Rating | Model |
|---|---:|---:|---:|---|
| `fantastic-jobs/career-site-job-listing-api` | **1,306** | **109,002** | **3.98★** | pay-per-event |
| `johnvc/Google-Jobs-Scraper` | 382 | — | **3.62★** | pay-per-event |
| `agentx/all-jobs-scraper` | 262 | — | **3.69★** | pay-per-event |
| `fantastic-jobs/advanced-linkedin-job-search` | 3,537 | — | **3.62★** | pay-per-event |

The whole JOBS category has weak incumbents (54.7 users/actor, ratings
clustered in the 3.6–4.0 range) and 69,832 monthly users.

### The part that makes this genuinely attractive

Modern applicant tracking systems publish **documented, public job-board APIs**
that exist specifically to be consumed. I verified this today:

```
greenhouse   HTTP 200   551 jobs   boards-api.greenhouse.io/v1/boards/stripe/jobs
ashby        HTTP 200   123 jobs   api.ashbyhq.com/posting-api/job-board/ramp
workable     HTTP 200            apply.workable.com/api/v1/widget/accounts/...
```

**This is not scraping.** These are stable, public, intended-for-consumption
endpoints. Which means:

| Property | Why it matters |
|---|---|
| **No ToS violation** | Companies publish these so their jobs get syndicated |
| **No anti-bot arms race** | The reason competitors sit at 3.6–4.0★ is that they scrape HTML; we would not |
| **Low maintenance** | JSON APIs are stable; scrapers break weekly |
| **Beginner-appropriate** | HTTP + JSON, no browser automation, no proxies |
| **Reuses what we built** | `src/sources/http.ts`, the SQLite cache, and the polite-fetch patterns transfer directly |
| **Runs on a Mac Mini** | No headless browsers, no proxy budget |

The incumbent at 3.98★ with 109,000 runs a month is beatable on reliability
alone, because reliability is exactly what HTML scraping cannot give you and a
JSON API can.

---

## Honest risks

| Risk | Assessment |
|---|---|
| **Coverage is the whole game** | Value scales with how many companies you cover. A few hundred is a toy; several thousand is a product. This is the real work. |
| Incumbent has a head start | `fantastic-jobs` claims 175k+ career sites. We would start far behind on breadth and must win on quality and freshness first. |
| ATS vendors could restrict access | Possible but unlikely — syndication is the point of these endpoints. Mitigate by spreading across four+ ATS vendors. |
| Apify platform dependence | Real. They changed rental pricing in 2026 and are sunsetting compute-time pricing in October. Treat Apify as a channel, not a foundation. |
| Job data is commoditized | True, which caps the price. This is a $100s/month opportunity, not a $10,000s one, unless coverage gets genuinely large. |

---

## Recommendation

Build an **ATS job-board aggregator**: pull from Greenhouse, Ashby, Lever, and
Workable public APIs, normalize to one schema, refresh on a schedule, and
publish on Apify with pay-per-event pricing.

**Why this and not the higher-traffic niches:** the higher-traffic niches are
either prohibited by the platform's terms or already served free. This one is
legitimate, technically boring in the way that wins, and has a measurably weak
incumbent at real volume.

**Expected outcome, stated plainly:** low hundreds of dollars per month within
a few months *if* coverage gets to a few thousand companies. Not life-changing.
But it is the fastest legitimate path to a first real dollar in this dataset,
and it is genuinely automatable.
