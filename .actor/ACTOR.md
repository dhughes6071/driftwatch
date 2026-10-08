# Greenhouse, Lever & Ashby Jobs Scraper — with Salaries

Get **every open job at Stripe, SpaceX, Ramp, Figma and 3,500+ other startups and tech
companies**, read from the Greenhouse, Lever and Ashby job boards they publish themselves,
so it doesn't break when a page changes. Get job titles, locations, posting dates,
descriptions, and salaries where the posting states them (nearly half of all jobs), as
clean JSON, CSV or Excel. You don't need any coding, proxies or servers.

*Built and maintained by CMM Research.* Missing a company, or need a custom feed?
Email us at [chazmichael_michaels@icloud.com](mailto:chazmichael_michaels@icloud.com).

**Who uses it**

- **Tech job boards.** Startup and engineering roles from the source, with pay.
- **Recruiters.** Every open role at a list of target companies in one run.
- **Salary benchmarking.** Stated pay ranges, including each company's own structured pay
  data where it publishes it.

**A real result** (Stripe, 7 Oct 2026):

```json
{
  "title": "Offensive Security Engineer",
  "company": "stripe",
  "location": "US - Remote",
  "remote": true,
  "department": "8611 Security Analytics",
  "postedAt": "2026-09-25T14:53:02-04:00",
  "employmentType": null,
  "salaryMin": 170400,
  "salaryMax": 255700,
  "salaryCurrency": "USD",
  "salaryPeriod": "year",
  "salaryText": "$170,400 – $255,700",
  "url": "https://stripe.com/jobs/search?gh_jid=8233889",
  "ats": "greenhouse"
}
```

Every job also comes with its description (plain text, up to 8,000 characters) and the fields listed under **Output** below.

