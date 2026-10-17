# US hospital jobs: Kaggle sample and Reddit posts (drafts, 17 Oct 2026)

Numbers are from the 17 Oct 2026 index. Re-check them on the day you post. Post one at a time,
a few days apart, and read each subreddit's rules first: most allow a post that shares free data
or asks for feedback, but not a plain ad.

**Links to use**
- US Hospital & Nurse Jobs (new): https://apify.com/viridian_layout_ea2/us-hospital-jobs
- Career Site Jobs API: https://apify.com/viridian_layout_ea2/career-site-jobs-api
- Kaggle dataset (published 17 Oct 2026): https://www.kaggle.com/datasets/dhughes6071/us-hospital-job-postings-with-pay-oct-2026

**Facts to quote**
- 113,000+ open jobs at 68 large US health systems (Trinity Health, Advocate, AdventHealth, Sanford,
  Ascension, Tenet, SSM, Sutter, Baylor Scott & White, BJC, MedStar and more), refreshed nightly
- About 39,000 nursing roles and 10,600 per diem / PRN roles
- 33% state their pay. Median stated range for hourly Registered Nurse roles posted this week: $38–$57 an hour
- Every job comes straight from the hospital's own career site, with its apply link
- Free sample: 17,557 jobs posted 10–17 Oct 2026, 67 systems in 28 states, 5,757 with pay

---

## 1. Kaggle dataset page

**Title** (limit 50)
> US Hospital Job Postings with Pay (Oct 2026)

**Subtitle** (limit 80)
> 17,557 jobs posted in one week at 67 US health systems, 5,757 with stated pay

**URL slug**
> us-hospital-job-postings-with-pay

**Tags:** jobs and career, healthcare, nursing, employment, tabular

**License:** CC BY 4.0 (Attribution). The postings themselves belong to the employers.

**File:** `us-hospital-jobs-sample-2026-10-17.csv` (17,557 rows, 15 columns, 4.9 MB). It's in
`research/posts/`; upload it from there.

### About this dataset

Every job posted between 10 and 17 October 2026 on the career sites of 67 large US health
systems, collected straight from each hospital system's own site, not from job boards.

- **17,557 jobs** at **67 health systems** in **28 states**: Trinity Health, Advocate Health,
  AdventHealth, Sanford Health, Ascension, Tenet, SSM Health, Sutter Health, Baylor Scott & White,
  BJC HealthCare, MedStar Health and more
- **5,757 jobs (33%) with stated pay**, as min / max / currency / period. The median stated range
  for hourly Registered Nurse roles is $38–$57 an hour
- **1,407 per diem / PRN roles**
- Each health system is identified by its name, state and bed count from AHRQ's Compendium of U.S.
  Health Systems (2023), so the data joins to public hospital data

