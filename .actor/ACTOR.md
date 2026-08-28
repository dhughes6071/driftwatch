# Job Scraper — Greenhouse, Ashby, Lever ATS Career Sites

Scrape open roles from **3,584 company career sites** running Greenhouse, Ashby,
or Lever.

Unlike other job scrapers, this one reads the **public JSON APIs** those
systems publish for syndication rather than parsing HTML — so it does not
break when a page changes.

## Why this one

Most job scrapers parse HTML from job boards. HTML changes, so they break — which
is why the category's ratings sit between 3.6 and 4.0 stars.

This reads **documented JSON APIs**. There is no markup to change, no anti-bot
arms race, and no proxy bill. When a company posts a role, it appears here.

- **Straight from the source** — the company's own board, not a third-party aggregator
- **One schema across three ATSs** — Greenhouse, Ashby, and Lever normalized identically
- **Curated registry included** — 3,584 verified companies, 125,000+ open roles, or name your own
- **You pay per job returned** — capped by `maxJobs`, and never charged past your budget

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

## Examples

**Every remote engineering role across the curated list**
```json
{ "useCuratedList": true, "remoteOnly": true, "titleKeywords": ["engineer"], "maxJobs": 500 }
```

**Specific companies, recent postings only**
```json
{ "companies": [{ "slug": "stripe" }, { "slug": "ramp" }], "postedWithinDays": 14 }
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

Companies that are unreachable or have no open roles are skipped — one bad
company never sinks a run.
