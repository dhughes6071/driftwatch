# Job actors: store wording and launch post (drafts, 30 Sep 2026)

Numbers are from the 30 Sep 2026 index and test runs. Re-check them on the day you post.

---

## 1. Store wording

Apify shows the **title** (max 63 characters) and the **short description** on every search
result and category card. The README's first paragraph is what Google indexes. People search
Apify for systems ("workday", "greenhouse"), for "jobs API" and for "salary", so those words
go first.

### Career Site Jobs API (`career-site-jobs-api`)

**Title** (58 chars)
> Career Site Jobs API — 1.7M Jobs with Salaries | $2 per 1K

**Short description**
> 1.7M open jobs from 19,000+ companies' own career sites (Workday, Oracle, Greenhouse,
> SmartRecruiters, UKG + 10 more), refreshed daily. Pay on 29% of jobs. Filter by title,
> location or salary, or get only new jobs each run. $2 per 1,000.

**README opening** (replaces the first paragraph)
> A jobs API built from the source: every open role on 19,000+ companies' own career sites,
> collected fresh every day and searchable in seconds. 1.8 million jobs from 15 hiring systems
> (Workday, Oracle, SmartRecruiters, UKG, Greenhouse, Workable, Ashby, Lever, BambooHR and
> more), with the stated pay range pulled out for more than 500,000 of them.
>
> **Who uses it**
> - **Job boards and newsletters.** Schedule a daily search with "only new jobs" turned on and
>   get a clean feed with no duplicates.
> - **Recruiters and sales teams.** See who is hiring for what, where, right now.
> - **Salary research.** Filter by minimum pay and currency across real, current postings.
> - **Labour-market and AI projects.** Build a large, structured, deduplicated job dataset
>   without running a scraper.

### Workday Jobs Scraper (`workday-jobs-scraper`)

**Title** (60 chars)
> Workday Jobs Scraper — Any myworkdayjobs Site, with Salaries

**Short description**
> Every open role from any Workday career site (myworkdayjobs.com): NVIDIA, Salesforce, CVS
> and 4,100+ built in. Gets past Workday's hidden 2,000-job cap. Salaries, pay filters and an
> only-new-jobs mode. Uses Workday's JSON API, so no browser or proxies.

**README opening**
> Scrape every open job from any company's Workday career site: the `myworkdayjobs.com`
> pages behind NVIDIA, Salesforce, CVS, Walmart and thousands more. Paste a career-site link,
> or search the built-in list of 4,100+ verified Workday sites by company name.
>
> **Who uses it**
> - **Tracking specific employers.** Schedule it with "only new jobs" and see each new opening
>   once.
> - **Competitive hiring intelligence.** Every role a competitor has open, with location,
>   category and pay.
> - **Big employers, complete.** Workday stops at 2,000 results; this doesn't (NVIDIA: all
>   2,650).

### Job Scraper — Greenhouse, Lever, Ashby (`company-career-site-jobs`)

**Title** (54 chars)
> Greenhouse, Lever & Ashby Jobs Scraper — with Salaries

**Short description**
> Jobs from 3,500+ companies on Greenhouse, Lever and Ashby, read from their public JSON APIs
> so it doesn't break. Pay on nearly half of all roles, pay and remote filters, full
> descriptions. 125,000+ open roles.

**README opening**
> Scrape jobs from the startups and tech companies that hire through Greenhouse, Lever and
> Ashby: Stripe, SpaceX, Anduril, Ramp, Figma and 3,500+ more. It reads the same public JSON
> job-board APIs those companies use for their own career pages, so there is no HTML to break
> and no proxy to pay for.
>
> **Who uses it**
> - **Tech job boards.** Startup and engineering roles from the source, with pay.
> - **Recruiters.** Every open role at a list of target companies in one run.
> - **Salary benchmarking.** Stated pay ranges, including each company's own structured pay
>   data where it publishes it.

---

## 2. Launch post: Show HN

**When:** a Tuesday to Thursday, 8–10am US Eastern. Stay around for the first two hours to
answer comments. That matters more than the text.

**Title** (73 chars, limit 80)
> Show HN: I indexed 1.7M jobs straight from 19,000+ companies' career sites

**Link:** https://apify.com/viridian_layout_ea2/career-site-jobs-api

**Text**

