# New actor niches — Apify Store scan, 14 Oct 2026

Source: public Store API, 11,805 actors with 30-day user counts (`research/data/apify_store_2026-10-14.csv`).

## The problem to solve
Of our job actors' 38 October users, 36 were on the Free plan, and their runs earn us nothing. So the next actor should serve **businesses**, who are on paid plans and accept higher prices.

## Shortlist (30-day users = demand; price per 1,000 results)
| Idea | Demand | Rivals' prices | Data source | Verdict |
|---|---|---|---|---|
| **Recently funded companies (SEC Form D)** | ~400 users/mo across Crunchbase and funding actors | $8–$80 | Free SEC EDGAR API, ~1,300 filings a week, with execs' names, amount raised, industry, city and phone | **Recommended**: B2B buyers, high prices, legal public data, and only one weak rival using Form D (17 users, $80, no reviews) |
| Companies hiring for X (sales leads from our 1.7M-job index) | Unproven (top rival has 36 users) | $10 | Our existing index | Good second actor: almost no new crawling |
| Trustpilot reviews | ~2,400 | $0.25–0.65 | Page JSON | Price war, skip |
| Shopify store products | ~1,000 | $1–6 | `/products.json` | Crowded, mostly lead-finders |
| More per-ATS job actors | 94–161 each | $2 | Our index | Small; job users are mostly Free plan |

## Side note on existing pricing
fantastic-jobs' Career Site Job Listing API has 1,605 users a month at **$12** per 1,000. Our Career API sells comparable data at $2.
