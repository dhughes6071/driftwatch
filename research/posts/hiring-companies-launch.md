# Hiring companies actor: Reddit launch posts (drafts, 16 Oct 2026)

Actor: https://apify.com/viridian_layout_ea2/companies-hiring-leads

The numbers come from local runs on 16 Oct 2026 against the daily index (1,791,970 open jobs at
19,089 companies, built that morning). Re-run the same searches on the day you post:

- SDR/BDR/"sales development" titles, posted in the last 30 days: **1,404 roles at 682 companies**
- "salesforce" titles in the United States: **346 open roles at 187 companies**
- RevOps / "revenue operations" titles, posted in the last 30 days: **183 roles at 150 companies**

**Before posting:**
- Read each subreddit's self-promotion rules and use promo threads where they exist.
- Post a day or more apart from each other and from the Form D posts. Reply to comments in
  the first few hours.
- The "hiring growth" sort is fixed (build 0.1.5, 16 Oct): undated roles at companies new to the
  index and bulk re-posted roles no longer count as new. On 16 Oct the top of the list
  (20–500 openings) was LCBO (455 new holiday roles), Co-op, Haleon, Global Payments and
  American Electric Power. Recruitment agencies with fast-churning ads also rank high there.
- Some top results are staffing or outsourcing firms hiring for clients. Say so if asked.
  `maxTotalOpenJobs` and `companyKeywords` help filter around them.

---

## 1. r/sales

**Title**
> Job postings are the most underrated buying signal. Here's how to use them (free method + a tool)

**Text**
> If a company is hiring for the role your product serves, it has a problem it's paying to
> solve right now. Three SDR openings means they're building outbound and will need data,
> dialers and sequencing tools. Five Salesforce admin openings means a CRM project with budget.
> Job posts are public and dated, and they often go up before any press release or LinkedIn
> announcement.
>
> **Free way:** most companies post on their own careers page through a hiring system like
> Greenhouse, Lever, Ashby or Workday. Search Google for
> `site:boards.greenhouse.io "sales development"` (swap in `jobs.lever.co` or
> `jobs.ashbyhq.com`, and your role) and you'll get live openings. It's slow, but fine for a
> few target accounts.
>
> **At scale:** I built a tool that searches 1.7M+ open jobs on 19,000+ companies' career
> sites every day and returns **one row per company**, not a pile of job ads. Each row shows:
> how many matching roles they have, how many are new this week or month, their total
> openings, top departments and locations, the pay they advertise, and links to the roles.
> You can also sort by hiring growth (the share of a company's openings posted in the last 30
> days) to find companies in a hiring push. This morning that put LCBO on top with 455 new
> holiday roles.
>
> To give a sense of scale, this morning:
> - **682 companies** posted SDR/BDR roles in the last 30 days (1,404 roles)
> - **187 US companies** have Salesforce roles open (346 roles)
> - **150 companies** posted RevOps roles in the last 30 days
>
> It's an Apify actor at $0.02 per company, with a weekly "only companies newly hiring since
> last run" mode: https://apify.com/viridian_layout_ea2/companies-hiring-leads
>
> Caveats: it covers companies that post on their own careers page (not LinkedIn-only jobs),
> and it gives you the company, not contacts, so pair it with your enrichment tool.
>
> Anyone else prospecting off job posts? Curious which roles have been the best signal for you.

---

## 2. r/leadgeneration

**Title**
> I built a "companies hiring for X" lead list from 1.7M job postings. One row per company, refreshed daily

**Text**
> Hiring is a dated, public buying signal: a company hiring three Salesforce developers is
> about to spend on Salesforce consultants, tools and training. The problem is that job
> boards give you job ads, not accounts.
>
> So I built an Apify actor that reads a daily index of **1.7M+ open roles on 19,000+ company
> career sites** (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Oracle and 9 more) and
> rolls them up into **one row per company**:
> - matching roles, and how many are new in the last 7 and 30 days
> - total openings at the company (a rough size signal)
> - top departments and locations for the matching roles
> - pay range where postings state it
> - the 5 newest matching roles with links, and the careers page
> - hiring growth: the share of openings posted in the last 30 days, which you can sort by to
>   find companies in a hiring push (bulk re-posted old ads don't count)
>
> Examples from this morning's index:
> - SDR/BDR roles posted in the last 30 days: **682 companies**
> - Salesforce roles open in the US: **187 companies**
> - RevOps roles posted in the last 30 days: **150 companies**
>
> Filters: role keywords, location, remote only, posted within N days, minimum matching roles,
> company size by openings, pay, and a target-account list by name. With
> `onlyNewSinceLastRun`, a weekly schedule returns only companies that posted new matching
> roles since the last run.
>
> $0.02 per company, and the whole index is scanned on every run at no extra cost:
> https://apify.com/viridian_layout_ea2/companies-hiring-leads
>
> What it doesn't do: contacts or emails (pair it with an enrichment tool), and LinkedIn-only
> postings. Feedback welcome. Which roles would you search first?

---

## 3. r/recruiting (agency recruiters: check the rules first; many recruiting subs only allow tools in a weekly thread)

**Title**
> For agency recruiters: finding companies with the most open roles in your niche, from their own career sites

**Text**
> If you run BD for an agency, the best prospects are companies already hiring in your
> specialty, ideally with several open roles. Job boards make that hard to see because you
> get ads, not companies.
>
> I built a tool that searches a daily index of 1.7M+ open roles on 19,000+ companies' own
> career sites and returns one row per company: how many roles match your niche, how many
> are new this month, total openings, locations, departments and stated pay, with links to
> the roles.
>
> Example: Salesforce roles in the US right now come to 346 open roles at 187 companies. Sorted
> by matching roles, the top of the list is consultancies and federal contractors with 10 to
> 18 Salesforce openings each. You can also sort by hiring growth to see which companies
> posted most of their openings this month.
>
> https://apify.com/viridian_layout_ea2/companies-hiring-leads ($0.02 per company; filters
> for location, remote, posting age, company size and pay)
>
> It only covers jobs posted on company career sites (not LinkedIn-only). Happy to run a niche
> for anyone curious and share the counts.