> Most job data comes from aggregators (LinkedIn, Indeed) that are scraped, deduplicated
> badly and a few days stale. But almost every employer publishes its jobs through a hiring
> system (Workday, Greenhouse, Oracle, Lever and so on), and most of those systems have a
> public JSON API behind the career page. So I collect from those directly.
>
> A crawler goes through 19,000+ companies' career sites every night across 15 systems and
> publishes a searchable index: 1.7M open jobs, about 50,000 new each
> day. A search takes seconds because it reads the index, not the sites.
>
> Things I didn't expect:
>
> - Workday search results stop at 2,000. Past that, the API quietly starts again from page
>   one. NVIDIA reports 2,000 open jobs and actually has 2,650. The fix is to split the
>   search by category and then by location until each part is under the cap.
> - Pay-transparency laws mean a lot of US postings state a salary, but almost never as a
>   field. I extract it from the text, favouring precision: revenue ("$86 billion in sales"),
>   funding rounds, insurance limits and signing bonuses are all refused. 29% of jobs end up
>   with a salary. Every format I missed was a surprise, like NVIDIA's "124,000 USD - 195,500
>   USD" with the currency after each number.
> - Lever's "description" field is only the opening paragraph. Requirements, benefits and pay
>   are in separate sections, which I'd been dropping.
> - One Oracle "career site" was a test server with 78,000 gibberish postings, and two UKG
>   employers came out named "Firefox" (the alt text of an unsupported-browser warning).
>
> It runs on Apify, so you can try it on their free credit. It's $2 per 1,000 jobs, and there's
> an "only jobs new since my last run" mode for daily feeds. There are also live scrapers for
> single Workday or Greenhouse/Lever/Ashby companies. If you just want to look at the data, a
> free 3,351-job sample is on Kaggle:
> https://www.kaggle.com/datasets/dhughes6071/company-career-site-jobs-with-salaries-oct-2026
>
> Happy to answer questions about any of the systems. Each one has its own odd way of breaking.

---

## 3. Reddit (one version per subreddit)

Check each subreddit's rules on self-promotion and flair before posting, and post them a day or
more apart. Reply to every comment in the first few hours.

### r/datasets

**Title**
> [Dataset] 3,351 current job postings with salaries, straight from 1,968 employers' own career sites (15 hiring systems)

**Text**
> I've been collecting job postings directly from the hiring systems employers publish them
> through (Workday, Oracle, Greenhouse, Lever, SmartRecruiters, UKG and 9 more) rather than from
> job boards. Here's a free one-week sample:
>
> - 3,351 jobs posted 1-7 Oct 2026, from 1,968 employers in 91 countries
> - every hiring system represented, at most 3 jobs per employer
> - 971 jobs (29%) with the stated salary normalised to min / max / currency / period, plus annualised figures
> - title, company, location, ISO country, remote flag, department, employment type, dates, apply URL
> - CC BY 4.0
>
> Dataset: https://www.kaggle.com/datasets/dhughes6071/company-career-site-jobs-with-salaries-oct-2026
> Starter notebook (pay by job type, how often pay is stated by country):
> https://www.kaggle.com/code/dhughes6071/who-s-hiring-and-what-they-pay-15-hiring-systems
>
> One thing that stood out: 42% of US postings state pay, against 29% in the UK and almost none
> in India or Brazil.
>
> The sample comes from a nightly index of about 1.7M open jobs. If you need more, it's
> searchable on Apify ($2 per 1,000 jobs): https://apify.com/viridian_layout_ea2/career-site-jobs-api
>
> Questions about how any field was built are welcome.

### r/webscraping

**Title**
> Lessons from scraping 19,000+ company career sites across 15 ATS platforms every night

**Text**
> Instead of scraping job boards, I collect jobs from the hiring systems companies publish them
> through: Workday, Greenhouse, Oracle, Lever, SmartRecruiters, UKG and 9 more. Most have a public
> JSON API behind the career page, so there's no HTML parsing and no proxies. The index refreshes
> nightly: about 1.7M open jobs, 50k new a day. A few things I learned:
>
> - **Workday caps search results at 2,000** and then silently wraps back to page one (NVIDIA
>   reports 2,000 jobs, has 2,650). Splitting by job category, then location, until each slice is
>   under the cap gets everything.
> - **Workable rate-limits hard.** Ten parallel requests hit 429 in seconds; one every 500 ms runs
>   clean. Its widget feed also repeats a job once per location, so dedupe on the shortcode.
> - **Lever's `descriptionPlain` is only the intro.** Requirements, benefits and pay live in
>   `lists` and `additionalPlain`.
> - **Greenhouse sends full descriptions for every job** (Stripe's board is 5.6 MB), but the plain
>   list is 12x smaller. Filter on that first and fetch details only for matches.
> - **Garbage data hides in plain sight:** an Oracle test server with 78,000 gibberish postings, and
>   UKG employers named "Firefox" (the alt text of an unsupported-browser warning).
>
> Free sample on Kaggle: https://www.kaggle.com/datasets/dhughes6071/company-career-site-jobs-with-salaries-oct-2026
> The full index is an Apify actor: https://apify.com/viridian_layout_ea2/career-site-jobs-api
>
> Happy to go deeper on any of the ATS APIs.
