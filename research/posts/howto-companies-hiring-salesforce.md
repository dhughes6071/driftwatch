# Draft article: companies hiring Salesforce people (for dev.to, then Medium)

Status: draft, 4 Nov 2026. Not published. The user posts it from their own account.
Numbers and code output are from 4 Nov 2026 (index built that morning). Re-run before posting.
Suggested dev.to tags: `python`, `sales`, `tutorial`, `api`.

---

# How to find companies hiring Salesforce people, straight from their career sites

If you sell Salesforce consulting, tools or training, a job posting is one of the most useful
signals there is. A company hiring a Salesforce architect has a project and a budget right now,
and it has told the world in public, with a date on it.

Job boards make this signal hard to use, because they give you ads, not accounts. The same role
appears several times, recruiters repost it, and you still have to work out who the employer is.

There's a cleaner source. Most companies post jobs on their own careers page through a hiring
system, and several of those systems publish the listings as open JSON. No login, no API key and
no scraping of HTML.

## The free way: 25 lines of Python

Greenhouse, Lever and Ashby each have a public job board API. You only need the company's board
name, which is the last part of its careers link (`job-boards.greenhouse.io/brex` means `brex`).

```python
import json, urllib.request

KEYWORD = "salesforce"
COMPANIES = [
    ("greenhouse", "brex"), ("greenhouse", "elastic"), ("greenhouse", "salesloft"),
    ("ashby", "rula"), ("lever", "nium"),
]
APIS = {
    "greenhouse": ("https://boards-api.greenhouse.io/v1/boards/{}/jobs", "jobs", "title", "absolute_url"),
    "lever": ("https://api.lever.co/v0/postings/{}?mode=json", None, "text", "hostedUrl"),
    "ashby": ("https://api.ashbyhq.com/posting-api/job-board/{}", "jobs", "title", "jobUrl"),
}

for system, company in COMPANIES:
    url, list_key, title_key, link_key = APIS[system]
    request = urllib.request.Request(url.format(company), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    jobs = data[list_key] if list_key else data
    matches = [job for job in jobs if KEYWORD in job[title_key].lower()]
    print(f"{company}: {len(matches)} of {len(jobs)} open roles match")
    for job in matches:
        print(f"  {job[title_key]}  {job[link_key]}")
```

Here's the output when I ran it (links shortened):

```text
brex: 4 of 270 open roles match
  Engineering Manager, Salesforce  https://www.brex.com/careers/...
  ...
elastic: 4 of 424 open roles match
  Lead Salesforce Full Stack AI Engineer  https://jobs.elastic.co/jobs?gh_jid=...
  Manager, Salesforce Revenue Cloud  https://jobs.elastic.co/jobs?gh_jid=...
  Senior Salesforce Engineer  https://jobs.elastic.co/jobs?gh_jid=...
  Sr. Salesforce DevOps Engineer  https://jobs.elastic.co/jobs?gh_jid=...
salesloft: 2 of 25 open roles match
  Salesforce Business Systems Administrator  https://www.salesloft.com/company/careers?gh_jid=...
  Senior Salesforce Business Systems Administrator  https://www.salesloft.com/company/careers?gh_jid=...
rula: 1 of 32 open roles match
  Salesforce Architect (Remote)  https://jobs.ashbyhq.com/rula/...
nium: 0 of 26 open roles match
```

That's already useful for a list of target accounts. Elastic's four roles, for example, tell you
more about its Salesforce plans than a press release would.

Two tips if you build on this:

- **Short keywords need care.** A plain "contains" check for `RN` also matches "Internal". Match
  whole words for anything three letters or shorter.
- **Run it on a schedule and save what you saw.** "New since last week" is a much stronger signal
  than "open today".

## Where the free way runs out

This works when you already know which companies to check. It doesn't tell you who else is hiring,
and the bigger gap is that many large employers aren't on these three systems.

I checked that by searching a daily index of about 1.8 million open jobs at about 18,800 companies,
collected from 15+ hiring systems. Here's what US postings looked like on 4 November:

- **321 open roles with "Salesforce" in the title, at 174 companies**
- **23 Salesforce admin roles at 22 companies.** That's a smaller market than you might guess.
- **14 of those 22 companies hire through Workday**, and only 2 through Greenhouse. Workday has no
  simple per-company list like the code above, so the script would have missed most of them.
- 11 of the 22 stated pay. The median top of the range was $140,000.

The real numbers also show why you have to read the results. Some top hits are staffing firms
hiring on behalf of clients, and one of the biggest "Salesforce hirers" is Salesforce itself.

## The faster way, if you don't want to run this yourself

Disclosure: I built the index above, and I sell access to it. It's an actor on Apify called
[Companies Hiring For Any Role](https://apify.com/viridian_layout_ea2/companies-hiring-leads). You
give it a role and get one row per company: matching roles, how many are new this month, total
openings, locations and stated pay. It costs $0.02 per company, and you can set a cap on results.

```json
{ "titleKeywords": ["salesforce"], "locationKeywords": ["United States"], "maxCompanies": 200 }
```

If you only follow a handful of accounts, use the script. It's free and it will serve you well.

## One caveat either way

A posting isn't proof of a budget for what you sell. Some roles sit open for months, and some
companies repost old ads, which resets the date. Treat a posting as a reason to look closer, then
read the description: it often names the tools, the project and the team.
