# Shopify Store Leads — Find Stores by Niche, Country & Apps

Find **live Shopify stores** in any niche and get one clean row per store. Each row has
the store's name, website, country and city, currency, product count, typical prices,
how recently it added products, its theme and apps, and the **emails, phones and social
profiles the store publishes**. Filter by niche, country, store size, price range,
activity or apps. Or schedule it to get **only stores that are new since your last run**.

It searches **our own index of 188,000+ live Shopify stores**, which is re-checked every
two weeks, so a search returns in about a minute. You don't need any coding, logins or proxies.

*Built and maintained by CMM Research.* Need a custom list or feed? Email us at
[chazmichael_michaels@icloud.com](mailto:chazmichael_michaels@icloud.com).

**Who uses it**

- **Shopify agencies and freelancers:** stores on an old theme, without an email app, or
  growing fast enough to need help.
- **App makers:** stores using a competitor's app (Klaviyo, Judge.me, ReCharge…), or none.
- **Suppliers and wholesalers:** active stores in your category and region, by catalog size
  and price point.
- **Market research:** how many stores sell X, where, at what prices, on which apps.

**A real result** (18 Oct 2026, a search for US coffee stores with an email address; `shipsToCountries` shortened from 28 countries):

```json
{
  "domain": "andytownsf.com",
  "url": "https://andytownsf.com",
  "name": "Andytown Coffee Roasters",
  "description": "Andytown is an artisan coffee roaster and bakery based in the Outer Sunset district of San Francisco. Enjoy expertly crafted coffee, fresh pastries, and a cozy atmosphere. Visit us in person or shop online!",
  "city": "San Francisco",
  "province": "California",
  "country": "US",
  "currency": "USD",
  "shipsToCountries": [
    "AE",
    "AT",
    "AU",
    "BE",
    "CA",
    "CH"
  ],
  "language": "en",
  "productCount": 33,
  "collectionCount": 6,
  "priceMin": 2.7,
  "priceMedian": 17.25,
  "priceMax": 60,
  "productTypes": [
    {
      "name": "Merchandise",
      "count": 23
    },
    {
      "name": "coffee",
      "count": 10
    }
  ],
  "vendors": [
    {
      "name": "andytown-sf",
      "count": 33
    }
  ],
  "newestProductAt": "2026-10-05T17:49:12.000Z",
  "productsAddedLast30Days": 1,
  "emails": [
    "orders@andytownsf.com"
  ],
  "phones": [],
  "instagram": "https://www.instagram.com/andytownsf",
  "facebook": "https://www.facebook.com/andytownsf",
  "twitter": "https://x.com/andytownsf",
  "theme": "PixelVerse",
  "apps": [
    "Klaviyo",
    "Mailchimp",
    "Judge.me",
    "ReCharge",
    "Google Analytics"
  ],
  "firstSeenAt": "2026-10-17T19:20:13.383Z"
}
```

## Why this one

- **Re-checked every two weeks, not a stale list.** Every store in the index was open at
  its last check, within about two weeks. Closed, password-protected and dead stores are left out.
- **Activity you can filter on.** `productsAddedLast30Days` and `newestProductAt` show which
  stores are actively trading and growing, not just which exist.
- **Catalog facts.** Product count, typical, lowest and highest price, and the most common
  product types and brands.
- **Theme and apps.** Detected from the storefront: Klaviyo, Omnisend, Judge.me, Yotpo,
  Loox, ReCharge, Gorgias, Afterpay, Klarna, PageFly and more.
- **New stores feed.** With `onlyNewSinceLastRun`, a scheduled search returns only stores
  our index found since the last run.
- **Only public business contact details.** Emails and phones are the ones each store
  shows on its own homepage or contact page. We never guess addresses, and we drop
  no-reply addresses.
- **Pay only for what you get.** You're charged per store delivered; filtering is free.

## Pricing

**$5 per 1,000 stores** ($0.005 per store), plus Apify's standard $0.00005 run-start fee.
On Apify's paid plans it's cheaper: $4.50 (Starter), $4 (Scale) or $3.50 (Business) per 1,000.
Platform usage is included, so you are not billed for compute separately.

- **`maxResults`** is a hard cap per run (default 500, at most $2.50).
- **Apify's maximum cost per run** also works: if the limit is reached, the Actor stops
  cleanly and keeps everything delivered so far.

## Input