> **Need big employers too?** Greenhouse, Ashby and Lever are mostly startups and
> scale-ups. Most of the Fortune 500 (NVIDIA, Salesforce, CVS, Lowe's) hire through
> Workday. Our [Workday Jobs Scraper](https://apify.com/viridian_layout_ea2/workday-jobs-scraper)
> covers 1,785 of them, with the **same output fields**, so the two datasets combine
> directly.
>
> **Want everything in one search?** Our [Career Site Jobs API](https://apify.com/viridian_layout_ea2/career-site-jobs-api)
> searches 1.8 million jobs from 19,600 companies across 15 hiring systems at once
> (Workday, Oracle, Greenhouse, Lever, Ashby and more). The jobs are collected daily, so
> results come back in seconds.

## Why this one

Most job scrapers parse HTML from job boards. HTML changes, so they break — which
is why the category's ratings sit between 3.6 and 4.0 stars.

This reads **documented JSON APIs**. There is no markup to change, no anti-bot
arms race, and no proxy bill. When a company posts a role, it appears here.

- **Straight from the source** — the company's own board, not a third-party aggregator
- **One schema across three ATSs** — Greenhouse, Ashby, and Lever normalized identically
- **Pay ranges as data** — Ashby's own pay data where the company publishes it, otherwise the
  range stated in the description, as `salaryMin` / `salaryMax` / `salaryCurrency` /
  `salaryPeriod`, annualised, and filterable with `onlyWithSalary`, `minAnnualSalary` and
  `salaryCurrencies`
- **Only what's new, on a schedule** — turn on `onlyNewSinceLastRun` and schedule the run:
  each run skips every job that search has already delivered, so you track new openings
  without paying twice for the same job
- **Curated registry included** — 3,500+ verified companies, 120,000+ open roles, or name your own
- **Simple pricing** — $1.50 per 1,000 jobs delivered, no platform usage on top; `maxJobs` caps the cost per run

## Pricing

From **10 October 2026**: **$1.50 per 1,000 jobs** ($0.0015 per job), plus
Apify's standard $0.00005 run-start fee. Platform usage is included — you are
not billed for compute separately. Until then it is free.

You pay only for jobs actually delivered to your dataset. Two ways to control
spend:

- **`maxJobs`** — hard cap on results per run. The default of 1,000 costs at most $1.50.
- **Apify's maximum cost per run** — if your limit is reached mid-run, the
  Actor stops cleanly and keeps everything delivered so far.

Filters (`remoteOnly`, `titleKeywords`, `locationKeywords`, `postedWithinDays`)
run before charging, so filtered-out roles are never billed.

## Output

| Field | Description |
|---|---|
| `id` | Stable identifier: `{ats}:{company}:{nativeId}` |
| `title` | Role title |
| `company` / `companySlug` | Company |
| `location` | Location as published |
| `remote` | The location text itself says remote — precise |
| `remoteEligible` | The company's own ATS flag — broader, less precise (see note) |
| `department` | Team or department |
| `postedAt` | ISO 8601 posting date |
| `url` | Canonical apply link on the company's own board |
| `description` | Job description as plain text, up to 8,000 characters (optional) |
| `employmentType` | Full-time, contract, etc. where published |
| `ats` | Which system it came from |
| `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod` | Stated pay, e.g. 150000 / 180000 / "USD" / "year" (null when none is stated) |
| `salaryAnnualMin` / `salaryAnnualMax` | The same pay per year (hour × 2,080, week × 52, month × 12) |
| `salaryText` | Exactly what the pay was read from, so you can check it |
| `salarySource` | `structured` (the company's own Ashby pay data) or `description` (read from the text) |

## Examples

**Every remote engineering role across the curated list**
```json
{ "useCuratedList": true, "remoteOnly": true, "titleKeywords": ["engineer"], "maxJobs": 500 }
```

**Specific companies, recent postings only**
```json
{ "companies": [{ "slug": "stripe" }, { "slug": "ramp" }], "postedWithinDays": 14 }
```

**Engineering roles paying $180k+ a year**
```json
{ "useCuratedList": true, "titleKeywords": ["engineer"], "minAnnualSalary": 180000, "salaryCurrencies": ["USD"], "maxJobs": 1000 }
```

**Daily alert: new jobs at your target companies (schedule it once a day)**
```json
{ "companies": ["stripe", "ramp", "figma"], "onlyNewSinceLastRun": true, "maxJobs": 5000 }
```

**Fast and cheap — titles and links only**
```json
{ "useCuratedList": true, "includeDescription": false, "maxJobs": 2000 }
```

## A note on `remote`

Applicant tracking systems disagree about what "remote" means. Ashby flagged 112
of Ramp's 123 roles as remote while listing every one at "New York, NY (HQ)" —
that field means *remote-eligible*, not *remote*.

So we publish both signals rather than picking one and hiding the ambiguity:

- **`remote`** — the location text actually says remote. Trust this one.
- **`remoteEligible`** — what the company declared. Broader, noisier.

`remoteOnly` matches either. Filter on `remote` alone if you want only
genuinely location-independent roles.

## Notes

Name companies however is easiest: `"stripe"`, a job-board link such as
`"https://jobs.lever.co/veeva"`, or `{"slug": "ramp", "ats": "ashby"}`. Slugs are usually
just the company name in lowercase. Leave `ats` blank and we'll work out which system a
company uses. If a company has no public Greenhouse, Lever or Ashby board, the run log says so.

`onlyNewSinceLastRun` remembers each search's delivered jobs for 180 days in a key-value store
named `company-career-site-jobs-monitor` in your own Apify account. Jobs cut off by `maxJobs`
or your spending limit are still delivered on the next run.

Pay is read only when it clearly is pay (not revenue, funding, bonuses or benefits), so
a missing salary is far more likely than a wrong one. A bare "$" is read as Canadian or
Australian dollars when the location is in Canada or Australia, otherwise US dollars. The
pay filters cost nothing extra: the pay comes with every job.

Companies that are unreachable or have no open roles are skipped — one bad
company never sinks a run.
