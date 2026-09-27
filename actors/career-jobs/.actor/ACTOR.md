# Career Site Jobs API — Workday, Greenhouse, Lever, Ashby

Search **every open role on {{COMPANIES}} companies' own career sites** in seconds.
That's {{JOBS}} jobs from Workday, Greenhouse, Ashby and Lever, collected fresh every day.

Most of the Fortune 500 hire through Workday (NVIDIA, Salesforce, CVS, Lowe's, Morgan
Stanley). Startups and scale-ups use Greenhouse, Ashby and Lever. This Actor covers both,
with one set of output fields.

## Why this one

- **Instant.** Every career site is collected once a day into an index, so a search
  doesn't crawl thousands of sites while you wait. A typical run finishes in seconds.
- **Straight from the source.** Every role comes from the company's own career site, not
  a third-party job board, and the `url` is the company's own apply link.
- **Newest first.** Results are sorted by posting date, and `postedWithinDays` skips the
  old ones cheaply.
- **Nothing silently missing.** Workday hides everything past its first 2,000 results; the
  daily collection gets past that, so big employers like Dollar Tree (23,000+ roles) are
  complete.
- **Real company names** (`companyName`), plus the career-site id (`company`) for joins.
- **Pay only for what you get.** Filters run before charging.

## Pricing

**{{PRICE}} per 1,000 jobs**, plus Apify's standard run-start fee. Platform usage is
included, so you are not billed for compute separately.

- **`maxJobs`** is a hard cap per run.
- **Apify's maximum cost per run** also works: if the limit is reached mid-run, the Actor
  stops cleanly and keeps everything delivered so far.

## Input

| Field | What it does |
|---|---|
| `titleKeywords` / `titleExcludeKeywords` | Case-insensitive "contains" filters on the job title. |
| `locationKeywords` | Matches any listed location or the country. |
| `companyKeywords` | Matches the company name or its career-site id. |
| `postedWithinDays` | Only recent roles. Undated roles count from the day the index first saw them. |
| `remoteOnly` | Only roles whose location or workplace label says remote. |
| `sources` | Limit to Workday, Greenhouse, Ashby and/or Lever. |
| `includeDescription` | Adds the full description as plain text. |
| `maxJobs` / `maxJobsPerCompany` | Caps on results, and your cost control. |

## Output

| Field | Description |
|---|---|
| `id` | Stable identifier |
| `title` | Role title |
| `companyName` / `company` | Company name, and its career-site id |
| `location` / `additionalLocations` / `country` | Every listed location (country where the site publishes it) |
| `remote` / `remoteEligible` / `workplaceType` | Remote signals, and the company's own workplace label where published |
| `department` | Team or job category |
| `postedAt` | When the company posted the role |
| `firstSeenAt` | When the index first saw it. A reliable "new since" signal, even for undated roles |
| `employmentType` | Full time, part time, contract… where published |
| `url` | Apply link on the company's own career site |
| `description` | Plain-text description (optional) |
| `ats` | Workday, Greenhouse, Ashby or Lever |
| `indexedAt` | When the index this run read was built |

The field names match our [Workday](https://apify.com/viridian_layout_ea2/workday-jobs-scraper)
and [Greenhouse / Ashby / Lever](https://apify.com/viridian_layout_ea2/company-career-site-jobs)
Actors, which fetch a company's jobs live when you need the very latest.

## Examples

**Data engineers in Texas, last 7 days**
```json
{ "titleKeywords": ["data engineer"], "locationKeywords": ["Texas", "TX"], "postedWithinDays": 7 }
```

**Every new remote role in the last day, titles and links only**
```json
{ "remoteOnly": true, "postedWithinDays": 1, "includeDescription": false, "maxJobs": 20000 }
```

**Everything two companies have open**
```json
{ "companyKeywords": ["Morgan Stanley", "Stripe"], "maxJobs": 10000 }
```

## Notes

- The index is rebuilt once a day. The run's `SUMMARY` record and every job's `indexedAt`
  say exactly when. For a single company's roles to the minute, use the live Actors
  linked above.
- Roles disappear from the index within a few days of the company closing them.
