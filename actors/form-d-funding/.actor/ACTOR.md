# Recently Funded Companies — SEC Form D Startup Funding Tracker

See **every US company that just raised money**, usually within days of the raise. When a
company sells shares, SAFEs or notes in a private round, it must file a **Form D** with the
SEC within 15 days. This Actor reads those filings straight from the SEC and turns each one
into a clean lead record: the company, what it does, where it is, its phone number, how much
it raised, and the **names and titles of its executives**. About **290 operating companies
file each week**.

You don't need any coding, logins or proxies. Export to JSON, CSV or Excel, or schedule it to
get each week's new raises.

*Built and maintained by CMM Research.* Need a custom feed or a field we don't have?
Email us at [chazmichael_michaels@icloud.com](mailto:chazmichael_michaels@icloud.com).

**Who uses it**

- **Sales teams.** A company that just raised has a new budget. Reach the CEO in the week
  the money lands, not months later when it shows up in a paid database.
- **Agencies, recruiters and service firms.** Freshly funded startups hire, build and buy
  software. Filter to Technology or Health Care in your state.
- **Investors and analysts.** Track who is raising, how much and on what terms (equity,
  debt or SAFEs), by sector and region.
- **Fund watchers.** Switch to *Investment funds only* to see new VC, private-equity and hedge
  funds being raised.

**A real result** (filed 13 Oct 2026):

```json
{
  "companyName": "ExBrain, Inc.",
  "filingType": "New",
  "filedAt": "2026-10-13",
  "firstSaleDate": "2025-11-24",
  "sector": "Technology",
  "industry": "Other Technology",
  "yearOfIncorporation": 2025,
  "city": "Austin",
  "state": "TX",
  "phone": "+1 415-813-0515",
  "totalOfferingAmount": 1000000,
  "totalAmountSold": 425000,
  "investorCount": 6,
  "securitiesOffered": ["Other: Simple Agreements for Future Equity (SAFEs)"],
  "exemptions": ["Rule 504(b)(1)"],
  "executives": [
    { "name": "Dena Neek", "roles": ["Executive Officer", "Director"], "title": "President and Chief Executive Officer", "city": "Austin", "state": "TX" },
    { "name": "Cyrus Neek", "roles": ["Executive Officer", "Director"], "title": "Secretary", "city": "Austin", "state": "TX" },
    { "name": "Afshin Sepehri", "roles": ["Executive Officer"], "title": "Chief Technology Officer", "city": "Austin", "state": "TX" }
  ],
  "executivesText": "Dena Neek (President and Chief Executive Officer); Cyrus Neek (Secretary); Afshin Sepehri (Chief Technology Officer)",
  "formUrl": "https://www.sec.gov/Archives/edgar/data/2160087/000216008726000001/xslFormDX01/primary_doc.xml"
}
```

Each record also has the street address and ZIP, the round's remaining amount, minimum
investment, brokers paid, and links to the filing. See **Output** below.

## Why this one

- **Operating companies only, by default.** About 6 in 10 Form D filings are investment
  funds, not businesses. They're left out unless you ask for them, so you don't pay for
  rows you'll delete.
- **New raises, not paperwork.** Yearly renewals and corrections (Form D/A) are left out by
  default, and a company that filed twice shows up once.
- **Executives with titles.** Every officer and director named on the form, with their
  title when the company gave one ("Chief Technology Officer"), plus a one-line
  `executivesText` that pastes straight into a CRM.
- **Fresh.** Filings appear here the same day the SEC receives them, small rounds included.
- **Official, public data.** It comes from the SEC's own EDGAR system, with a link to the
  original filing on every record.
- **Only what's new, on a schedule.** Turn on `onlyNewSinceLastRun` and schedule a weekly
  run: each run returns only the companies that search hasn't delivered before.
- **Pay only for what you get.** Filters run before charging, so filtered-out filings are
  never billed.

## Pricing

**PRICE TO BE CONFIRMED** per 1,000 filings, plus Apify's standard $0.00005 run-start fee.
Platform usage is included, so you are not billed for compute separately.

- **`maxResults`** is a hard cap per run (default 200).
- **Apify's maximum cost per run** also works: if the limit is reached mid-run, the Actor
  stops cleanly and keeps everything delivered so far.
- A whole week of new operating companies is about 290 records.

## Input

