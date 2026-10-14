# Kaggle dataset page: Form D sample (published 14 Oct 2026)

**Live:** https://www.kaggle.com/datasets/dhughes6071/us-private-funding-rounds-sec-form-d-oct-2026
(public, CC0, usability 5.9 at publication)

**Title** (49 characters; Kaggle's limit is 50)
> US Private Funding Rounds - SEC Form D (Oct 2026)

**Subtitle** (limit 80)
> 1,314 US companies that raised private money in 30 days, with amounts and execs

(At upload the subtitle lost its leading "1,"; it was fixed afterwards. Keep it under 80 characters.)

**URL slug**
> us-private-funding-rounds-sec-form-d-oct-2026 (Kaggle derived it from the title)

**Tags:** Finance, Investing, Business, Tabular, United States (Kaggle has no "startups" tag)

**License:** CC0: Public Domain. The source is US government data.

**File:** `form-d-sample-2026-10-14.csv` (1,314 rows, 24 columns, 0.6 MB)

**Personal data check:** the rows include executives' names and titles and company phone
numbers, exactly as published in public SEC filings. Kaggle allows public-record data, but say
so on the page (it's in the Notes below) and don't add anything beyond the filings.

---

## About this dataset

Every US company that raises money in a private round (selling shares, SAFEs, convertible
notes or debt under Regulation D) must file a **Form D** with the SEC within 15 days of the
first sale. This dataset is one month of those filings, cleaned into one row per company.

- **1,314 new raises by operating companies**, filed 15 Sep to 14 Oct 2026
- Taken from 5,946 Form D filings in that period. Investment funds (about 6 in 10 filings)
  and amendments or yearly renewals (Form D/A) were removed, and a company that filed twice
  appears once with its newest filing
- **1,083 companies reported money already raised**: $13.2B in total, a median of about
  $1.2M, and 581 at $1M or more
- **Top sectors:** Technology 355, Real Estate 318, Other 254, Health Care 150, Financial
  Services 99
- **Top states:** California 193, Texas 144, New York 127, Florida 77

The sample was made with the
[Recently Funded Companies (SEC Form D) actor](https://apify.com/viridian_layout_ea2/sec-form-d-funding-tracker)
on Apify, built by CMM Research. The actor runs the same extraction for any date range back
to 2001. It can filter by sector, state, amount raised, round size, founding year or name
keyword, and it can return only the companies that are new since your last run.

## Columns

| Column | Meaning |
|---|---|
| `companyName` | Exactly as filed with the SEC |
| `cik` | The SEC's permanent company ID |
| `filedAt` | Date the SEC received the filing |
| `firstSaleDate` | Date of the round's first sale (empty if not yet occurred or not given) |
| `sector` / `industry` | As chosen by the company on the form, e.g. Technology / Other Technology |
| `entityType` / `jurisdiction` | e.g. Corporation / DELAWARE |
| `yearOfIncorporation` | Year founded. The form only gives it for companies under five years old |
| `city` / `state` / `zipCode` / `stateOrCountryName` | Business address (state is a two-letter code; non-US codes are SEC country codes) |
| `phone` | Company phone number as filed |
| `totalOfferingAmount` | Round target in USD (empty when "indefinite") |
| `totalAmountSold` / `totalRemaining` | Raised so far, and still to raise, in USD |
| `minimumInvestment` | Smallest investment accepted, USD |
| `investorCount` | Investors so far |
| `securitiesOffered` | Equity, Debt, Options, SAFEs and so on, separated by "; " |
| `exemptions` | e.g. Rule 506(b), Rule 506(c) (506(c) rounds may be advertised publicly) |
| `revenueRange` | When disclosed; most companies choose "Decline to Disclose" |
| `executivesText` | Officers, directors and promoters named on the form, with titles where given |
| `formUrl` | The original filing on SEC EDGAR |

## Things to know

- **"Operating companies" is broad.** Many Real Estate rows are single-property LLCs raising
  for one deal. Filter on `sector` and `yearOfIncorporation` if you want startups.
- **Amounts are as reported.** A few very large rows (e.g. a $3.1B raise) dominate the totals,
  so use medians.
- **Not every raise is here.** Form D covers Regulation D only. Public offerings, Reg CF
  crowdfunding and some other exemptions aren't included, and some companies file late.
- **No emails, websites or investor names.** Form D doesn't include them.

## Notes

- Source: US Securities and Exchange Commission, EDGAR. CMM Research isn't affiliated with the
  SEC.
- Rows include the names and titles of company executives and directors, and company phone
  numbers, exactly as published in public SEC filings. Please use them responsibly and follow
  the anti-spam and privacy laws that apply to you.
- Questions or a custom extract: chazmichael_michaels@icloud.com
