# Kaggle dataset page (draft, 7 Oct 2026)

**Title** (Kaggle limit 50 characters)
> Company Career Site Jobs with Salaries (Oct 2026)

**Subtitle** (limit 80)
> 3,351 recent job postings from 1,968 employers' own career sites, 15 ATS systems

**URL slug**
> company-career-site-jobs-with-salaries

**Tags:** jobs and career, employment, business, tabular, salary

**License:** CC BY 4.0 (Attribution), with the note below that the postings themselves belong to the employers.

**File:** `career-jobs-sample-2026-10-07.csv` (3,351 rows, 17 columns, 0.9 MB)

---

## About this dataset

A sample of real, currently open job postings collected straight from companies' own career
sites, not from job boards or aggregators. Every row comes from the hiring system the employer
publishes its jobs through: Workday, Oracle Recruiting Cloud, SmartRecruiters, UKG, Greenhouse,
Workable, Ashby, Lever, BambooHR, Breezy, Personio, Recruitee, Teamtailor, Rippling and Jobvite.

- **3,351 jobs** posted or first seen between 1 and 7 Oct 2026
- **1,968 employers** in **91 countries**, at most 3 jobs per employer for variety
- **All 15 hiring systems**, roughly in proportion to their share of jobs (at least 60 rows each)
- **971 jobs (29%) with a stated salary**, normalised to min / max / currency / period and annualised

The sample comes from a daily index of about 1.7 million open jobs at 19,000+ companies, built by
CMM Research. The full index, refreshed nightly and searchable by title, location, company and
salary, is available as the
[Career Site Jobs API](https://apify.com/viridian_layout_ea2/career-site-jobs-api) on Apify.

## Columns

| Column | Meaning |
|---|---|
| `title` | Job title as posted |
| `company` | Employer name |
| `location` | Primary location as posted |
| `country` | Country of the primary location, where the system gives one |
| `remote` | The location or workplace label says remote |
| `department` | Team, department or job category, where published |
| `employmentType` | Full time, part time, contract... where published |
| `postedAt` | Posting date (YYYY-MM-DD); empty when the system publishes none |
| `firstSeenAt` | Date the index first saw the job |
| `salaryMin` / `salaryMax` | Stated pay range in the posting's own currency |
| `salaryCurrency` | ISO currency code, e.g. USD, GBP, EUR |
| `salaryPeriod` | hour, day, week, month or year |
| `salaryAnnualMin` / `salaryAnnualMax` | The same pay per year (hour x 2,080, day x 260, week x 52, month x 12) |
| `hiringSystem` | Which applicant-tracking system the job came from |
| `url` | Apply link on the employer's own career site |

## How salaries were extracted

Where an employer publishes pay as structured data (Ashby, Greenhouse, Lever, Rippling, UKG,
Recruitee), that is used. Otherwise the stated range is read from the job description with
precision-first rules that refuse revenue, funding, bonuses, benefits and insurance figures. A
missing salary is therefore much more likely than a wrong one. Pay-transparency laws make stated
ranges far more common in US postings.

## Notes

- Job descriptions are not included in this sample.
- Jobs are open as of the collection date; many will have closed since.
- The postings themselves belong to the employers; this dataset compiles their public listings.
- Questions or a custom extract: chazmichael_michaels@icloud.com
