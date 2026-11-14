# Distribution drafts and findings, 4 Nov 2026

Sections 1 and 3 are done: the new description is live and Kaggle is updated. The article and the recruiter message have not been published or sent.

## 1. Store search: Greenhouse actor

Findings (direct Store searches, 4 Nov):

| Search | Our rank |
|---|---|
| workday jobs | 9 |
| greenhouse lever ashby | 13 |
| ashby | 16 |
| workday | 18 |
| lever | 20 |
| career site jobs | 22 |
| greenhouse | 27 |
| lever jobs, greenhouse scraper, company jobs | not in the top ~90 |

- The title, SEO fields and categories already contain the right words.
- Actors above us have far more usage: 700–1,385 runs a month against our 354.
- We have no reviews yet. The review request at the end of each run is already live.
- Ranking looks driven by usage and reviews, so rewording alone won't move it far.

New description, live since 4 Nov (261 characters). It leads with a number and adds the price. "5,300+" is the
3,584 Greenhouse/Lever/Ashby companies plus 1,797 Workday companies, from the crawler's own
list.

> Every open job from 5,300+ companies on Greenhouse, Lever, Ashby and Workday (Stripe, NVIDIA, CVS and more), read from their public JSON APIs so it doesn't break. Salaries on nearly half of jobs, pay and remote filters, only-new-jobs mode. $1.50 per 1,000 jobs.

Keep the title as it is: it was changed on 23 Oct, and more changes would muddy the rank tracking.

## 2. Hospital Jobs

Findings:

- The actor works: a test on 4 Nov returned real results in 3 seconds.
- It ranks 2nd for "hospital jobs", 3rd for "nurse jobs", 5th for "healthcare jobs" and "nursing jobs".
- Nobody in this niche has traction on the Store. The actors around it have 0–6 users a month.
  So the problem isn't the listing: **people aren't searching the Store for this.**
- More Store polish won't help. The buyers (staffing and locum recruiters) have to be reached
  directly. This is the "two-week demand check" in `docs/apify-opportunity-scan.md`.

Draft message for 5–10 healthcare staffing recruiters on LinkedIn. It asks a question and doesn't
sell. The user sends it.

> Hi [name], quick question, not a pitch. I keep a daily list of every open job at 78 of the largest US health systems, pulled straight from their career sites and tagged by unit, shift, per diem or travel, and sign-on bonus. For example, 128,000+ open roles right now.
>
> Would a weekly list of new per diem and hard-to-fill roles at the systems you work with be useful to you? If so, what would you want to see in it? Happy to send you a free sample for your region either way.

What would count as a pass: 2 or more recruiters ask for the sample, or name what they'd pay.

## 3. Kaggle

Done on 4 Nov. Filled in the missing file and column descriptions, data sources, update frequency
("Never", since these are dated snapshots), and a new Shopify cover (`kaggle-shopify-cover.png`).

| Dataset | Views | Downloads | Usability before | After |
|---|---|---|---|---|
| Form D | 169 | 7 | 9.4 | 10.0 |
| Career jobs | 143 | 14 | 8.2 | 10.0 |
| Shopify | 87 | 16 | 6.5 | 10.0 |
| Hospital | 41 | 5 | 6.5 | 9.4 (needs a starter notebook) |

All four samples are from October, and their titles say so. A refresh is a separate job.

## 4. How-to article

Draft: `research/posts/howto-companies-hiring-salesforce.md`. The code is tested and the numbers
are real, from 4 Nov.
