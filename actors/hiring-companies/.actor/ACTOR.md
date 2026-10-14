# Companies Hiring For Any Role — Hiring Signals & Sales Leads

Find **every company that's hiring for a role you care about**, and get one row per
company instead of thousands of job ads. Search for "Salesforce", "data engineer", "SDR" or
any title. You get back each company with how many matching roles it has open, how many are
new this week and this month, its total openings and hiring growth, top departments and
locations, the pay it advertises, and links to the roles.

It searches a **daily index of 1.7M+ open jobs on 19,000+ companies' own career sites**
(Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Oracle and 9 more hiring systems), so a
search across all of them takes about a minute. You don't need any coding, logins or proxies.

*Built and maintained by CMM Research.* Need a custom feed? Email us at
[chazmichael_michaels@icloud.com](mailto:chazmichael_michaels@icloud.com).

**Who uses it**

- **Sales teams selling to a job function.** A company hiring three Salesforce admins needs
  Salesforce consultants, tools and training. A company hiring SDRs is building a sales team.
  Hiring is a public, dated buying signal.
- **Recruiting and staffing agencies.** Find the companies with the most open roles in your
  specialty, and spot the ones hiring fastest.
- **Market research.** See which companies are investing in a skill, where, and at what pay.

**A real result** (search: `salesforce` in the United States, 14 Oct 2026):

```json
{
  "companyName": "ICF",
  "ats": "workday",
  "careerSiteUrl": "https://icf.wd5.myworkdayjobs.com/ICFExternal_Career_Site",
  "matchingJobs": 12,
  "matchingJobsNewLast7Days": 1,
  "matchingJobsNewLast30Days": 12,
  "totalOpenJobs": 397,
  "newJobsLast30Days": 256,
  "hiringGrowth": 0.64,
  "topDepartments": [{ "name": "Information Technology", "jobs": 11 }],
  "topLocations": [{ "name": "Reston, VA", "jobs": 11 }],
  "salaryMin": 67355,
  "salaryMax": 245448,
  "salaryCurrency": "USD",
  "sampleTitles": "Salesforce Developer- Remote; Salesforce Technical Consultant and Project Manager; Salesforce Business Analyst; Salesforce Administrator; Salesforce Quality Assurance Analyst",
  "sampleJobs": [
    { "title": "Salesforce Developer- Remote", "location": "Reston, VA", "postedAt": "2026-10-13", "url": "https://icf.wd5.myworkdayjobs.com/ICFExternal_Career_Site/job/Reston-VA/Salesforce-Developer--Remote_R2603468" }
  ]
}
```

Here, all 12 Salesforce roles were posted this month, and 64% of ICF's 397 openings are under 30 days old.

