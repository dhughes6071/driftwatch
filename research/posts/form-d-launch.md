# Form D actor: Reddit launch posts (drafts, 14 Oct 2026)

Actor: https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker

Numbers come from a local run on 14 Oct 2026 covering filings from 15 Sep to 14 Oct 2026
(`research/posts/form-d-sample-2026-10-14.csv`). That run scanned 5,946 Form D filings and
found 1,314 new raises by operating companies, after leaving out funds and amendments. Re-check
the numbers on the day you post.

The free sample is on Kaggle:
https://www.kaggle.com/datasets/dhughes6071/us-private-funding-rounds-sec-form-d-oct-2026
(public since 14 Oct 2026). Starter notebook:
https://www.kaggle.com/code/dhughes6071/who-just-raised-money-us-private-rounds-form-d

**Before posting:**
- Read each subreddit's rules on self-promotion and flair.
- Post a day or more apart, and reply to every comment in the first few hours.
- r/sales and r/startups remove obvious promotion. Those versions lead with the useful tip
  and mention the actor once, at the end. If a subreddit has a weekly promo or "share your
  tool" thread, post there instead.
- The sample rows name real people (executives listed on public SEC filings). Don't paste
  names or phone numbers into a post. Talk about companies and totals only.

---

## 1. r/datasets

**Title**
> [Dataset] 1,314 US companies that raised private money in the last 30 days, from SEC Form D filings (amounts, sector, location, executives)

**Text**
> When a US company sells shares, SAFEs or notes in a private round, it has to file a Form D
> with the SEC within 15 days. The filings are public on EDGAR, but they're XML and mixed in
> with a lot of noise: about 6 in 10 are investment funds, and many are yearly renewals. I
> cleaned up a month of them:
>
> - 1,314 new raises by operating companies filed 15 Sep to 14 Oct 2026 (funds and amendments
>   removed, one row per company)
> - amount raised so far, round target, investor count, minimum investment, security type
>   (equity, debt, SAFEs), exemption (506(b) or 506(c))
> - sector and industry as the company chose them, year founded, full business address, and
>   the company phone number
> - executives and directors named on the form, with titles where given
> - a link to the original filing on every row
>
> Dataset: https://www.kaggle.com/datasets/dhughes6071/us-private-funding-rounds-sec-form-d-oct-2026
> Starter notebook (sectors, round sizes, SAFEs, the biggest raises):
> https://www.kaggle.com/code/dhughes6071/who-just-raised-money-us-private-rounds-form-d
>
> A few things that stood out:
> - 1,083 of the companies reported money already raised. The median was about $1.2M, and 581
>   had raised $1M or more.
> - Technology (355) and real estate (318) lead. Many of the real-estate rows are single-property
>   LLCs, so filter them out if you want startups.
> - 164 rounds were SAFEs, and 155 used Rule 506(c), the exemption that allows public advertising.
> - California (193), Texas (144) and New York (127) had the most raises.
>
> It's all public SEC data. I built it with a scraper I sell on Apify, which runs the same
> thing for any date range and filters (https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker,
> $20 per 1,000 filings), but the sample is free to use.
>
> Happy to explain how any field was built. Form D has some odd corners: "indefinite" round
> sizes, revenue that's almost always "decline to disclose", and multi-issuer filings.

---

## 2. r/sales

**Title**
> Free source of "just raised money" leads most people don't use: SEC Form D filings

**Text**
> If you sell to startups or small companies, a funding round is about the best timing signal
> there is: new budget, and usually new hiring and new tools. Most people wait until the round
> shows up in Crunchbase or a press release. A lot of rounds never get a press release.
>
> But in the US, any company raising a private round has to file a **Form D** with the SEC
> within 15 days of the first sale. It's public, and it lists:
>
> - the company, its address and **phone number**
> - how much it's raising and how much it has raised so far
> - its sector and the year it was founded
> - the **names and titles of its executives** (CEO, CTO, directors)
>
> To give a sense of scale: in the last 30 days about 1,300 operating companies filed new
> raises, and 581 of them had already raised $1M or more. That doesn't count funds or renewals.
>
> **How to use it for free:** go to EDGAR full-text search (https://www.sec.gov/edgar/search/),
> set the form type to "D" and pick a date range, then open the filings one by one. It's slow but it works
> for a handful a week.
>
> **If you want it as a list:** I built a tool that pulls them into a spreadsheet, filtered by
> sector, state, amount raised or founding year, and can run weekly so you only get the new
> ones: https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker ($0.02 per company).
>
> Two caveats. Form D has no emails or websites, so you'll need an email finder for those. And
> it doesn't say who invested.
>
> Curious whether anyone here already works Form D leads and how it converts for you.

---

## 3. r/leadgeneration

**Title**
> I turned SEC Form D filings into a weekly "recently funded companies" lead list. Here's what a month looks like

**Text**
> Every US company that raises a private round (equity, SAFEs or notes) has to file a Form D
> with the SEC within 15 days. That makes it one of the freshest public signals for "this
> company just got budget", often weeks before the round appears in paid databases, and many
> small rounds never appear there at all.
>
> I built an Apify actor that reads those filings and gives one clean row per company:
> https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker
>
> One month (15 Sep to 14 Oct 2026) looked like this:
> - 5,946 Form D filings in total, of which **1,314 were new raises by operating companies**
>   (the rest were investment funds and yearly renewals, which it drops by default)
> - 581 had already raised $1M+, and 173 had raised $10M+
> - every row had a company phone number and named executives, and most executives had a
>   title (CEO, CTO, CFO...)
> - top sectors: Technology 355, Real Estate 318, Health Care 150
>
> Filters: sector, state, minimum amount raised, round size, "founded in the last N years" and
> name keywords. There's also an "only new since last run" mode, so a weekly schedule gives you
> just that week's new companies and you never pay twice for the same one.
>
> Pricing is $20 per 1,000 companies, and a full week of new operating companies is about 290
> rows, so roughly $6 a week. Free sample to look at first: https://www.kaggle.com/datasets/dhughes6071/us-private-funding-rounds-sec-form-d-oct-2026
>
> What it doesn't have: emails, websites or investor names, because Form D doesn't include them.
> Pair it with an email finder.
>
> Feedback welcome, especially on which filters or fields would make it more useful.

---

## Spare: r/startups (only in a promo-allowed thread)

r/startups removes self-promotion outside its designated threads. If there is a weekly
"share your startup" or feedback thread, a short version works:

> **Recently Funded Companies (SEC Form D tracker).** Every US company that files a Form D for
> a private raise, cleaned into one row per company: amount raised, sector, location, phone and
> executives. Funds and renewals are left out. About 290 new companies a week, $0.02 each, with
> a weekly "only new" mode. https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker
> Looking for feedback from anyone who sells to startups.
