# Job Scraper — Greenhouse, Ashby, Lever ATS Career Sites

Scrape open roles from **3,500+ company career sites** running Greenhouse, Ashby,
or Lever.

Unlike other job scrapers, this one reads the **public JSON APIs** those
systems publish for syndication rather than parsing HTML — so it does not
break when a page changes.

> **Need big employers too?** Greenhouse, Ashby and Lever are mostly startups and
> scale-ups. Most of the Fortune 500 (NVIDIA, Salesforce, CVS, Lowe's) hire through
> Workday. Our [Workday Jobs Scraper](https://apify.com/viridian_layout_ea2/workday-jobs-scraper)
> covers 1,785 of them, with the **same output fields**, so the two datasets combine
> directly.
>
> **Want everything in one search?** Our [Career Site Jobs API](https://apify.com/viridian_layout_ea2/career-site-jobs-api)
> searches 900,000+ roles across Workday, Greenhouse, Ashby and Lever at once. The jobs
> are collected daily, so results come back in 10–20 seconds.

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
| `description` | Full description as plain text (optional) |
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

Slugs are usually just the company name in lowercase (`stripe`, `figma`, `ramp`).
Leave `ats` blank and we'll work out which system a company uses.

Pay is read only when it clearly is pay (not revenue, funding, bonuses or benefits), so
a missing salary is far more likely than a wrong one. A bare "$" is read as Canadian or
Australian dollars when the location is in Canada or Australia, otherwise US dollars. The
pay filters cost nothing extra: the pay comes with every job.

Companies that are unreachable or have no open roles are skipped — one bad
company never sinks a run.
