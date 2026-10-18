# US Hospital, Nurse & Healthcare Jobs — Per Diem, Sign-On Bonus

Every open job at **68 of the largest US health systems**, read straight from their own career
sites and refreshed every night: Ascension, Trinity Health, Advocate, AdventHealth, SSM Health,
Sutter, Baylor Scott & White, BJC, MedStar, Tenet, Providence, Cleveland Clinic and more.
**113,000+ open roles**, each tagged with what a recruiter needs: role type, unit or specialty,
shift, per diem / travel / locum, sign-on bonus amount, required licenses, and pay where it's
stated (a third of all roles).

*Built and maintained by CMM Research.* Missing a health system, or need a custom feed?
Email us at [chazmichael_michaels@icloud.com](mailto:chazmichael_michaels@icloud.com).

**Who uses it**

- **Healthcare staffing and locum agencies.** See every new per diem, travel and hard-to-fill role
  at the systems you sell to, every morning, with `onlyNewSinceLastRun`.
- **Recruiters.** Find RN, allied and physician openings by unit, shift and state, with the
  sign-on bonus each one offers.
- **Healthcare job boards and newsletters.** A clean, deduplicated feed of hospital jobs with the
  hospital's own apply link.
- **Workforce and pay research.** What health systems pay nurses, by state, unit and shift.

## Why this one

- **The hospitals' own career sites, not job boards.** Workday, Oracle, Phenom, iCIMS and
  SmartRecruiters sites are collected every night, so the roles are current and the `url` is the
  hospital's own apply link.
- **Clinical tags, not just titles.** Each role is sorted into a role type (registered nurse, LPN,
  nursing support, advanced practice, physician, allied health by discipline, non-clinical), its
  unit or specialty (ICU, Emergency, OR, Med-surg, L&D, NICU…), its shift, and per diem / travel /
  locum / contract / part or full time.
- **Sign-on bonuses as numbers.** "Up to $7,500 Sign-On Bonus" becomes `signOnBonusAmount: 7500`,
  so you can filter for roles offering $10,000 or more.
- **Health systems you can join to other data.** Every role carries its health system's name,
  home state and bed count from AHRQ's Compendium of U.S. Health Systems.
- **Only what's new, on a schedule.** Turn on `onlyNewSinceLastRun` and schedule it daily: each
  run returns only roles added since the last one, so you never pay twice for the same job.

## Pricing

**$5 per 1,000 jobs** ($0.005 per job), plus Apify's standard $0.00005 run-start fee. On
Apify's paid plans it's cheaper: $4.50 (Starter), $4 (Scale) or $3.50 (Business) per 1,000.
Platform usage is included, so you are not billed for compute separately. A daily feed of every
new per diem RN role nationwide (about 330 a week in October 2026) costs about $7 a month.

- **`maxJobs`** is a hard cap per run (default 1,000, at most $5).
- **Apify's maximum cost per run** also works: if the limit is reached, the Actor stops cleanly
  and keeps everything delivered so far.

## Input

| Field | What it does |
|---|---|
| `titleKeywords` / `titleExcludeKeywords` | Case-insensitive filters on the job title. Keywords of 3 letters or fewer ("RN") match whole words. |
| `roleFamilies` | Registered nurse, LPN / LVN, Nursing support, Nursing leadership, Advanced practice provider, Physician, Allied health, Non-clinical. |
| `specialties` | Units and specialties: ICU, NICU, PICU, Emergency, Perioperative, Med-surg, Telemetry / step-down, Labor and delivery, Oncology, Cardiac, Behavioral health and more. |
| `employment` | per diem (includes PRN and casual), travel, locum, contract, part time, full time. |
| `shifts` | days, nights, evenings, rotating, weekends. |
| `onlySignOnBonus` / `minSignOnBonus` | Only roles offering a sign-on bonus, or at least this amount in USD. |
| `healthSystems` / `systemStates` / `minSystemBeds` | Pick health systems by name, home state or size. |
| `locationKeywords` | Where the job is: "Dallas", "Ohio", "TX". |
| `postedWithinDays` | Only recent roles. |
| `onlyWithSalary` / `minHourlyRate` | Only roles that state pay, or hourly roles paying at least this much. |
| `onlyNewSinceLastRun` / `monitorName` | Only roles added since this search last ran. |
| `includeDescription` | Adds the job description as plain text. |
| `maxJobs` / `maxJobsPerSystem` | Caps on results, and your cost control. |

## Output

