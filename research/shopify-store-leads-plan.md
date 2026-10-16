# Shopify store leads: competition and crawler/index plan (14 Oct 2026)

## 1. Competition (direct Apify Store searches, 14 Oct 2026)

There are 175 actors mentioning Shopify, with about 1,400 users a month combined. The **store-leads** part, where buyers want lists of stores, has about 500 users a month across five main actors:

| Actor | Users (30 days) | Price per 1,000 | What it does |
|---|---|---|---|
| clearpath/shopify-store-leads | 192 (4.4★, 4 reviews) | $6.00 | Stores by keyword or category, with emails, phones, ratings and socials |
| apivault_labs/website-leads-database | 128 | $8.00 | Pre-indexed Shopify/ecommerce sites, with email, phone and tech filters |
| ecommerce_leads/store-leads-14m | 103 | $6.00 | "14M" leads across 10 platforms, with apps and categories |
| igolaizola/shopify-store-finder | 43 | $5.00 | By keyword: email, estimated product count range |
| parsebird/shopify-store-leads-scraper | 29 | $3.70 | By keyword: contacts, sample products |

There are also product scrapers for a single store (trovevault 96 users and autofacts 84, about $1 per 1,000 products) and analyzers (apivault $15 per 1,000).

**What this means:**
- Contacts (email, phone, socials) are **table stakes**, since every leads rival has them.
- Prices run **$3.70–$8 per 1,000 stores**, lower than the Form D and hiring-signal niches.
- Several rivals already sit on big pre-built databases. We can't win on "we have a database" alone.

**Where we can be different** (no rival offers these together):
1. **Freshness and change signals.** Every store gets re-checked on a rolling ~7-day cycle, which gives us:
   - "new stores found this week", for a scheduled `onlyNewSinceLastRun` feed;
   - catalog growth (products added in the last 30 days);
   - stores that went dark.
2. **Catalog facts as filters:**
   - product count;
   - price band (median and range);
   - top product types and vendors;
   - the date the newest product was published (shows the store is active);
   - shipping countries, currency, country and city.
3. **Speed.** Answers in seconds from the index, like our Career API.

## 2. What a Shopify store exposes (tested on 120 real stores)

- **`/meta.json`** worked on **118 of 120 (98%)**. It gives:
  - name, description, city, province, country, currency and domain;
  - `myshopify_domain`;
  - `published_products_count`;
  - `ships_to_countries`.

  Big "headless" brands (Gymshark, Bombas) block it. The long tail, which is the actual market for leads, does not.
- **Homepage HTML:**
  - an email on **62%** of stores;
  - social links on **89%** (share buttons need filtering out);
  - a phone on **11%**. Adding `/pages/contact` should raise the phone and email rates.
- **`/products.json?limit=250`**, page 1 only: price band, product types, vendors and recent `published_at` dates.
- Median response time is about 1 second.
- **robots.txt:** Shopify's default allows all of these paths for `*` (only `Nutch` is fully blocked). We will still read each store's robots.txt and skip anything disallowed.

## 3. How we find stores (discovery)

Common Crawl's URL index barely has any `*.myshopify.com` pages: most stores live on their own domain. **DNS works instead.** A store on a custom domain points its A record at Shopify's `23.227.38.x` addresses (verified: allbirds.com is 23.227.38.32).

- **Tranco top-1M list** (free, refreshed daily):
  - 3.3% of a 5,000-domain sample were Shopify, so roughly **33,000 stores** in the full list;
  - 5,000 DNS checks took 12 seconds, so the full million is about 40 minutes.
- **Common Crawl domain graph** (free, quarterly): `cc-main-2026-jul-aug-sep` domain vertices is a **879 MB** download of roughly 100M+ domains.
  - **Expected store count:** the long-tail Shopify share is unknown until measured. If it is 0.5–1.5%, that's about **0.5–1.5M stores**.
  - **Time:** DNS-checking 100M domains at about 400 per second is about 70 hours, run over several nights, after which only the quarterly updates need checking.
  - **Resolver:** a local caching DNS resolver avoids hammering 1.1.1.1 and 8.8.8.8.
- **Later, optional:** ICANN CZDS zone files give daily newly registered .com domains, which would surface true "new stores". It needs **you** to apply for access (a form with your details), so we'll leave it out of the first version.

## 4. Architecture (same pattern as the Career API)

On the Mac mini, using launchd and SQLite:

1. **discover** (weekly): DNS-check domain lists, then insert new Shopify hosts into `stores(domain, first_seen, last_seen_live, status)`.
2. **enrich** (nightly, rolling):
   - **What it fetches:** for each store due a check, read `robots.txt`, `meta.json`, the homepage, `/pages/contact` when no email or phone was found, and page 1 of `products.json`.
   - **Order:** new stores first, then the oldest checks.
   - **Load:** about 3–4 requests per store. With about 150k stores a night at 1 request per store at a time and about 40 stores in parallel, the whole set cycles about weekly.
