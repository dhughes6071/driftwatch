# Workday Jobs Scraper

Get every open role from any company's **Workday career site** (`*.myworkdayjobs.com`,
`*.myworkdaysite.com`) as clean, structured data. Workday runs hiring for most of the
Fortune 500, including NVIDIA, Salesforce, TJX, Walmart and thousands more.

Paste a career site URL, or use the built-in list of **4,100+ verified Workday career
sites across 1,785 companies**, found through Common Crawl and each checked against the
live site.

> **Need startups too?** Most startups and scale-ups hire through Greenhouse, Ashby or
> Lever rather than Workday. Our [Greenhouse / Ashby / Lever Job Scraper](https://apify.com/viridian_layout_ea2/company-career-site-jobs)
> covers 3,500+ of them, with the **same output fields**, so the two datasets combine
> directly.

## Why this one

**It gets past Workday's hidden 2,000-job limit.** Many Workday sites never report more
than 2,000 results, and asking for results past 2,000 silently returns page one again. A
scraper that trusts the count misses jobs and gets duplicates, with no error. NVIDIA
reports 2,000 open roles and actually has 2,650.

When a site is capped like this, the Actor splits the search by job category (and by
location when a category is still too big) until every slice is under the limit. Then it
merges the slices and removes duplicates. Sites that report their real count are read
straight through. In testing on 26 Sep 2026 it returned **2,650 of NVIDIA's 2,650** roles
(14 seconds) and **all 11,357 of TJX's** (34 seconds), each exactly once.

- **Reads JSON, not HTML.** It calls the same public API the career site's own page
  uses. There's no browser, no proxy and no markup to break.
- **Job categories included.** Workday's own job family ("Engineering", "Sales") is
  returned as `department` whenever the site's categories cover every job. The Actor
  never drops a job to get a label.
- **Multi-location roles are handled properly.** The list view only says "5 Locations",
  so the Actor fetches all of them, and location filters match against every one.
- **Exact posting dates.** The list view only says "Posted 30+ Days Ago"; the Actor
  returns the real date.
- **Pay only for what you get.** Filters run before charging, so filtered-out roles are
  never billed.

## Pricing

**$1.50 per 1,000 jobs** ($0.0015 per job), plus Apify's standard $0.00005 run-start fee.
Platform usage is included, so you are not billed for compute separately.

You pay only for jobs actually delivered to your dataset:

- **`maxJobs`** is a hard cap per run. The default of 1,000 costs at most $1.50.
- **Apify's maximum cost per run** also works: if the limit is reached mid-run, the
  Actor stops cleanly and keeps everything delivered so far.
- Filters run before charging, so filtered-out roles are never billed.

## Input

| Field | What it does |
|---|---|
| `careerSiteUrls` | Any page on a Workday career site: the jobs page, or a single job. |
| `useCuratedList` | Also fetch from our registry of verified Workday career sites. |
| `companyKeywords` | Narrow the registry, e.g. `["bank", "health"]`. |
| `searchText` | Workday's own search box, run on each site. Fastest way to narrow a big employer. |
| `titleKeywords` / `locationKeywords` | Case-insensitive "contains" filters. |
| `remoteOnly` | Only roles whose location or workplace label says remote. |
| `postedWithinDays` | Only recent roles. |
| `includeDescription` | Adds the description, exact date, employment type, country and every location. Turn off for a faster run. |
| `maxJobs` / `maxJobsPerCompany` | Caps on results, and your main cost control. |

## Output

| Field | Description |
|---|---|
| `id` | Stable id: `workday:{company}:{requisitionId}` |
| `title` | Role title |
| `companyName` | The company's name, e.g. "Morgan Stanley" |
| `company` / `companySlug` | The company's Workday id, e.g. `ms` (stable, good for filtering and joins) |
| `careerSite` | Which of the company's career sites it came from |
| `location` / `additionalLocations` | Primary location and every other listed location |
| `country` | Country of the primary location |
| `remote` | A location or the workplace label says remote |
| `workplaceType` | The company's own label, verbatim: "Remote", "Hybrid", "Office - Flexible"… |
| `department` | Workday job family / category (null when the site's categories don't cover every job) |
| `postedAt` | ISO date |
| `postedOnText` | Workday's own label, e.g. "Posted 3 Days Ago" |
| `employmentType` | "Full time", "Part time"… |
| `jobReqId` | The company's requisition number |
| `url` | Apply link on the company's own career site |
| `description` | Plain-text description (optional) |

The field names match our [Greenhouse / Ashby / Lever jobs Actor](https://apify.com/viridian_layout_ea2/company-career-site-jobs),
so the two datasets can be combined.

## Examples

**Every engineering role at NVIDIA posted in the last week**
```json
{
  "careerSiteUrls": ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"],
  "titleKeywords": ["engineer"],
  "postedWithinDays": 7
}
```

**Remote data roles across the built-in list, titles and links only**
```json
{ "useCuratedList": true, "searchText": "data", "remoteOnly": true, "includeDescription": false, "maxJobs": 2000 }
```

**Nursing jobs in Texas at hospital systems in the list**
```json
{ "useCuratedList": true, "companyKeywords": ["health", "hospital"], "titleKeywords": ["nurse", "rn"], "locationKeywords": ["TX", "Texas"] }
```

## Notes

- Career sites that are unreachable or have no matching roles are skipped. One bad site
  never sinks a run, and the run's `SUMMARY` record lists what happened to each site.
- Some companies run several Workday career sites (Salesforce runs nine, including Slack
  and Tableau). A role listed on more than one of them is returned once.
- `companyName` is filled in for all 1,785 companies in the built-in list. For a career site outside the list it falls back to the Workday id.