The sample comes from a nightly index of 113,000+ open jobs at 68 US health systems, built by
CMM Research. The full, daily-updated data is the
[US Hospital & Nurse Jobs](https://apify.com/viridian_layout_ea2/us-hospital-jobs) Actor on Apify,
filterable by role, unit, shift, per diem / travel, sign-on bonus, state and pay, with only-new
results for scheduled feeds.

### Columns

| Column | Meaning |
|---|---|
| `title` | Job title as posted |
| `health_system` | The health system, as named in AHRQ's Compendium |
| `system_state` | The health system's home state |
| `system_beds` | Total staffed beds across the system (AHRQ, 2023) |
| `company_name` | Employer name as shown on the career site |
| `location` | Primary location as posted |
| `department` | Job category, where published |
| `employment_type` | Full time, part time, per diem... where published |
| `posted_at` | Posting date (YYYY-MM-DD) |
| `salary_min` / `salary_max` | Stated pay range |
| `salary_currency` / `salary_period` | e.g. USD / hour |
| `url` | Apply link on the health system's own career site |
| `source` | The hiring system the job came from (Workday, Oracle, Phenom, iCIMS, SmartRecruiters) |

### Ideas

- What do health systems pay nurses, by state and specialty?
- Which systems post the most per diem and travel roles?
- Which roles are hospitals hiring for most this week?

---

## 2. r/datasets

**Title**
> [Dataset] 17,557 US hospital job postings from one week, from 67 health systems' own career sites (33% with pay)

**Body**
> I run a daily crawl of company career sites, and this month I added the big US hospital
> systems. Here's one week of their postings as a free CSV on Kaggle (CC BY 4.0):
>
> https://www.kaggle.com/datasets/dhughes6071/us-hospital-job-postings-with-pay-oct-2026
>
> - 17,557 jobs posted 10–17 Oct 2026 at 67 health systems in 28 states (Trinity, Advocate,
>   AdventHealth, Ascension, Tenet, SSM, Sutter, Baylor Scott & White, BJC, MedStar…)
> - 33% state their pay. Median hourly range for RN roles: $38–$57
> - Each system is tagged with its AHRQ Compendium name, state and bed count, so it joins to
>   public hospital data
> - Straight from each system's own career site, with the apply link, not scraped from job boards
>
> The full index (113k open hospital jobs, refreshed nightly, plus 1.7M jobs elsewhere) is
> searchable as an API, linked from the Kaggle page. Happy to answer questions about how it's
> collected.

---

## 3. r/recruiting, or a healthcare-staffing sub (this one doubles as the demand check)

Check the rules first: many recruiting subs only allow tools in a weekly thread. Lead with the
question, not the product.

**Title**
> Healthcare recruiters: would weekly hiring signals per hospital system be useful to you?

**Body**
> I collect every job posted on the career sites of ~70 of the largest US health systems each
> night (113k open roles right now: nursing, allied, physicians, per diem, travel). I'm trying to
> work out what's actually useful to people placing clinicians.
>
> The idea is a weekly report per hospital or system showing:
> - new openings this week, by role type
> - roles that keep getting reposted (hard to fill)
> - sign-on bonuses and pay ranges going up
>
> Would you use something like that? What would you need it to show, and what would it be worth
> to your team per month? Honest "no, here's why" answers help just as much.
>
> (If it helps, a free one-week sample of the raw postings is here: https://www.kaggle.com/datasets/dhughes6071/us-hospital-job-postings-with-pay-oct-2026)

Write down every answer. They're the demand check for the Healthcare Jobs Index.

---

## 4. r/webscraping (developer audience: the technical story)

**Title**
> Crawling 70 hospital career sites: Phenom's paging repeats results, and Workday started rejecting Node's fetch

**Body**
> I maintain a nightly crawl of ~19,000 company career sites (1.8M jobs) and just added the big US
> hospital systems. Two things I hit that might save someone time:
>
> **1. Phenom career sites page unreliably.** Many big employers (hospitals especially) use
> Phenom. Its search endpoint takes `from`/`size`, but paging through gives you repeats and skips
> others: 2,297 hits came back as about 2,000 unique jobs, and a different set each run. Sorting
> didn't help. What works: `size` caps at 500, so split the query by the category facet, then by
> city for any category over 500, until every slice fits in one request. That returned all 2,297.
>
> **2. Workday now returns HTTP 500 to Node's built-in fetch.** Overnight on 16–17 Oct most
> `myworkdayjobs.com` sites started failing with `"locale":"*"` in the error body. Node's fetch
> (undici) sends `Accept-Language: *` by default, and Workday's API now rejects it. curl worked
> because it sends no Accept-Language. The fix is one header: `Accept-Language: en-US`.
>
> Also useful: lots of iCIMS customers run their career site on Jibe, which serves every job,
> description included, from `/api/jobs?page=N&limit=100`. No auth.
>
> The result is searchable as an API on Apify (Career Site Jobs API) if anyone needs the data
> rather than the crawler.
