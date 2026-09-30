# PROJECT STATUS

**Last updated: 26 September 2026**
**Phase: 4 of 5 — shipped; Apify actor monetized from 10 Oct**
**Next: publish the Workday actor (built 26 Sep); watch whether jobs-actor users keep paying after 10 Oct**

---

## At a glance

| | |
|---|---|
| **Costs to date** | **≈ $2.65** — Apify Creator plan $1/month (Aug, Sep) + $0.65 of LLM test calls on 8 Aug |
| **Revenue to date** | **$0.00** — Apify pricing goes live **10 Oct 2026, 16:08 UTC** |
| **Money at risk** | **None.** No wallet exists. No mainnet. No domain. |
| **Tests** | **40/40 passing** (root) · **11/11** (Workday actor) |
| **Shipped** | [`driftwatch-mcp` on npm](https://www.npmjs.com/package/driftwatch-mcp) · [ATS jobs actor on Apify](https://apify.com/viridian_layout_ea2/company-career-site-jobs) · [Workday jobs actor](https://apify.com/viridian_layout_ea2/workday-jobs-scraper) · [Career Site Jobs API](https://apify.com/viridian_layout_ea2/career-site-jobs-api) |
| **Users** | **Apify: 18 total, 13 in the last 30 days, 96 runs** (25 Sep). driftwatch MCP: 0 stars, 41 npm downloads/week, no evidence of real use. |
| **Next action** | Watch the Workday actor's first users (published 26 Sep, charging from day one). **10 Oct:** remove the `apify-default-dataset-item` event and fix the `job` description (reminder scheduled). **You:** decide on the Hacker News post. |

---

## Third actor: Career Site Jobs API (daily index) — published 27 September 2026

Chosen in [NEXT_ACTOR_RESEARCH.md](NEXT_ACTOR_RESEARCH.md) round 2: the "every company's career site in one API"
market has ~1,970 users/30d; the leader (fantastic-jobs) has 1,473 at **$12 / 1k**. We own its two biggest sources.

- Lives in [`actors/career-jobs/`](actors/career-jobs/). Three parts:
  - `crawler/crawl.ts` — runs **on the Mac mini (free)**: Greenhouse/Ashby/Lever (3,584 companies) + Workday
    (4,113 sites), into `data/career-index.db`. Workday descriptions fetched only for roles not seen before.
  - `crawler/publish.ts` — uploads gzip shards (newest first, 40k jobs each) and write-once description chunks to the
    Apify key-value store `career-jobs-index` behind **signed read-only links**. Needs `APIFY_TOKEN` in `.env`.
  - `src/` — the paid Actor: reads the index, filters, charges per job. A search takes seconds.
- **Cost:** crawl on the Mac mini = $0. Apify storage + ~25 writes/day estimated **under $1/month** (plan: $0.20/CU,
  $1/month credit, $85 cap). Each paid search costs us a fraction of a cent to serve.
- First full crawl started 27 Sep ~11:15 local; one-time Workday description backfill (~700k) takes several hours.
  Daily runs afterwards only fetch new roles.
- Found while testing: short location keywords ("NY") matched inside words ("Germany"). Fixed in all three actors
  (whole-word match for keywords of 3 characters or fewer); live actors rebuilt (Workday 0.1.4, main 0.5.4).
- **Decided 27 Sep:** price **$2 / 1,000 jobs**. Daily launchd job installed (`~/Library/LaunchAgents/com.x402.career-jobs.plist`,
  03:30, lock prevents overlapping runs; logs in `data/logs/`). Turn off: `launchctl unload ~/Library/LaunchAgents/com.x402.career-jobs.plist`.
- `APIFY_TOKEN` added to `.env` by the owner 27 Sep (verified without displaying it).
- **Pushed to Apify** as `viridian_layout_ea2/career-site-jobs-api` (ID `oDFG9ptBmIy6QjQDZ`), private. Cloud test on an
  18k-job sample index passed (search ~1 s). The signed index link is an encrypted Actor secret (`careerManifestUrl`) and a
  gitignored file (`data/career-manifest-url.txt`) — **never commit it: the repo is public and the link unlocks the index.**
- **First full index published 27 Sep:** **936,775 jobs from 5,248 companies** (Workday 811k, Greenhouse 90k, Ashby 33k,
  Lever 3k); 24 shards (~65 MB) + 233 description chunks; publish took 8 min, 620 MB RAM. The first publish attempt ran out of
  memory loading every description at once — fixed by batching and streaming (commit ca03935).
- **Measured on Apify:** searches take 9–17 s and cost $0.0006–0.0018 each to serve (default memory now 1 GB; peak use 464 MB).
  A 300-job search earns $0.60 at $2/1k.
- **Pricing + icon set 27 Sep** (via the owner's Chrome, with permission): pay-per-event `job` = $0.002, primary; `apify-actor-start`
  $0.00005; dataset-item event removed. Icon uploaded; store description updated to the measured numbers.
- **27 Sep (evening): Oracle Recruiting Cloud + SmartRecruiters added and live.** Index now **1,473,057 jobs from
  7,230 companies** (Workday 841,695 · Oracle 282,975 · SmartRecruiters 222,635 · Greenhouse 89,786 · Ashby 32,968 ·
  Lever 2,998); 37 shards, 364 description chunks. Oracle: 868 companies (842 named by hand); excluded non-production
  pods, same-count aliases, and host `eubt` (78k gibberish test postings). JPMorgan Chase was missing from Common Crawl —
  added by hand (collected from the 28 Sep run). First expanded crawl crashed on an Oracle posting with a null title;
  fixed so one bad posting/site can't stop a run (commit 2619448); rerun: 21 errors in ~316k detail fetches.
  Worst-case search (reads all 37 shards) still completes. Store title/description updated via API (title limit: 63 chars).
- **28 Sep: salary extraction** (`actors/career-jobs/src/salary.ts`). Precision-first: every rule traces to a real false
  positive in our index (revenue, funding, insurance limits, bonuses, "40 hours per week" next to a yearly range, "per
  month" commission next to a yearly salary). Ashby's structured pay used directly (Ramp: 150 of 157 roles). Measured
  on ~10k indexed jobs: **25.5% with pay** (Workday 35%, Greenhouse 20%, Oracle 14%, SmartRecruiters 9%); every sampled
  match reviewed. New fields salaryMin/Max/Currency/Period/AnnualMin/AnnualMax/Text/Source; filters onlyWithSalary,
  minAnnualSalary, salaryCurrencies. Greenhouse/Ashby/Lever description cap 4,000 → 8,000 chars (pay sits at the end),
  refreshed nightly. Builds: career API 0.1.6, main actor 0.5.6. 23 salary/search/source tests.
- **29 Sep: seven small-company systems added and live** — BambooHR, Breezy, Personio, Rippling, Teamtailor, Recruitee,
  UKG Pro (`sources/small.ts`, one interface + one crawl loop; `crawler/discover-small.ts`). Skipped: JazzHR, Jobvite
  (HTML only), Workable (feed 404), Paylocity (feed empty). Index now **1,726,532 jobs from 17,002 companies, 13 systems;
  487,762 (28.3%) with pay**. Caught before shipping: UKG job-id mismatch (would have refetched every UKG job nightly),
  UKG's second host (recruiting2), two UKG boards named "Firefox" from the browser-warning logo; 20 large UKG tenants
  hand-named (e.g. BUC1007BUCC = Buc-ee's). Teamtailor RSS caps at 100 roles/company. Store title "Career Site Jobs API —
  1.7M jobs, 13 hiring systems"; build 0.1.7. 29 tests.
- **29 Sep: Workable and Jobvite added** — Workable via the public widget feed (one request per company, all jobs +
  descriptions; hard rate limit, so requests are serialised 500 ms apart; the feed repeats a job once per location, merged
  by shortcode). Jobvite via HTML list + detail pages (no posting dates; some boards add a Company column). 2,257 Workable
  companies / 62,908 jobs (20.5% with pay), 361 Jobvite companies / 10,977 jobs (46.6% with pay). Salary extractor now
  reads "Minimum Salary … Maximum Salary" pairs. `CRAWL_ONLY=a,b` runs a catch-up crawl for named systems only. Index
  **1,760,652 jobs, 19,610 companies, 15 systems**; build 0.1.9, store title "… 15 hiring systems". 34 tests. Known: a
  Jobvite-only search reads nearly every shard (~90 s) because Jobvite jobs are undated.
- **30 Sep: "new since last run" (`onlyNewSinceLastRun`, optional `monitorName`)** — each search's last-read index time is
  kept in a named key-value store `career-site-jobs-monitor` in the caller's own account (key = hash of the filters + name,
  `src/monitor.ts`); later runs return only jobs with `firstSeenAt` after it. Shards now carry `newestFirstSeen`, so
  monitor runs skip shards with nothing new. Cloud test (build 0.1.10): first run 314 jobs charged 314; immediate rerun
  0 jobs, 0 shards read, 1.7 s. Index republished: 1,808,281 jobs. 36 tests.
- **Main actor pricing cleanup still blocked until 10 Oct** (checked 30 Sep: Console "Change" button still disabled while the
  price change is pending). Note: the extra `apify-default-dataset-item` charge is $0.01 per 1,000 (under 1% on top of
  $1.50), not a doubling.
- **Published on the Store 27 Sep:** https://apify.com/viridian_layout_ea2/career-site-jobs-api — live page verified:
  "from $2.00 / 1,000 jobs", custom icon, 900,000+ description.

---

## Second actor: Workday Jobs Scraper — built 26 September 2026

Chosen by measurement: see [NEXT_ACTOR_RESEARCH.md](NEXT_ACTOR_RESEARCH.md). Workday has 398 users/30d across
24 actors, no dominant competitor, and it is the enterprise coverage our first actor lacks.

- Lives in [`actors/workday-jobs/`](actors/workday-jobs/): self-contained package, its own `.actor/` config, README, and icon.
- Reads Workday's public career-site JSON API (the one the site's own page calls). No browser, no proxy.
- **Registry: 4,113 verified career sites across 1,785 companies** (Common Crawl → each company's robots.txt →
  live check). 80 private/internal/confidential sites deliberately excluded by name. Rebuild: `npm run discover`.
- **Pricing decided: $1.50 per 1,000 jobs**, same as the first actor. A new actor can charge from day one.
- **Pushed to Apify 26 Sep**: actor `viridian_layout_ea2/workday-jobs-scraper` (ID `9YFhLqT6A7qTgxbzt`), build 0.1.1.
  Cloud test run succeeded (20 NVIDIA jobs, ~6 s).
- **Published to the Store 26 Sep** at https://apify.com/viridian_layout_ea2/workday-jobs-scraper — "$1.50 / 1,000 jobs",
  tower icon, no `apify-default-dataset-item` event (no double charge). Categories are now auto-assigned by Apify
  (Job platforms, Job Listings). Store pages are cached ~30 min, so Console edits show up late.
- **27 Sep:** the two actors' READMEs now link to each other (startups ↔ big employers, same fields). Added
  `companyName` ("ms" → "Morgan Stanley") for all 1,785 registry companies, read by hand from each career site's
  description into `actors/workday-jobs/src/names.json`; `companyKeywords` now matches names too. Build 0.1.3.
- **Weekly check-in:** scheduled task `apify-weekly-user-check` runs Mondays 9am, appends both actors' stats to
  `research/data/actor_stats.csv` and reports week-over-week change and failure rates. Read-only.

**What testing found about Workday** (all live, 26 Sep):

| Quirk | Consequence if ignored | Handling |
|---|---|---|
| `limit` > 20 → HTTP 400 | run fails | page size 20 |
| `total` only on page 1 | paging stops early | read it once |
| Some sites report exactly 2,000 and wrap back to page 1 past it (NVIDIA: really 2,650) | 650 jobs missed + duplicates, silently | split by job category, then location, until each slice is under the cap |
| Other sites report the true count and page normally (Dollar Tree 23,636; TJX 11,357) | splitting wastes ~3,300 requests on TJX | only split when total is *exactly* 2,000 |
| Locations facet is nested one level down | no way to split TJX's 8,000-job category | flatten nested facets |

Results: NVIDIA 2,650/2,650 in 14 s; TJX 11,357/11,357 in 34 s; default auto-test input returns 1,000 jobs in 84 s.
A test caught one real bug before shipping: early stop didn't cancel requests already queued.

Known limits: `company` is the Workday id (e.g. `ms`, `jj`), not a display name; `department` is null when a
site's categories don't cover every job (TJX: 11,356 of 11,357). Heavily filtered runs over the whole registry
are slow (83 health-company sites took 5.4 min for 15 matches), because filters like location or date can only
be checked after listing everything; `searchText` narrows at the source.

---

## Apify monetization — set up 26 September 2026

Pricing, confirmed live via the public API and in the Console:

| Event | Price | Notes |
|---|---|---|
| `job` — "Job Returned" (primary) | **$0.0015** ($1.50 / 1,000) | charged by `Actor.pushData(record, "job")` in [src/jobs/main.ts](src/jobs/main.ts) |
| `apify-actor-start` | $0.00005 | Apify default; keep it — deleting it loses users' free 5 s of compute |
| `apify-default-dataset-item` | $0.00001 | **to remove** — the platform charges it on every dataset write, so each job is billed twice |

- Apify keeps 20%; users do not pay platform usage separately (we do, and runs cost fractions of a cent).
- Takes effect **10 Oct 2026, 16:08 UTC**; existing users were notified 26 Sep.
- **Pricing is locked while a change is pending** — the Console's Change button is disabled. The two cleanups (remove the dataset-item event; change the `job` description from "Job Scraper" to "Charged for each job listing delivered") wait until 10 Oct. Deliberately *not* attempted via the API, which could restart the 14-day notice.
- Price chosen against competitors on 26 Sep: bovi (closest copy, 99 users) $1.50/1k; fantastic-jobs $12 → $4/1k; its feed $2.50 → $0.80/1k; memo23 $4/1k + $0.03/run.
- Realistic expectation: $50-150/month gross at current usage, and some free users will leave. **The signal is whether anyone keeps running it after 10 Oct.**
- 2 of 72 runs in the last 30 days timed out — worth checking, since 3 consecutive failed daily auto-tests flags the actor "under maintenance".

---

## Completed

### Phase 1 — Research & selection
- [x] **Step 1** — Market research on x402, the x402 Foundation, Bazaar, MCP, A2A,
      Stripe MPP, Google AP2, Visa TAP, Virtuals ACP, agent marketplaces, paid APIs
- [x] **Primary data collection** — pulled the complete live x402 Bazaar catalog
      (14,128 services with 30-day call counts and unique payers), plus a liveness
      probe of 350 endpoints → `research/data/`
- [x] **Step 2** — 20 opportunities generated, costed, ranked → [OPPORTUNITIES.md](OPPORTUNITIES.md)
- [x] **Step 3** — Selection with second and third alternates → [DECISION.md](DECISION.md)

### Phase 2 — Design
- [x] **Step 4** — Architecture: sources → engine → permanent cache → three surfaces

### Phase 3 — Build
- [x] **Step 5** — MVP built and verified working:
  - Project scaffold, dependencies, `.env.example`, Dockerfile, docker-compose
  - Free public data sources: npm, PyPI, GitHub Releases, OSV.dev
  - Deterministic breaking-change extraction (no LLM, no cost)
  - Optional LLM synthesis, **off by default**, with a hard daily spend cap
  - SQLite permanent cache + revenue/cost ledger
  - HTTP API with validation, two-tier rate limiting, emergency shutdown
  - **17 unit tests, all passing**
- [x] **Step 6** — x402 implemented on `@x402/*` v2.21 (verified: HTTP 402,
      `PAYMENT-REQUIRED` header, correct 50000 units = $0.05 USDC on Base Sepolia)
- [x] **Step 7** — Discovery: MCP server, OpenAPI 3.1 spec, `llms.txt`,
      `/.well-known/x402`, Bazaar extension with input schema
- [x] **Step 8** — Internal test agent: discover → price → 402 → pay → retry →
      verify → record cost → compute value received
- [x] **Step 9** — Economics with three scenarios → [docs/ECONOMICS.md](docs/ECONOMICS.md)
- [x] **Step 10** — Autonomy: cache, graceful degradation, spend caps, kill switch
- [x] **Step 11** — Security → [docs/SECURITY.md](docs/SECURITY.md)
- [x] **Step 12** — [BEGINNER_GUIDE.md](BEGINNER_GUIDE.md)
- [x] **Step 13** — Launch plan: [DAY_1](DAY_1.md) · [DAY_2](DAY_2.md) ·
      [DAY_3](DAY_3.md) · [WEEK_1](WEEK_1.md) · [WEEK_2](WEEK_2.md) · [MONTH_1](MONTH_1.md)

---

## Verified working

Each of these was executed, not just written:

| Check | Result |
|---|---|
| Unit tests | **17/17 pass** |
| Server boots from clean state | ✅ |
| `/v1/delta` react 18.2.0→19.0.0 | 3 breaking changes with symbols, 5 citations |
| `/v1/delta` express 4.18.0→5.0.0 | 18 breaking changes, 2 advisories, 24 citations |
| `/v1/delta` zod 3.22.0→4.0.0 | 25 breaking changes |
| **Cold cache latency** | **1.6s** |
| **Warm cache latency** | **14ms** (~100× faster — the margin mechanic) |
| `/v1/check` catches live typosquat | ✅ flags `recat` (real npm squat: v0.0.0, no repo) |
| x402 paywall | ✅ HTTP 402 + `PAYMENT-REQUIRED` header, $0.05 USDC, Base Sepolia |
| Bazaar discovery extension | ✅ present with input schema |
| MCP server over stdio | ✅ initialize, tools/list, tools/call all working |
| Test agent full loop | ✅ discover → verify → value accounting |
| Input validation | ✅ traversal, injection, bad enums → 400; scoped packages → 200 |
| `/admin/stats` from outside | ✅ 403 |
| Batch manifest endpoint | ✅ 2 packages analyzed concurrently |
| OpenAPI 3.1 spec | ✅ valid, 4 paths, 6 schemas |

---

## Day 1 results (run 2026-08-07)

Day 1 was executed. It found **four real bugs**, all now fixed, and one hard
limit that is not a bug.

| # | Bug found | Fix | Status |
|---|---|---|---|
| 1 | `tagToVersion` required 3 numeric components, so `v2.0` returned null — **pydantic's entire v2 release was silently skipped** | Accept 2-component tags, normalize to 3, handle PEP 440 (`v2.0b3`) | Fixed + 3 tests |
| 2 | Packaging commits reported as breaking changes ("setup: remove upper bound from python_requires") | Medium-confidence findings must name a backticked code symbol | Fixed + 2 tests |
| 3 | Internal churn reported ("Remove xfail from `tests.test_edge_cases`") | Filter test/lint/CI keywords and all-private symbols | Fixed + 4 tests |
| 4 | **GitHub returns releases newest-first, so `vite@5.0.0`'s own notes were past page 2 and never fetched** | Fetch the target release directly by tag when absent | Fixed |
| 5 | Projects whose release body is a pointer at `CHANGELOG.md` (vite, Flask) yielded nothing | New `src/sources/changelog.ts` — fetches the changelog **at the version's own git tag**, handles markdown + reStructuredText, and falls back to prerelease sections when the stable heading is empty (vite's `## 5.0.0` is four blank lines) | Fixed |

**A self-inflicted one worth recording:** my first pass at bug 4 tried 8 tag
formats across 6 boundary versions — up to 48 GitHub calls per package. That
exhausted the 60/hour unauthenticated limit in a single scorecard run and
silently zeroed *every* result. Now capped at 3 extra calls, only when needed,
with explicit 403 handling. **Getting a free `GITHUB_TOKEN` is not optional.**

### Measured quality — deterministic tier, no LLM

| Package | Result | Verdict |
|---|---|---|
| eslint 8→9 | 40 breaking, 38 high confidence | **useful** |
| react 18.2→19 | 3 breaking, with symbols | **useful** |
| next 14→15 | 2 breaking | **useful** |
| pydantic 1.10→2.0 | 2 breaking | **useful** |
| vite 4→5 | 0 | **empty** |
| Flask 2.3→3.0 | 0 | **empty** |

**4 of 6 on a deliberately hard sample.** The WEEK_1 bar is 15/20 (75%); this is 67%.

**The two failures are no longer data problems.** After fix 5, we successfully
fetch vite's and Flask's changelog text. The extractor cannot parse it:

- vite ships commit-log entries (`feat: allow providing parent httpServer...`)
- Flask ships reStructuredText prose (`Remove previously deprecated code.`)

Neither has a "Breaking Changes" heading or backticked symbols, which is what
the deterministic patterns key on. **This is precisely what the LLM tier exists
to solve** — it reads the same fetched text and does not care about format.

**Conclusion: the LLM tier is not a quality upgrade, it is the coverage fix.**

### Confirmed 2026-08-08 — the LLM tier closed the gap

| Package | Free tier | With LLM | Code fixes |
|---|---|---|---|
| react 18.2->19 | 3 | **17** | 11 |
| next 14->15 | 2 | **10** | 5 |
| eslint 8->9 | 40 (noisy) | **9** (precise) | 1 |
| vite 4->5 | **0** | **6** | 3 |
| pydantic 1.10->2.0 | 2 | 2 | 0 |
| Flask 2.3->3.0 | **0** | 1 (thin) | 0 |

**5 of 6 useful (83%) — clears the 75% WEEK_1 bar.** Flask stays thin because
its changelog genuinely says only "Remove previously deprecated code" without
enumerating what. The model correctly declined to invent the list.

Cost: **~$0.09 per version pair, paid once ever** then cached. $0.65 spent
across 7 calls against the $1.00/day cap.

### A money bug found and fixed during this

`synth truncated at max_tokens` was **discarding the entire LLM response while
still paying for it** — the worst possible outcome. React 18->19 produced more
breaking changes than the 2,000-token output cap allowed.

Fixed three ways: raised the cap to 4,000, instructed the model to return at
most 25 changes, and added `salvagePartialJson()` to recover every complete
object from a truncated array so paid tokens are never wasted again.

That salvage function had its own bug, caught by its own tests: it scanned from
character zero, but the wrapper `{"breakingChanges":[` never closes in a
truncated response, so the scanner sat at depth >= 1 forever and recovered
nothing. It now scans from inside the array. 3 tests cover it.

## Second track: Apify (approved 2026-08-07)

You chose **both paths** — ship driftwatch free for audience, build an Apify
actor for near-term cash. I measured the Apify Store the same way I measured
x402: pulled 12,841 actors with 30-day user counts, ratings, and pricing.
Full write-up in [APIFY_RESEARCH.md](APIFY_RESEARCH.md).

**Two findings killed my first two candidate ideas:**

1. The biggest weak-incumbent gaps (Instagram at 3.39★ with 9,113 users,
   LinkedIn at 2.93★) are **prohibited by those platforms' terms**. The bad
   ratings *are* the anti-bot difficulty. Filtering these removes 356 of the
   578 high-traction actors — 62% of the visible opportunity.
2. The best *legitimate* weak incumbents are **free** — `apify/screenshot-url`
   has 901 users and 95,641 runs at 3.69★ and costs nothing. A weak-incumbent
   signal is worthless when the incumbent is free, and that is invisible unless
   you check the pricing field.

**What survived: job listings from company career sites.** The incumbent
`fantastic-jobs/career-site-job-listing-api` has 1,306 users and 109,002
runs/month at only **3.98★**, and the whole JOBS category has weak incumbents.

**Why we can beat it:** modern ATSs publish *documented public job-board APIs*
built for syndication. Consuming them is their intended use, not scraping — so
no ToS problem, no anti-bot arms race, and no weekly breakage. The incumbents
sit at 3.6–4.0★ *because* they scrape HTML.

### Built and verified today

`src/jobs/ats.ts` — normalizes Greenhouse, Lever, Ashby, and Workable into one
schema.

| Test | Result |
|---|---|
| `npm run jobs:smoke` | **1,161 jobs from 6 companies across 3 ATSs in 1.75s** |
| Data completeness | 1,148/1,161 with descriptions, 1,161/1,161 with posted dates |
| `npm run jobs:coverage` | **25 of 30 companies resolved from naive slug guessing (83%), 4,326 jobs** |

That 83% hit rate matters most: **coverage was the main risk, and it is
tractable** — the company slug is usually just the company name.

## Remaining

- [x] **Day 1** — run and verified; 4 bugs found and fixed
- [x] **Apify research + ATS prototype** — validated, legitimate, working
- [x] **Apify Creator Plan** — subscribed ($1/month, $500 platform usage for 6 months)
- [x] **Seed company list built** — 164 verified companies, 14,456 open jobs
- [x] **Actor packaged** — `.actor/` complete, tested locally end to end
- [x] **Anthropic key installed** and verified working; shell history cleaned (0 lines contain it)
- [x] **LLM tier enabled and validated** — quality 4/6 -> 5/6
- [x] **Actor pushed and building on Apify** — build 0.1.2 SUCCEEDED
- [x] **Verified running on Apify infrastructure** — run `KdcHSPogIgnwKmIyy` SUCCEEDED, 15 clean records in 10s
- [x] **PUBLISHED LIVE** on the Apify Store, 2026-08-08 — https://apify.com/viridian_layout_ea2/company-career-site-jobs
- [ ] Monetization deferred by choice — see note below
- [x] **Seed list expanded** — 164 -> 498 companies, 14,456 -> 27,408 jobs; v0.2.1 live
- [ ] Wait for install data before building anything else

## Day 2 scorecard — results

| # | Test | Result | Verdict |
|---|---|---|---|
| 1 | react 18.2→19 | 17 breaking, 11 with code fixes | **USEFUL** |
| 2 | express 4.18→5.0 | 21 breaking + 2 advisories fixed | **USEFUL** |
| 3 | vite 4→5 | 6 breaking, 3 with code fixes | **USEFUL** |
| 4 | next 14→15 | 10 breaking + 25 advisories triaged | **USEFUL** |
| 5 | pydantic 1.10→2.0 | 2 → **25** after cache fix | **USEFUL** |
| 6 | `recat` safety check | flagged SUSPICIOUS (real typosquat) | **PASS** |
| 7 | `crypto-js-utils` | correctly reported non-existent | **PASS** |
| 8 | `express` safety check | clean | **PASS** |
| 9 | django 4.2→5.0 | 0 → **6** after per-version-file fix | **USEFUL** |
| 10 | `is-odd` (obscure) | none found, clear caveat, no invention | **CORRECT** |

**Honest framing: two of these only passed after I fixed bugs mid-test.** On the
code as it stood this morning, pydantic and Django both scored EMPTY.

### Three more bugs found by the Day 2 scorecard

1. **Stale cache served pre-fix results.** pydantic returned 2 breaking changes
   carrying the *old* truncation warning — an entry written before the salvage
   fix. Clearing it took the same query to 25 changes including `class Config`
   → `model_config`, `.dict()` → `.model_dump()`, `@validator` →
   `@field_validator`. The fix had worked all along; the cache was older than
   the code.
2. **No support for per-version release files.** Django publishes **zero**
   GitHub Releases — its notes live at `docs/releases/5.0.txt`. We returned
   nothing for one of the largest Python frameworks. Added `PER_VERSION_PATHS`
   covering that layout and four similar conventions.
3. **No cache invalidation on code changes** — the systemic cause of #1. Added
   `ENGINE_VERSION` to the cache key so an engine fix makes stale entries
   unreachable instead of serving them forever.

### Two config bugs fixed while wiring up Day 2

Both would have silently broken the MCP server in real use:

1. **`.env` was loaded relative to the working directory.** `import "dotenv/config"`
   resolves against `process.cwd()`, which is fine for `npm start` but an MCP
   client launches the server from wherever it happens to be — so the API key
   and every setting silently vanished. Now anchored to the project root.
2. **The SQLite cache path was CWD-relative too.** An MCP client would have
   created its own empty database and re-paid for every delta the API had
   already computed — quietly destroying the cache economics that make the
   margin work. Also anchored to the project root.

Verified: launched from `/tmp`, the server loads the key, hits the shared
cache, and returns synthesized output.
- [x] **Day 2 set up** — driftwatch registered in Claude Desktop; scorecard at [DAY_2_SCORECARD.md](DAY_2_SCORECARD.md)
- [x] **Day 2 scorecard run (2026-08-08)** — 10/10 completed, 3 more bugs found and fixed
- [ ] **YOU:** restart Claude Desktop so the MCP server picks up today's fixes, then spot-check libraries *you* use

## Jobs actor — built 2026-08-07

`src/jobs/` + `.actor/`. Reads public JSON job-board APIs; no HTML scraping.

**Verified company registry: 164 companies, 14,456 open jobs**

| ATS | Companies | Jobs |
|---|---:|---:|
| Greenhouse | 90 | 9,248 |
| Ashby | 64 | 4,168 |
| Lever | 10 | 1,040 |

Plus 125 cached dead candidates, so re-running discovery never re-probes a
known miss.

### Two data-quality bugs found by testing, both fixed

**1. Workable is unreliable, and I initially got the reason wrong.** Its widget
endpoint served valid JSON for `huggingface` on one call and an HTML page for
the same slug minutes later. It also returns HTML rather than 404 for unknown
accounts, so a probe cannot tell "no such company" from "endpoint is having a
moment" — it silently produces phantom hits *and* phantom misses. Excluded from
the default probe order; the adapter is kept in case it stabilizes. My first
comment claimed it was withdrawn, which the evidence did not support; corrected.

**2. Ashby's `isRemote` does not mean remote.** It flagged **112 of Ramp's 123
roles** as remote while listing every one at "New York, NY (HQ)". Letting that
drive the `remote` field made `remoteOnly` nearly useless — precisely the kind
of defect that earns the incumbents their 3.6–4.0★ ratings. Now split:

- `remote` — the location text itself says remote (precise)
- `remoteEligible` — the company's own ATS flag (broader, noisier)

Both ship in every record, and the ambiguity is documented in `ACTOR.md` rather
than hidden behind one field.

### Publishing: one more real bug

The first `apify push` failed the build:

```
COPY data/companies.db ./data/companies.db  ->  "/data/companies.db": not found
```

`apify push` honours **.gitignore**, which excludes `data/`. The registry was
filtered out of the upload before Docker ever saw it, so the `.dockerignore`
exception was irrelevant.

Fixed by shipping the registry as `src/jobs/companies.json` (8.2 KB) instead of
the SQLite file. Better on two counts: it survives the ignore rules, and the
Actor image no longer needs a native SQLite module at all — one fewer compile
step that could break a build. The database remains the working store;
`npm run jobs:export` regenerates the shipped JSON.

**Actor (console):** https://console.apify.com/actors/z8bXLsZLfOGquXA0U
**Actor (public store):** https://apify.com/viridian_layout_ea2/company-career-site-jobs
**Live version:** 0.2.1 — 498 companies, 27,408 open jobs

### Competitive reality check (2026-08-08)

Store search for "career site jobs" revealed the niche is more crowded than my
first analysis showed:

| Actor | Users/30d | Rating |
|---|---:|---|
| fantastic-jobs/career-site-job-listing-api | 1,306 | 3.98★ |
| **fantastic-jobs/career-site-job-listing-feed** | **208** | **4.99★** |
| santamaria-automations/career-site-jobs-scraper | 8 | unrated |
| jobo.world/career-site-jobs-feed | 6 | 5.00★ |
| thirdwatch/career-site-job-scraper | 3 | unrated |
| trakk/universal-career-site-jobs-scraper | 2 | unrated |
| oguzcankaraman/universal-ats-jobs-scraper | 1 | unrated |

Two corrections to my earlier read:

1. **The incumbent is not weak.** `fantastic-jobs` also runs a **4.99★** actor.
   They hold ~1,514 users across two listings.
2. **At least five people have already built essentially this exact thing** and
   have 1-8 users each. The idea is not the moat; distribution and depth are.

Implication: adding companies is not the bottleneck. Positioning is.

### Published free, monetization deliberately deferred

Apify gates pricing behind full KYC — government ID, proof of address, tax
documentation. Doing that to collect a realistic $0-3 in month one was a bad
trade, and free listings get **more** installs than paid ones, which is the
signal that actually matters right now.

Published as **Pay per usage** (free to the user) with categories **Jobs** and
**Lead generation**.

**One thing to know:** the publish dialog disclosed that adding monetization
later takes **14 days to take effect**. That was not in Apify's public docs and
slightly weakens the defer-it argument — but 14 days is immaterial against a
4-6 month runway to meaningful revenue. Do the KYC the moment repeat usage
appears, not before.

**Daily auto-test:** Apify runs the actor with its default input every day. If
it fails to produce a non-empty dataset within 5 minutes on 3 consecutive days,
it gets flagged "under maintenance". Our platform run finished in 10 seconds
with 15 records, so there is comfortable headroom -- but this is now a live
uptime dependency on Greenhouse/Ashby/Lever staying reachable.

### Packaging bug caught before it shipped

`.dockerignore` excluded `data/`, which would have stripped the company registry
out of the actor image — the actor would have silently fallen back to unverified
seed guesses in production. Now `data/*` with a `!data/companies.db` exception.
- [x] **Day 2 set up** — driftwatch registered in Claude Desktop; scorecard at [DAY_2_SCORECARD.md](DAY_2_SCORECARD.md)
- [x] **Day 2 scorecard run (2026-08-08)** — 10/10 completed, 3 more bugs found and fixed
- [ ] **YOU:** restart Claude Desktop so the MCP server picks up today's fixes, then spot-check libraries *you* use
- [ ] **You:** run [DAY_3.md](DAY_3.md) — full testnet payment loop
- [ ] **Week 1:** answer quality to 15/20 on a real scorecard
- [ ] **Week 2:** publish (needs domain approval, ~$12/yr)
- [ ] **Month 1:** decide — continue / pivot / stop

---

## Known quality gap — found AND fixed 23 Aug 2026

**Big-name majors can return near-empty answers when the project documents the
release somewhere driftwatch does not read.**

Caught spot-checking `zod 3.22.0 -> 4.0.0` against the published package. It
returned **1 breaking change**. zod v4 was a substantial rewrite.

The cause is not a bug in the engine -- it is a missing source:

| Source | zod |
|---|---|
| GitHub Release for `v4.0.0` | **404 — never published** (v4.0.1 … v4.0.17 exist) |
| `CHANGELOG.md` | **404 — zod does not ship one** |
| Actual migration guide | `zod.dev/v4/changelog` — a docs site |

This is the **third instance of one pattern**, and the pattern is the important
part: vite documented its major in `CHANGELOG.md`, Django in
`docs/releases/*.txt`, zod on a docs website. Projects routinely document the
major release outside GitHub Releases -- and the major is precisely the upgrade
users need help with.

Two prior instances were fixed by adding a source. This one cannot be, because
a docs-site reader means per-project URL mapping, which does not generalize the
way `CHANGELOG.md` did.

**So it reports the gap instead.** Results now carry a `coverage` block
separating "nothing broke" from "we could not see what broke", and the MCP
output leads with an `INCOMPLETE` banner when a major boundary is crossed with
no notes for the target version. Placement is deliberate: an agent reading
top-down must hit the caveat before the findings.

Verified it does not cry wolf — express 4.18.2 -> 5.0.0 has real v5.0.0 notes
and stays silent. Tests 32 -> 35.

**One correction to the original finding:** the "1 breaking change" was the
no-API-key path. With the LLM tier enabled, zod returns 25 real breaking
changes synthesized from the 88 in-range notes. The gap is narrower than first
recorded — but the default install has no key, so it is still what most users
would have seen.

**Why it matters commercially:** zod is a top-20 npm package. A user who tries
their own dependency and gets one vague line will not try a second time.

**Open question for the next session:** add a small curated map of
`package -> release-notes URL` for the top ~50 packages, or accept the gap and
say so honestly in the tool output when no authoritative source was found. The
second is cheaper and arguably more useful -- "I could not find release notes
for this version" is a better answer than a confident, thin one.

---

## First organic users — 9 September 2026

The Apify actor has **9 total users, 7 of them in the last 7 days**. Only 3 of
its 59 runs belong to our own account, and the most recent of those was 28 Aug
— so the traffic is other people. 50 of 51 runs in the last 30 days succeeded,
1 aborted, 0 failed.

The likely cause is the 28 Aug relisting, and the timing lines up exactly:

| Store search | Before | Now |
|---|---|---|
| `greenhouse` | absent | rank 30 / 87 |
| `ashby` | absent | rank 25 / 82 |
| `lever` | absent | rank 24 / 85 |
| `career site` | rank 33 | rank 12 / 91 |
| `ats career sites` | — | rank 2 / 98 |

Two changes shipped together that day, so their contributions cannot be
separated: coverage went 498 -> 3,584 companies, and the title was rewritten to
lead with the terms buyers actually search rather than with "Career Site". The
ranking data says discovery was the binding constraint; the coverage may be
what stopped people bouncing once they arrived. We cannot tell which from 8
users, and should not pretend otherwise.

**Caveat on the number.** 8 users is small enough that a few could be Apify's
own tooling or curious browsing rather than intent. Zero reviews and zero
bookmarks so far. The signal to watch is not the user count but whether anyone
runs it a *second* time.

**driftwatch (the MCP server) is unchanged at zero.** Still 0 stars, ~1 repo
visitor a day, npm down to 20 downloads a week now that the publish-day crawler
traffic has decayed. Whatever worked on Apify has not transferred.

---

## Blockers

**None technical.** Everything works and everything is shipped.

The only thing standing between this and its first user is **distribution** —
see below. That is a people problem, not a code problem, and it is the part I
cannot do alone.

---

## Distribution status (23 August 2026)

| Channel | State | Blocker |
|---|---|---|
| npm package | ✅ **live** — `driftwatch-mcp@0.1.0`, published 00:18 UTC | none |
| Apify actor | ⚠️ public but **invisible** | absent from all 8 search queries and from the first 944 of 49,833 store actors, 7 days after the listing fixes. Six direct ATS competitors hold 34-602 users each. Ranking looks popularity-weighted — a cold-start trap. **Recommend leaving it running and stopping investment.** |
| Research post | ✅ [`research/posts/x402-economy-measured.md`](research/posts/x402-economy-measured.md) — 1,306 words, re-measured 23 Aug | **unposted** — HN, timing chosen |
| GitHub repo | ✅ **public** — [dhughes6071/driftwatch](https://github.com/dhughes6071/driftwatch), MIT, 15 topics | none |
| **Official MCP Registry** | ✅ **listed** — `io.github.dhughes6071/driftwatch`, status active | none |
| Other MCP directories | glama auto-indexes from GitHub; mcp.so / smithery optional | low priority |

Repo published 23 Aug 2026 after a full audit: all 125 objects in git history
scanned for secrets, `.env` confirmed never committed, no personal data. Added
the missing MIT LICENSE (package.json claimed MIT with no file behind it) and
rewrote the README to lead with the `npx` install block.

**The bottleneck is now posting.** Everything else is shipped and listed.

Registry submission took two rejections, both mine: `description` is capped at
100 chars (ours was 176). Fixed and validated locally against the published
schema afterwards, so the file is now known-good for future version bumps —
each release needs `server.json` version bumped and `mcp-publisher publish`
re-run.

---

## Two things worth knowing

### 1. The market is tiny, and I built around that
The entire independent x402 seller economy is **~$11,700/month** across 14,128
services (measured 7 Aug 2026). The best independent operator makes ~$872/month.
That is why the architecture leads with MCP distribution and treats x402 as
cheap optionality rather than the revenue plan.

### 2. Testing found a real product gap, and it's fixed
My first typosquat check only flagged names that *don't exist*. Then I tested
`recat` and found it **does** exist on npm — version 0.0.0, no repository, no
description. A live typosquat one keystroke from `react`, which my original
logic would have waved straight through as safe. The heuristic now scores squat
signals on packages that do exist. This is the kind of thing only real testing
surfaces.

---

## Decisions on record

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-07 | Build **driftwatch** — dependency migration intelligence | Measured demand (SDKProof), buyer-verifiable ROI, free inputs, ~95% steady-state margin, MCP distribution needs no human sales |
| 2026-08-07 | x402 = payment rail, **not** revenue model, in year one | Measured: entire independent x402 economy ≈ $11.7k/month |
| 2026-08-07 | LLM synthesis **off by default** | The deterministic tier already produces cited, correct output. Verified against React 19 and Express 5. |
| 2026-08-07 | Default model `claude-opus-5` when LLM is enabled | Answer quality *is* the product, and each version pair is paid for exactly once, ever |
| 2026-08-07 | Ruled out reselling licensed data (the one proven x402 model) | Usually breaches upstream terms of service |
| 2026-08-07 | Ruled out sanctions/PEP screening despite real budget | Unacceptable liability for a first venture |
| 2026-08-07 | Host on the existing headless Mac Mini for Phase 1 | $0 cost, genuinely sufficient at early volume |
| 2026-08-07 | Node type-stripping instead of a build step | One less moving part; no `dist/`, no compile stage to break |

---

## Stop conditions — none triggered

Per your Step 14, I will halt and ask before any of:

- [ ] spending real money
- [ ] deploying to mainnet
- [ ] creating or funding a production wallet
- [ ] adding any recurring paid API (with expected monthly cost shown first)
- [ ] anything with legal, financial, security, or irreversible risk

**Status: none reached. Everything built so far is free, local, and reversible.**

The nearest upcoming one is the **domain purchase (~$12/year) in Week 2**, and
**enabling the LLM (up to $31/month, hard-capped)** whenever you decide answer
quality is the constraint. Both are documented in [docs/COSTS.md](docs/COSTS.md)
and neither has been done.

---

## npm publish completed (2026-08-23)

`driftwatch-mcp@0.1.0` is live on the public registry: 17 files, 31.2 kB
packed, MIT, README rendering.

Getting there took four rejections, none of them the package's fault:

| Failure | Cause | Fix |
|---|---|---|
| `ENEEDAUTH` | no `~/.npmrc` — the browser login never completed | re-ran `npm login`, waited out the post-authorize hang |
| placeholder token written | I wrote `YOUR_TOKEN_HERE` in a command and it was pasted literally | deleted the entry; my instruction was ambiguous, not the user's error |
| `E403` | npm now **requires 2FA** to publish; the account had none | user enabled `auth-and-writes` 2FA |
| `E429 rate limited otp` | expired OTP codes counted as failed attempts | waited ~10 min; entered a code immediately after it refreshed |

**Verified after publish, from the public registry, in a sandbox with a fake
`HOME`** — so none of the local `.env` or cache could contribute:

- cold `npm i driftwatch-mcp` → binary present, MCP handshake returns
  `driftwatch 0.1.0`, protocol `2025-06-18`
- `get_migration_delta` for `express 4.18.2 → 5.0.0` returned **4 breaking
  changes with real GitHub release citations plus 2 security advisories**
- with `better-sqlite3` deleted (simulating a machine with no C++ toolchain)
  the server still started and `check_package` still caught the `reqeusts`
  typosquat — **the JSON fallback holds**

Also removed the `repository` field: it pointed at
`github.com/dhughes6071/driftwatch`, which 404s. A broken Repository button is
worse than none. It goes back when the repo exists.

---

## Store listing completed (2026-08-16)

All discoverability gaps closed. Verified live via the API:

| Field | State |
|---|---|
| Title | Career Site Job Scraper — Greenhouse, Ashby, Lever |
| Icon | set |
| seoTitle / seoDescription | set |
| Categories | JOBS, LEAD_GENERATION, AUTOMATION (3/3) |
| README | live (verified on the public page) |
| Input / output schema | both declared in build 0.3.1 |

**Two things I nearly "fixed" that were not broken.** The API's basic GET
returns `readme: null` and the console shows no checkmark against Output
schema — but the README renders correctly on the public page, and the build's
`actorDefinition.storages.dataset` is present with full view config. Checking
before acting saved two pointless changes.

**The listing is now maxed out.** Every field a competitor uses, we use.
Remaining visibility levers are all outside the Apify Store.