> **Want the jobs themselves?** Our [Career Site Jobs API](https://apify.com/viridian_layout_ea2/career-site-jobs-api)
> searches the same index and returns one row per job, with descriptions and salaries.

## Why this one

- **Companies, not job ads.** Most hiring-signal tools either check a list of companies you
  already have, or hand you thousands of job ads to sort through. This one starts from every
  company in the index and tells you who is hiring, one row each.
- **Size and momentum in every row.** Matching roles and *all* openings, plus how many are
  new in the last 7 and 30 days. `hiringGrowth` is the share of a company's openings posted in
  the last 30 days, so you can sort for companies in a hiring push.
- **Ghost listings filtered out.** Some career sites never take old ads down. Roles posted
  more than a year ago are left out of every count by default (`maxRoleAgeDays`).
- **Only new signals, on a schedule.** With `onlyNewSinceLastRun`, each scheduled run returns
  only companies that posted a matching role since the last run.
- **Pay where stated.** The pay range across a company's matching roles, read from the
  postings, per year.
- **Pay only for what you get.** Filters run before charging, so you're charged per company
  delivered, never per job scanned.

## Pricing

**$20 per 1,000 companies** ($0.02 per company), plus Apify's standard $0.00005 run-start fee.
On Apify's paid plans it's cheaper: $18 (Starter), $16 (Scale) or $14 (Business) per 1,000.
Platform usage is included, so you are not billed for compute separately. Every job in the
index is scanned on every run at no extra cost; you pay only for the companies returned.

- **`maxCompanies`** is a hard cap per run (default 200).
- **Apify's maximum cost per run** also works: if the limit is reached, the Actor stops
  cleanly and keeps everything delivered so far.

## Input

| Field | What it does |
|---|---|
| `titleKeywords` | The role you're looking for, e.g. `["salesforce"]`, `["data engineer", "analytics engineer"]`. |
| `titleExcludeKeywords` | Leave out titles containing these, e.g. `["intern"]`. |
| `locationKeywords` | Only count roles in these places, e.g. `["United States"]`, `["Texas"]`. |
| `remoteOnly` | Only count remote roles. |
| `postedWithinDays` | Only count roles posted in the last N days. |
| `minMatchingJobs` | Only companies with at least this many matching roles. |
| `minTotalOpenJobs` / `maxTotalOpenJobs` | Company size by total openings. |
| `sortBy` | Most matching roles, most new matching roles, fastest hiring growth, or most openings. |
| `companyKeywords` | Only companies whose name contains these (check a target-account list). |
| `sources` | Only some hiring systems. |
| `onlyWithSalary` / `minAnnualSalary` / `salaryCurrencies` | Only count roles that state pay, or pay at least this much. |
| `maxRoleAgeDays` | Ignore roles posted longer ago than this (default 365; 0 keeps all). |
| `onlyNewSinceLastRun` / `monitorName` | Only companies with matching roles added since this search last ran. |
| `maxCompanies` | Cap on results, and your main cost control. |

## Output

| Field | Description |
|---|---|
| `companyName` / `companyId` | Company name, and its stable id on its hiring system |
| `ats` / `careerSiteUrl` | Which hiring system it uses, and its jobs page |
| `matchingJobs` | Open roles matching your search |
| `matchingJobsNewLast7Days` / `matchingJobsNewLast30Days` | How many of those are new |
| `matchingJobsNewSinceLastRun` | With `onlyNewSinceLastRun`: matching roles added since the last run |
| `latestMatchingPostedAt` | Newest matching posting |
| `totalOpenJobs` / `newJobsLast7Days` / `newJobsLast30Days` | All open roles at the company, and how many are new |
| `hiringGrowth` | Share of all openings posted in the last 30 days (0–1) |
| `matchingRemoteJobs` | Matching roles marked remote |
| `topDepartments` / `topLocations` / `countries` | Where the matching roles sit |
| `salaryMin` / `salaryMax` / `salaryCurrency` / `matchingJobsWithSalary` | Yearly pay range across matching roles that state it |
| `sampleJobs` / `sampleTitles` | The 5 newest matching roles, with links |
| `indexedAt` | When the index was last refreshed |

## Examples

**Companies hiring Salesforce people in the US**
```json
{ "titleKeywords": ["salesforce"], "locationKeywords": ["United States"], "maxCompanies": 500 }
```

**Mid-size companies building a sales team this month**
```json
{ "titleKeywords": ["SDR", "BDR", "sales development"], "postedWithinDays": 30, "maxTotalOpenJobs": 500, "sortBy": "newMatchingJobs" }
```

**Weekly: companies newly hiring data engineers (schedule weekly)**
```json
{ "titleKeywords": ["data engineer"], "onlyNewSinceLastRun": true, "maxCompanies": 1000 }
```

**Which of my target accounts are hiring security engineers?**
```json
{ "companyKeywords": ["stripe", "datadog", "cloudflare"], "titleKeywords": ["security"] }
```

## Notes

- **Coverage.** The index covers companies that post jobs on their own career site through
  one of 15 hiring systems: 19,000+ companies, from startups to the Fortune 500. Companies
  that only post on LinkedIn or Indeed aren't included. It is refreshed daily.
- **Company names.** Most come from the career site. For Lever and Ashby, which only expose
  an id, the name is made readable from it ("cullen-jewellery" → "Cullen Jewellery").
- **No contact details.** You get the company and its careers page, not people's emails. Pair
  it with an enrichment tool if you need contacts.
- A role's age is its posting date, or the day the index first saw it when the site gives no
  date.
- `onlyNewSinceLastRun` remembers each search in a key-value store named
  `hiring-companies-monitor` in your own Apify account.
