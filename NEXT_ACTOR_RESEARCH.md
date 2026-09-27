# Next Apify Actor — Measured Candidates

**Date: 26 September 2026**
**Method: pulled the top 9,940 Apify Store actors by popularity (every actor past that rank has ~0 users), with 7/30/90-day users, failure rates, ratings, and live pay-per-event prices.**

Raw data: `research/data/apify_store_2026-09-26.json` · pull script: `research/data/pull_apify_full.py`

Same filters as [APIFY_RESEARCH.md](APIFY_RESEARCH.md): no platforms whose terms forbid scraping,
no bulk personal-contact harvesting, and a paid incumbent (a weak free incumbent is not an opening).

---

## Headline

Of **754,162** monthly users across the store, only **~74,600 (10%)** are on targets that pass the
legitimacy filter. The rest is Instagram, TikTok, Google Maps, LinkedIn, Amazon and friends.

## Recommendation: a Workday jobs actor

| | |
|---|---|
| Workday actors | 24, with **398 users/30d** — tied with Greenhouse (400) as the biggest single-ATS niche, ahead of Lever (250) and Ashby (196). (All four counts include multi-vendor actors that mention the name.) The difference: we already cover Greenhouse; we have zero Workday coverage. |
| Leaders | fantastic-jobs 130 users @ $2/1k · johnvc 71 @ $0.10/1k (**4× week-on-week growth**) · shahidirfan 27 · jobo.world 20 |
| Data source | Workday's public career-site JSON endpoint (`POST {tenant}.wdN.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`). Verified live today: NVIDIA 200 OK, Salesforce 200 OK. No login, no key, no browser. |
| Terms | Career sites publish sitemaps and their robots.txt disallows only `/talentcommunity/` and `/refreshFacet/`. Same "published to be syndicated" logic as Greenhouse/Ashby. |
| Reuse | Common Crawl tenant discovery (`src/jobs/discover.ts`), the job schema, store, pricing setup — all transfer. |
| Why it matters beyond the niche | Workday is what **Fortune 500 employers** use. Our main actor covers startups (Greenhouse/Ashby/Lever) only; the 1,473-user incumbent charging $12/1k sells exactly the enterprise coverage we lack. The Workday engine can later be folded into the main actor too. |

**Real engineering work:** each tenant needs its site name discovered (a wrong one returns 422),
search results are capped at 2,000 per query (large employers need paging by facet), and job
descriptions need a second call per job.

**Expected outcome:** similar to the first actor — tens of dollars a month at first, low hundreds
if it captures a real share of the niche. It is a second lottery ticket in a niche we know, not a
new business.

---

## Runners-up

| Candidate | Users/30d | Why not first |
|---|---:|---|
| Apple App Store reviews + app data | 856 | Official public APIs (iTunes Search/Lookup, reviews RSS) — clean. But the leader charges **$0.10/1k**; it is a price race to the bottom. |
| Shopify store products (`/products.json`) | ~150 on the product side | Public endpoint, but 87 competing actors and much of the category's demand is email-lead harvesting we won't do. |
| Substack | 234 | Public JSON, clean, but small. |

## Ruled out — and why

| Niche | Finding |
|---|---|
| **Government / public data** (SEC EDGAR, patents, tenders, grants, courts) | **103 users across 62 SEC actors.** Clean data, but nobody buys it on Apify — the free official APIs are already good. |
| Tennis / sports (1,081-user "Tennis Scraper" @ $8/1k) | Sources are SofaScore (terms forbid scraping) and Tennis Abstract (non-commercial data licence). |
| Upwork, Trustpilot, Similarweb, Semrush/Ahrefs, G2 | Real demand (1,000–1,800 users each), but all forbid scraping and fight bots. |
| Betting odds | Sportsbook terms; also legal exposure. |
| Other ATS vendors (SmartRecruiters, iCIMS, Workable, BambooHR, Personio…) | ≤26 users each. Cheap to add to the main actor later; not worth a standalone listing. |

---

**Outcome (26 Sep):** built — see `actors/workday-jobs/` and the status entry in PROJECT_STATUS.md.

---

# Round 2 — 27 September 2026: what's next after Workday?

Same snapshot (`research/data/apify_store_2026-09-26.json`), re-clustered by target site, then every
candidate with a public or official data source checked against **its own terms**, not just its demand.

## Recommendation: an all-in-one career-site jobs actor (pre-indexed)

The biggest legitimate pool in the store is the "every company's career site in one API" market:

| Actor | Users/30d | Price |
|---|---:|---|
| fantastic-jobs/career-site-job-listing-api | **1,473** (145,664 runs) | **$12 / 1k** + $0.01/run |
| fantastic-jobs/career-site-job-listing-feed | 224 | $2.50 / 1k + $0.10/run |
| jobo.world/ats-jobs-api | 152 | $4 / 1k |
| memo23/career-site-ats-jobs-api | 73 | $4 / 1k |
| **Pool** | **~1,970** | |

That is ~5x the Workday niche, and we already own the two largest sources: Greenhouse/Ashby/Lever
(3,584 companies) and Workday (1,785 companies, ~770k roles). SmartRecruiters has an official public
posting API (verified: Bosch 4,802 roles), and Oracle/SuccessFactors follow the Workday pattern.

The catch: the leader is a **database**, not a live crawler — "all data-engineer roles in Texas from the
last 24 hours" returns in seconds. Competing needs a daily index (crawl everything once a day, fetch
descriptions only for new roles), so a user query reads the index instead of crawling 6,000 sites. That is
a bigger build than Workday, and it carries a small **recurring compute cost** (estimated a few dollars
a month) — a project stop condition, so it needs the owner's approval first.

## Checked and rejected

| Candidate | Demand | Why not |
|---|---:|---|
| Remote job boards (Himalayas, RemoteOK, Remotive, WWR) | 396 users | Their API terms require link-back and forbid passing jobs to third-party sites; Remotive sells a paid commercial API. Reselling breaks the spirit of the terms. |
| Apple App Store data / reviews | 888 users | Apple's Search API terms allow use **only to promote store content**, ~20 calls/min; leader prices at $0.10/1k. |
| US Secretary of State business registries | 128 users (one actor: 29,531 runs) | Real, sticky demand — but 50 different state websites, several with CAPTCHAs or anti-automation terms. High maintenance. |
| Congress stock-trade disclosures | 69 users | Clean public data, but small, and House filings are PDFs. |
| Brazil CNPJ / French SIRENE / UK Companies House | 126 / 50 / 27 | Clean open-government licences, but mostly lead-gen use and small. |
| Prediction markets, DEX/crypto, Bluesky, Hacker News, GitHub, arXiv, SAM.gov, FDA, patents | ≤135 each | Too small. |
