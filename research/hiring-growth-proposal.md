# A true hiring-growth measure for "Companies Hiring For Any Role"

Proposal only, 16 Oct 2026. Nothing here is built, committed or deployed.
All numbers come from the crawler's database (`data/career-index.db`) as of
the 16 Oct crawl, read without changing it.

## The problem in one paragraph

Today `hiringGrowth` is "what share of a company's open roles were posted in
the last 30 days". That rewards boards that look fresh, not companies that are
growing. Snap Inc. scores 0.99 (376 of 381 roles posted in the last 30 days),
but that is because Snap re-posts its ads: 183 of its roles carry the same
date, 25 Sep, and over the last two days roles like "Senior Producer" closed
while near-identical ones ("Senior Creative Producer") opened under new
numbers. LCBO also scores about 1.0, and its holiday hiring push is real.
The current measure cannot tell these two apart.

## The better measure

**Net change in open roles over 30 days = roles opened − roles closed.**

- A re-posted ad counts as one closed and one opened, so it cancels out. Snap
  would score close to zero unless it is really adding roles.
- A real push (LCBO adding 455 holiday roles) shows as a big positive number,
  and when those roles close in January it turns negative. That is the truth.
- Shown as a rate: `growth30 = (open now − open 30 days ago) / open 30 days ago`.
  Example: 200 roles a month ago, 260 now → +0.30 (30% more open roles).

## What I found in the database (this changes the plan)

**1. Closed roles are not kept.** The brief assumed the `jobs` table holds
closed roles. It doesn't for long: `crawl.ts` (end of `crawl()`) deletes any
role not seen for 3 days. About 50,000 roles are deleted every day (49,977 on
16 Oct). So at any moment the database only knows about closures from the
last 2–3 days, and **no 30-day history can be rebuilt from what's there.**
The clock for a 30-day measure starts the day we start keeping history, not
27 Sep.

**2. Site outages look like mass closures.** When a company's site fails to
load, its roles simply aren't seen, so they look closed. On 16 Oct:

| Company | What the DB shows | What actually happened |
|---|---|---|
| Mass General Brigham | 1,956 of 2,035 roles "closed" | last seen 14 Oct; site not loading for 2 days |
| Amentum | 2,900 of 2,949 "closed" | same pattern |
| SpaceX, Anduril (Greenhouse) | every role gone (2,746 and 2,527) | whole board missing since 14/15 Oct |
| SiFive | +121 roles "opened" from 7 | 88 of them were posted months ago (Apr–Sep): the board came back after an outage |

143 companies (27,465 roles) vanished completely in today's crawl. A naive
"opened − closed" would put these at the very top and bottom of the ranking.
Worse, once a failing site passes 3 days its roles are deleted, and when it
comes back they are stored as brand-new (this already affects today's
undated-role counts too).

**3. Duplicate postings inflate counts.** Snap's Workday board lists most
requisitions two or three times (`..._R0047209` and `..._R0047209-1`, one per
location). Net change is still fair because both copies open and close
together, but the raw counts are about double the real number of positions.

**4. A two-day preview of the measure** (the only window the DB can show),
for the 6,110 companies with 20–500 open roles: 2,264 went up, 1,616 stayed
flat, 2,230 went down, and 3,648 both opened and closed roles. Of the 234
companies that score ≥0.9 on today's measure, only 104 actually grew in those
two days. Snap: +28 opened, −13 closed. LCBO: +5, −22 (the push has peaked).

## Proposed design

### Part A: crawler keeps a small daily history (`crawl.ts`)

1. **Record whether each company's fetch worked.** Today errors are only
   counted (`stats.errors++`). Add a table, written once per company per run:

   `company_runs (day, ats, company, ok, open, opened, closed)`

   - `ok` = the site loaded fully (no error, and for Workday all pages read).
   - `open` = roles seen today, `opened` = first seen today,
     `closed` = seen last run but not today.
   - Size: ~19,000 companies a day → about 7 million rows a year, a few
     hundred MB at most. Tiny next to the 11.5 GB jobs table.

2. **Don't purge roles for a company whose fetch failed.** Only delete a
   role when the company loaded fine *and* the role was missing. This fixes
   the "come back as new" problem for every measure, not just this one.

3. **Outage guard.** If a company loaded "ok" but lost more than half its
   roles overnight (and had at least 50), record it as `ok = 0` for that
   day. Real companies rarely close half their openings in one night; broken
   pagination does it all the time.

No closed-job rows need to be kept: the daily counts are enough.

### Part B: publish adds one small file to the index (`publish.ts`)

Next to the shards, upload one extra record, `growth-<stamp>` (gzipped JSON),
and point to it from the manifest:

```jsonc
// manifest gets:  "growth": { "url": "...", "days": 30, "from": "2026-10-17", "to": "2026-11-16" }
// growth file:  one entry per company, keyed "ats:company"
{
  "workday:lcbo":     { "openBefore": 22,  "opened": 470, "closed": 15, "okDays": 30 },
  "workday:snapchat": { "openBefore": 370, "opened": 190, "closed": 179, "okDays": 30 }
}
```

(Values above are made-up illustrations of the shape.)

- `openBefore` = `open` on the first day of the window.
- `opened` / `closed` = sums of the daily counts over the window, **only on
  days where `ok = 1`**.
- `okDays` = how many of the 30 days the company loaded cleanly.
- Size: ~19,000 entries × ~70 bytes ≈ 1.3 MB raw, ~0.3 MB gzipped. One extra
  record write a day; cost is negligible.
- `Manifest` lives in `actors/career-jobs/src/format.ts`. Adding an optional
  `growth` field there means re-copying `format.ts` into hiring-companies so
  the sync test passes (done as part of the build, not by editing the copy).

### Part C: the actor computes the score (`hiring-companies/src/companies.ts`)

- Fetch the growth file once per run (one extra download, ~0.3 MB).
- `netChange30 = opened − closed`
- `hiringGrowth = netChange30 / openBefore`, rounded to 2 decimals.
- Return `null` (sorted last, as today) when: `openBefore < 10`, `okDays < 25`,
  or the company joined the index during the window.
- Keep the old number under a new, honest name (`shareRecentlyPosted`) so
  existing users don't lose it.
- Until 30 days of history exist, fall back to the shorter window available
  (7 days after one week) and say which window was used in the output
  (`growthWindowDays`).

## Timeline

| Date | What's possible |
|---|---|
| Ship Part A (say 17 Oct) | history starts; nothing to show yet |
| ~24 Oct | 7-day net change available |
| ~16 Nov | full 30-day net change; switch `hiringGrowth` to it |

27 Oct (30 days after the index began) does **not** help here, because the
closures from before Part A ships have already been deleted. It only helps the
existing measure (undated roles get real ages).

## Open questions for the owner

1. OK to change the crawler's purge rule (Part A.2)? It also changes what the
   other two actors see: fewer roles vanish and reappear during outages.
2. Should duplicate per-location postings (`-1`, `-2` ids) be merged into
   one role? Separate change, affects every actor using the index.
3. Name: keep `hiringGrowth` for the new measure (and rename the old one), or
   add `netGrowth30` alongside?