| Field | What it does |
|---|---|
| `keywords` / `excludeKeywords` | Niche words matched against the store's name, description, domain, product types and brands, e.g. `["coffee"]`. |
| `countries` / `locationKeywords` | Business country (two-letter codes) and city or state. |
| `currencies` / `shipsTo` / `languages` | Store currency, shipping countries and storefront language. |
| `minProducts` / `maxProducts` | Catalog size. |
| `minMedianPrice` / `maxMedianPrice` | Typical product price, in the store's own currency. |
| `activeWithinDays` / `minProductsAddedLast30Days` | Only stores that are adding products. |
| `requireEmail` / `requirePhone` / `requireSocials` | Only stores with these contact details. |
| `apps` / `themes` | Uses one of these apps, or theme name contains one of these. |
| `foundWithinDays` / `onlyNewSinceLastRun` / `monitorName` | Only stores our index found recently, or since this search last ran. |
| `sortBy` | Newest found (fastest), most products, most products added in 30 days, or most recently active. |
| `maxResults` | Cap on results, and your main cost control. |

## Output

| Field | Description |
|---|---|
| `name` / `url` / `domain` / `myshopifyDomain` | Store name, website, and its permanent myshopify address |
| `description` | The store's own description |
| `country` / `province` / `city` | Where the business is |
| `currency` / `shipsToCountries` / `language` | Currency, shipping countries ("*" = everywhere), storefront language |
| `productCount` / `collectionCount` | Published products and collections. Shopify stops counting at 25,001, which means "25,000 or more" |
| `priceMin` / `priceMedian` / `priceMax` | Prices across the newest products (up to 250 sampled) |
| `productTypes` / `vendors` | Most common product types and brands, with counts |
| `newestProductAt` / `productsAddedLast30Days` | When it last published a product, and how many in the last 30 days (counted up to 250, so 250 means "250 or more") |
| `emails` / `phones` | Contact details published on the store's homepage or contact page |
| `instagram` / `facebook` / `tiktok` / `youtube` / `pinterest` / `twitter` / `linkedin` | Social profiles the store links to |
| `theme` / `apps` | Storefront theme and detected apps |
| `firstSeenAt` / `checkedAt` / `indexedAt` | When our index found the store, last checked it, and was last published |

## Examples

**Coffee stores in the US with an email address**
```json
{ "keywords": ["coffee"], "countries": ["US"], "requireEmail": true, "maxResults": 1000 }
```

**Growing skincare brands (10+ new products this month), biggest catalogs first**
```json
{ "keywords": ["skincare", "skin care"], "minProductsAddedLast30Days": 10, "sortBy": "mostProducts" }
```

**UK stores using Klaviyo, active in the last 30 days**
```json
{ "countries": ["GB"], "apps": ["Klaviyo"], "activeWithinDays": 30, "maxResults": 2000 }
```

**Weekly: new Shopify stores in Australia (schedule weekly)**
```json
{ "countries": ["AU"], "onlyNewSinceLastRun": true, "maxResults": 5000 }
```

## Use it from Claude, Cursor or any AI agent (MCP)

Apify's hosted MCP server lets an AI assistant run this Actor as a tool. It writes the
input from a plain-English request and reads back the results. Add this to your client's
MCP settings (Claude Desktop, Cursor, VS Code, Windsurf and others):

```json
{
  "mcpServers": {
    "shopify-store-leads": {
      "url": "https://mcp.apify.com?tools=viridian_layout_ea2/shopify-store-leads"
    }
  }
}
```

The first time it connects, a browser window opens so you can sign in to Apify. If your
client can't do that, add `"headers": { "Authorization": "Bearer <YOUR_APIFY_TOKEN>" }`.
You'll find your token under **Settings → API & Integrations** in Apify Console.

In Claude Code, run this once:

```bash
claude mcp add --transport http shopify-store-leads "https://mcp.apify.com?tools=viridian_layout_ea2/shopify-store-leads"
```

Then ask in plain English, for example:

- *"Find US coffee stores on Shopify that list an email address."*
- *"Which skincare brands added 10 or more products this month? Biggest catalogs first."*
- *"List UK Shopify stores that use Klaviyo and were active in the last 30 days, with their Instagram links."*

Runs started by an agent are billed exactly like any other run, at the price shown under
**Pricing**. Ask it to set `maxResults` if you want a hard cap.

## Notes

- **How stores are found.** A store on its own domain points that domain at Shopify. We
  check a large list of domains for exactly that, then read each store's public storefront
  information. Big brands on custom "headless" setups don't expose this and aren't
  included; the index is mostly small and mid-size stores.
- **How fresh it is.** Each store is re-checked about every two weeks. Product prices and counts
  are as of `checkedAt`.
- **Respecting stores.** We follow each store's `robots.txt`, identify ourselves, and go
  slowly.
- `onlyNewSinceLastRun` remembers each search in a key-value store named
  `shopify-stores-monitor` in your own Apify account.
- CMM Research is not affiliated with Shopify.