3. **publish** (nightly): gzip JSONL shards plus a manifest, uploaded to an Apify key-value store. The actor reads them through a secret signed link, exactly like `CAREER_MANIFEST_URL`.
   - **Size:** about 1.5 KB per store, so roughly 300 MB gzipped at 1M stores.

**On Apify, the actor** `shopify-store-leads`:
- **Searches the index by:**
  - country, city or state;
  - currency and shipping countries;
  - product count;
  - price band;
  - keywords in name, description, product types or vendors;
  - has email or phone;
  - first-seen date;
  - catalog growth.
- **Feed mode:** `onlyNewSinceLastRun` returns only stores newly found since the last run.
- **Charging:** one charge per store delivered. Platform cost is pennies, like the Career API.

## 5. Risks

1. **Shopify rate limits.** All stores sit behind Shopify's own servers, so even though the stores are different, Shopify sees one IP (the Mac mini) making all the requests. A blocked IP is the main risk. Mitigations:
   - start slowly and measure 429/403 rates;
   - back off automatically;
   - keep overall request rates modest.

   Fallback: run enrichment on Apify with proxies, which costs money, so we'd ask first.
2. **Contact data and privacy.** Only emails and phones the store itself publishes on its own pages: no guessing, no personal-email enrichment. The README will say so.
3. **Mac mini capacity.** Discovery and enrichment both run there, alongside the nightly job crawl. Schedule them so they don't overlap.
4. **Store count.** Unknown until the Common Crawl list is measured. If it comes out small, the pitch becomes "fresh and filterable" rather than "biggest".

## 6. Proposed phases

1. **Measure (about 1 hour, no cost).**
   - Download the CC domain list.
   - DNS-check a random 50k sample for the Shopify share.
   - Enrich 1,000 stores while watching Shopify's 429 and 403 rates.

   Result: real numbers for store count and blocking risk. **Stop and review.**
2. **Build** the crawler (discover, enrich, publish) and the actor, starting from `actors/career-jobs/` as the template.
3. **First full discovery** (Tranco 1M plus the CC list over several nights), then a beta actor on Apify.
4. **Price and publish** after your go-ahead. Rivals are $3.70–8 per 1,000; we might sit around $5, with discounts.

## 7. Phase 1 results (measured 14 Oct 2026)

**How many stores exist**
- The Common Crawl `cc-main-2026-jul-aug-sep` domain list has **133.2M domains** (a 976 MB download that took 93 s).
- A random sample of 50,000 found **1.40% on Shopify**, which estimates **about 1.9M Shopify domains** in the list.
- Of those, **76% are live stores**; the rest are closed (402), password-protected, or not readable.
- So the estimate is **about 1.4M live stores**, of which about 57% (roughly 800k) added a product in the last 90 days.
- DNS speed was about 520 checks a second, so the whole list takes about 70 hours, spread over several nights.

**Blocking test.** We fetched full details for 1,000 stores (698 from Common Crawl and 302 from the top-1M list), running 20 stores in parallel. That made 4,413 requests at 25.8 requests a second:
- **Rate-limit refusals (429):** zero.
- **Blocked (403):** 8 in total, all single requests at one store each.
- **Failure trend:** failures fell over the run rather than rising (60 of 900 in the first 30 s, then 2 of 297 at the end). They were dead or broken domains (connection errors), not throttling.
- **Speed:** median 476 ms per request, and 95% finished within 1.8 s.
- **Throughput:** about 5.8 stores a second, or about 500k stores a day. A weekly refresh of 1.4M stores needs about 3 days of crawling a week at this rate.

**Data quality on live stores**

| | Common Crawl long tail (528 live) | Top-1M (292 live) |
|---|---|---|
| Live rate | 76% | 97% |
| Has email (homepage + contact page) | 59% | 68% |
| Has phone | 14% | 29% |
| Has social links | 75% | 91% |
| Added a product in the last 90 days | 57% | 94% |
| Median product count | 61 | 1,006 |
| Top countries | US, GB, AU, CA, DE, IT | US, IN, DE, GB, CA, HK |

**Verdict:** the plan works. Both the store count (about 1.4M live) and the blocking risk (none seen at about 26 requests a second) are good enough to build. Keep the backoff logic anyway, because Shopify's tolerance at sustained daily volume is still untested.

## 8. Phase 2 build and first real runs (14 Oct 2026)