| Field | What it does |
|---|---|
| `daysBack` | How far back to look (default 7 days). |
| `filedFrom` / `filedTo` | An exact date range instead, YYYY-MM-DD. |
| `companyType` | Operating companies (default), investment funds only, or both. |
| `sectors` | Technology, Health Care, Real Estate, Financial Services, Energy, Business Services, Manufacturing, Retail, Restaurants, Travel, Agriculture, Other. |
| `states` | Business address in these US states, e.g. `["CA", "NY"]`. |
| `minAmountRaised` | Only filings reporting at least this much already raised (USD). |
| `minOfferingAmount` | Only rounds with at least this target size (USD). |
| `incorporatedWithinYears` | Only companies founded in the last N years. |
| `companyKeywords` | Company name contains, e.g. `["AI", "Therapeutics"]`. |
| `includeAmendments` | Also return Form D/A renewals and corrections. |
| `latestPerCompany` | One row per company (on by default). |
| `onlyNewSinceLastRun` / `monitorName` | Only filings this same search hasn't delivered before. |
| `maxResults` | Cap on results, and your main cost control. |

## Output

| Field | Description |
|---|---|
| `companyName` | Exactly as filed with the SEC |
| `cik` | The SEC's permanent company id |
| `filingType` | "New" or "Amendment" |
| `filedAt` | Date the SEC received the filing |
| `firstSaleDate` | Date of the round's first sale (`firstSaleYetToOccur` when it hasn't happened yet) |
| `sector` / `industry` | e.g. "Technology" / "Other Technology", as chosen by the company |
| `isFund` / `fundType` | Investment funds, and their type: Venture Capital, Private Equity, Hedge or Other |
| `entityType` / `jurisdiction` | e.g. "Corporation" / "DELAWARE" |
| `yearOfIncorporation` / `incorporatedWithin` | Year founded, or "Within five years" / "Over five years" when no year is given |
| `street` / `city` / `state` / `zipCode` / `stateOrCountryName` | Business address |
| `phone` | Company phone number |
| `totalOfferingAmount` / `offeringAmountIndefinite` | Round target in USD (null when "indefinite") |
| `totalAmountSold` / `totalRemaining` | Raised so far, and still to raise, in USD |
| `minimumInvestment` / `investorCount` / `nonAccreditedInvestorCount` | Round terms and investors so far |
| `securitiesOffered` | Equity, Debt, Options, SAFEs (as described), fund interests… |
| `exemptions` | e.g. "Rule 506(b)", "Rule 506(c)" (506(c) rounds may be publicly advertised) |
| `revenueRange` | When disclosed (most companies decline) |
| `executives` | Name, roles, title, city and state of each officer, director and promoter |
| `executivesText` | The same as one readable line |
| `salesBrokers` / `salesCommissions` / `findersFees` | Brokers paid on the raise, and what they were paid |
| `proceedsToExecutives` | Amount of the raise paid to executives, directors or promoters |
| `notes` | The company's own footnotes on amounts and investors |
| `filingUrl` / `formUrl` / `companyFilingsUrl` | The filing on EDGAR, the readable form, and all of the company's Form D filings |

## Examples

**Tech startups in California that raised $1M+ this month**
```json
{ "daysBack": 30, "sectors": ["Technology"], "states": ["CA"], "minAmountRaised": 1000000, "maxResults": 500 }
```

**Weekly lead list: health-care companies founded in the last 3 years (schedule weekly)**
```json
{ "daysBack": 7, "sectors": ["Health Care"], "incorporatedWithinYears": 3, "onlyNewSinceLastRun": true, "maxResults": 1000 }
```

**New venture capital funds being raised**
```json
{ "daysBack": 30, "companyType": "funds", "companyKeywords": ["venture", "ventures"] }
```

**Everything filed on one day, companies and funds, renewals included**
```json
{ "filedFrom": "2026-10-13", "filedTo": "2026-10-13", "companyType": "all", "includeAmendments": true, "latestPerCompany": false, "maxResults": 2000 }
```

## Notes

- **What Form D covers.** Private raises under Regulation D, the exemption most startups,
  real-estate deals and funds use. It doesn't include public offerings, Reg CF crowdfunding
  or every company that raises (some rely on other exemptions). Some companies file after
  their deadline, so a raise can appear weeks after its first sale.
- **Investors aren't named.** Form D lists the company's own executives and any paid
  brokers, not who invested.
- **Websites and emails aren't on the form.** The phone number and address are. Pair the
  output with an email-finder Actor if you need emails.
- The Actor follows the SEC's fair-access rules: it identifies itself and stays under 10
  requests per second. A week of filings takes about 2 minutes.
- `onlyNewSinceLastRun` remembers each search's delivered filings for 400 days in a
  key-value store named `form-d-funding-monitor` in your own Apify account. Filings cut off
  by `maxResults` or your spending limit are still delivered on the next run.
- The data is public: it is published by the US Securities and Exchange Commission. CMM
  Research isn't affiliated with the SEC.
