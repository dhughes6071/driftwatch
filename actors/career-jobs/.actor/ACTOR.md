# Career Site Jobs API — 15 hiring systems, 1.7 million jobs

Search **every open role on 19,000+ companies' own career sites** in seconds, not hours.
That's more than 1.7 million jobs from 15 applicant-tracking systems, collected fresh every
day, with the stated pay range extracted for nearly 500,000 of them.

Large employers hire through Workday (NVIDIA, Salesforce, CVS, Lowe's, Morgan Stanley) or
Oracle Recruiting Cloud (JPMorgan Chase, Marriott, Kroger, Hilton, Macy's); mid-size and global
companies through SmartRecruiters (Bosch, Domino's, Accor), UKG (Buc-ee's, Big 5 Sporting
Goods, Ollie's) or Jobvite (JBS, Pilgrim's, MedVet); startups and small businesses through
Greenhouse, Workable, Ashby, Lever, BambooHR, Rippling, Breezy, Personio, Teamtailor and
Recruitee. This Actor covers all of them with one set of output fields.

| System | Jobs |
|---|---:|
| Workday | 863,000+ |
| Oracle Recruiting Cloud | 306,000+ |
| SmartRecruiters | 227,000+ |
| UKG Pro (UltiPro) | 107,000+ |
| Greenhouse | 91,000+ |
| Workable | 62,000+ |
| Ashby | 33,000+ |
| BambooHR | 28,000+ |
| Breezy HR | 19,000+ |
| Personio | 12,000+ |
| Recruitee | 12,000+ |
| Jobvite | 10,000+ |
| Teamtailor | 10,000+ |
| Rippling | 9,500+ |
| Lever | 3,000+ |

*Counts from the 29 Sep 2026 index; they change daily.*

## Why this one

- **Fast.** Every career site is collected once a day into an index, so a search
  doesn't crawl thousands of sites while you wait. A typical search finishes in 10–20 seconds.
- **Straight from the source.** Every role comes from the company's own career site, not
  a third-party job board, and the `url` is the company's own apply link.
- **Newest first.** Results are sorted by posting date, and `postedWithinDays` skips the
  old ones cheaply.
- **Nothing silently missing.** Workday hides everything past its first 2,000 results; the
  daily collection gets past that, so big employers like Dollar Tree (23,000+ roles) are
  complete.
- **Pay ranges as data.** About a quarter of all roles — far more in the US, where
  pay-transparency laws apply — state a salary or hourly rate. It's extracted into
  `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod`, annualised into
  `salaryAnnualMin` / `salaryAnnualMax`, and filterable. Each system's own structured pay data
  is used where it exists (Ashby, Rippling, UKG, Recruitee, and the pay fields of Breezy and BambooHR).
- **Only what's new, on a schedule.** Turn on `onlyNewSinceLastRun` and schedule the search
  daily: each run returns only roles added since the last one, so you never pay twice for
  the same job.
- **Real company names** (`companyName`), plus the career-site id (`company`) for joins.
- **Pay only for what you get.** Filters run before charging.

## Pricing

**$2 per 1,000 jobs**, plus Apify's standard run-start fee. Platform usage is
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
| `onlyNewSinceLastRun` | Only roles the index added since this same search last ran. The first run returns everything that matches. Changing any filter starts a new history. |
| `monitorName` | Optional. Keeps two searches with identical filters on separate histories (e.g. one per client). |
| `remoteOnly` | Only roles whose location or workplace label says remote. |
| `onlyWithSalary` | Only roles whose posting states pay. |
| `minAnnualSalary` | Only roles whose pay range reaches at least this per year, in the job's own currency (hourly × 2,080, monthly × 12). |
| `salaryCurrencies` | Only roles paying in these currencies, e.g. `USD`, `GBP`. |
| `sources` | Limit to any of the 15 systems (`workday`, `oracle`, `smartrecruiters`, `ukg`, `greenhouse`, `workable`, `ashby`, `lever`, `bamboohr`, `breezy`, `personio`, `rippling`, `teamtailor`, `recruitee`, `jobvite`). |
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
| `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod` | Stated pay: e.g. 120000 / 150000 / USD / year, or 18.5 / 22 / USD / hour. Null when the posting states none |
| `salaryAnnualMin` / `salaryAnnualMax` | The same range per year, for comparing hourly and salaried roles |
| `salaryText` / `salarySource` | The text it came from ("$120,000 - $150,000"), and whether it was published as data (`structured`) or read from the description |
| `url` | Apply link on the company's own career site |
| `description` | Plain-text description (optional) |
| `ats` | Which of the 15 systems the role came from |
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

**Software engineers in the US paying $150k+**
```json
{ "titleKeywords": ["software engineer"], "salaryCurrencies": ["USD"], "minAnnualSalary": 150000, "maxJobs": 2000 }
```

**Daily feed of new nursing roles in Ohio (schedule it once a day)**
```json
{ "titleKeywords": ["nurse", "RN"], "locationKeywords": ["Ohio", "OH"], "onlyNewSinceLastRun": true, "maxJobs": 5000 }
```

**Everything two companies have open**
```json
{ "companyKeywords": ["Morgan Stanley", "Stripe"], "maxJobs": 10000 }
```

## Notes

- Pay is read from each posting's own text, so it is as accurate as the posting. When a
  posting lists several ranges (one per state, say), the first is used. `salaryText` shows
  exactly what was read.

- The index is rebuilt once a day. The run's `SUMMARY` record and every job's `indexedAt`
  say exactly when. For a single company's roles to the minute, use the live Actors
  linked above.
- Roles disappear from the index within a few days of the company closing them.
- `onlyNewSinceLastRun` remembers each search in a key-value store named
  `career-site-jobs-monitor` in your own Apify account. If a run stops at `maxJobs` or your
  spending limit, the new roles it didn't deliver are not offered again, so set `maxJobs`
  comfortably above a day's volume.
- Jobvite career pages don't show a posting date, so Jobvite roles are dated by when the index
  first saw them (`firstSeenAt`).
- Teamtailor's feed lists at most 100 roles per company, so its very largest employers are
  partially covered.