**Built** in `actors/shopify-stores/`:
- **crawler/**
  - `discover.ts`: DNS check of a domain list, resumable.
  - `enrich.ts`: checks robots.txt, meta.json, the homepage, the contact page and products.json.
  - `publish.ts`: gzip shards plus a manifest, uploaded to the Apify key-value store `shopify-stores-index`.
  - `run-daily.sh` and the launchd plist. **Not installed yet.**
- **src/**: the actor (filters, sorting, only-new feed).
- **Tests:** 13, covering the parsers, each store outcome, the throttle and the full pipeline.

**Top-1M (Tranco) run**
- **Found:** 31,097 Shopify stores in 50 minutes, at about 335 domains a second sustained.
- **First 3,000 stores checked:** about 95% live. Of the live stores:
  - 60% have an email;
  - 23% a phone;
  - 85% Instagram;
  - 97% a detected theme;
  - 90% at least one detected app.

**Rate limit found.** About 25 requests a second held for 3 minutes in phase 1, but sustained for 10 minutes Shopify's edge started refusing (17–21% of responses). The throttle backed off and then stopped the run as designed. Our IP was not banned: requests made one at a time were fine straight afterwards.
- **8 requests a second:** sustained 10 minutes with 0.25% refusals (all single stores' own bot protection). That is the default now.
- **Fixes made:**
  - a cap on requests per second;
  - a store refused on any page is retried later instead of being saved without its catalog;
  - robots.txt is cached for 30 days;
  - a single store's parsing error can no longer stop the run (likely cause of one crash: a malformed `%` link).

## 9. The full 133M-domain run: plan

**Capacity at 8 requests a second:** about 4 requests per store once robots.txt is cached, which is about 2 stores a second.

| Step | Volume | Time | Schedule |
|---|---|---|---|
| Discover the CC list (DNS only, never touches Shopify) | 133M domains, so about 1.9M Shopify domains | about 110 h at about 335/s | 15 h a day in the background, so **about 7–8 days** |
| First enrichment of everything found | about 1.9M domains, about 1.4M live | about 100k stores a day in a 16 h window | **about 2–3 weeks** for the first full pass. Stores are published as they're checked, so the index grows daily |
| Steady state | 1.4M live stores, re-checked every 14 days | about 100k a day | 16 h a day. This is at capacity, so try 10 requests a second after a clean week |

**Daily schedule** (`com.x402.shopify-stores`, 10:00 to about 02:00, clear of the 03:30 career-jobs crawl):
1. Refresh the Tranco list (re-read on Mondays).
2. Run CC discovery in the background for 15 h.
3. Enrich for 16 h at 8 requests a second.
4. Publish.

Alerts go to `data/logs/alerts.log` plus a macOS notification if Shopify refusals stop the run, or if discovery or publishing fails.

**Disk:** the CC list is 976 MB. The SQLite database should reach about 3–4 GB at 1.9M rows (cached robots.txt is most of it). There is 109 GB free.

**Launch timing:** publish the actor once the index passes about 100k live stores, roughly day 2 of enrichment. Until then the top-1M stores (about 30k) are enough for a private beta.

### Update, 23:10 UTC: the rate limit is tighter than 8 requests a second sustained

After the clean 10 minutes at 8 requests a second, two restarts at 8/s were refused straight away (12–18%). The stores themselves were fine: 30 waiting stores fetched one every 2 seconds all returned 200, with no Cloudflare challenge. So Shopify's edge limits our IP's request volume over a window longer than 10 minutes. The adaptive throttle settled at about 4 requests a second, clean, which is about 0.85 stores a second.

**What this means for capacity** at about 4 requests a second and 16 hours a day: roughly 50–75k stores a day. Ways to raise it, cheapest first:
1. **Fewer requests per store on re-checks.** Contact details rarely change, so re-read the contact page monthly, not every check. robots.txt is already cached. A re-check would then be about 3 requests (meta.json, homepage, products.json).
2. **A longer cycle:** re-check live stores every 21–28 days instead of 14.
3. **Index size:** start with the top-1M stores plus the most active part of the Common Crawl list rather than all 1.9M domains.
4. **Proxies on Apify** would remove the limit but cost money. We'd ask first.

**Next:** let tonight's crawl run adaptively, then use its real throughput to set the cycle length before installing the daily schedule.

### Overnight result, 15 Oct 2026: 8 requests a second holds once the burst penalty clears

- **The run:** 28,213 stores checked in 4.7 hours, at a **steady 1.7 stores a second**, with 191 refusals (0.7%, all single stores). It never slowed after 23:12. The earlier refusals were a temporary penalty for the 25/s burst, not the long-run limit.
- **Capacity:**
  - about 98k stores a day in the planned 16-hour window, so 1.4M stores every **about 14 days** is feasible as planned;
  - Common Crawl discovery runs alongside it and never touches Shopify.
- **Top-1M index:** 29,794 live stores out of 31,097 found. Of those live stores:
  - 73% have an email;
  - 28% a phone;
  - 61% added a product in the last 90 days.
- **Bug found and fixed:** responses were cut at 1.5 MB, so a full 250-product `products.json` often got cut and couldn't be parsed. That cost a third of live stores their catalog data. Now only HTML is cut off. The 9,776 affected stores are being re-checked.