| Field | Description |
|---|---|
| `title` | Role title |
| `healthSystem` / `healthSystemState` / `healthSystemBeds` / `healthSystemId` | The health system (AHRQ name, home state, staffed beds, AHRQ id) |
| `employer` | Employer name as shown on the career site |
| `location` / `additionalLocations` | Where the role is |
| `roleFamily` / `roleType` | E.g. "Allied health" / "Respiratory therapy" |
| `specialties` | Units and specialties named in the title or category |
| `shift` / `shiftHours` | E.g. ["nights"], 12 |
| `employment` | per diem, travel, locum, contract, part time or full time |
| `signOnBonus` / `signOnBonusAmount` | Whether a sign-on bonus is offered, and the amount when stated |
| `licenses` | Licenses and certifications the posting asks for (RN license, compact license, BLS, ACLS, PALS, NRP, ARRT…) |
| `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod` | Stated pay, e.g. 38 / 57 / USD / hour |
| `salaryAnnualMin` / `salaryAnnualMax` / `salaryText` | Pay per year, and the text it was read from |
| `department` / `employmentType` | As published |
| `postedAt` / `firstSeenAt` | When it was posted, and when the index first saw it |
| `url` | Apply link on the health system's own career site |
| `description` | Plain-text description (optional) |

## Examples

**New per diem ICU and ER nurse roles in Texas, every morning (schedule it daily)**
```json
{ "roleFamilies": ["Registered nurse"], "specialties": ["ICU", "Emergency"], "employment": ["per diem"], "locationKeywords": ["TX", "Texas"], "onlyNewSinceLastRun": true }
```

**Nurse roles offering a sign-on bonus of $10,000 or more**
```json
{ "roleFamilies": ["Registered nurse"], "minSignOnBonus": 10000, "maxJobs": 2000 }
```

**Hourly RN roles paying $60+ an hour**
```json
{ "roleFamilies": ["Registered nurse"], "minHourlyRate": 60, "maxJobs": 1000 }
```

**Every open physician and advanced practice role at Ascension and SSM Health**
```json
{ "healthSystems": ["Ascension", "SSM"], "roleFamilies": ["Physician", "Advanced practice provider"] }
```

## Instant API (Standby mode)

Need results inside your own app, in a second or two, without starting a run? This Actor also runs in **Standby mode**: it stays warm as a web API, and each request is one search.

```bash
curl "https://viridian-layout-ea2--us-hospital-jobs.apify.actor/?roleFamilies=Registered%20nurse&shifts=nights&employment=per%20diem&maxJobs=50" \
  -H "Authorization: Bearer YOUR_APIFY_TOKEN"
```

Every input field works as a URL parameter, with the same choices as the input form (`roleFamilies=Registered nurse`, `shifts=nights`); list fields take comma-separated values. A value that is not one of the choices gets an error listing them. Or POST the same JSON input you would give a run:

```bash
curl -X POST "https://viridian-layout-ea2--us-hospital-jobs.apify.actor/" \
  -H "Authorization: Bearer YOUR_APIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"healthSystems": ["Baylor Scott"], "roleFamilies": ["Registered nurse"], "onlySignOnBonus": true, "maxJobs": 100}'
```

The answer is JSON: `{"count", "stoppedBecause", "indexedAt", "jobs": [...]}`, with each job in the same format as a run's output. Same price as a run: you pay only for the jobs returned, and your spending limit trims the answer. Answers come back in well under a second. Up to 5,000 jobs per request; for daily "only new jobs" feeds, schedule a normal run with `onlyNewSinceLastRun`.

## Use it from Claude, Cursor or any AI agent (MCP)

Apify's hosted MCP server lets an AI assistant run this Actor as a tool. Add this to your
client's MCP settings:

```json
{
  "mcpServers": {
    "hospital-jobs": {
      "url": "https://mcp.apify.com?tools=viridian_layout_ea2/us-hospital-jobs"
    }
  }
}
```

The first time it connects, a browser window opens so you can sign in to Apify. In Claude Code,
run `claude mcp add --transport http hospital-jobs "https://mcp.apify.com?tools=viridian_layout_ea2/us-hospital-jobs"`.
Then ask, for example: *"Find night-shift ICU nurse jobs in Missouri with a sign-on bonus."*

## Notes

- Clinical tags come from each posting's own words, with simple rules. A tag is left empty
  rather than guessed, so a role with no unit in its title has no specialty.
- The index is rebuilt once a day. Every job's `indexedAt` says when.
- `onlyNewSinceLastRun` remembers each search in a key-value store named
  `healthcare-jobs-monitor` in your own Apify account.
- Coverage grows as we add health systems. 68 of the largest US systems are covered today;
  email us if you need one that isn't.
