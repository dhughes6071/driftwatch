import json
a=json.load(open("apify.json"))
by={f"{x['username']}/{x['name']}":x for x in a}
def u30(x): return (x.get("stats") or {}).get("totalUsers30Days") or 0
def runs30(x):
    s=(x.get("stats") or {}).get("publicActorRunStats30Days") or {}
    return s.get("TOTAL") or 0

targets=["apify/screenshot-url","apify/google-trends-scraper","caffein.dev/ebay-sold-listings",
         "lukaskrivka/article-extractor-smart","fantastic-jobs/career-site-job-listing-api",
         "apify/playwright-scraper","memo23/trustpilot-scraper-ppe","apify/rag-web-browser"]
for t in targets:
    x=by.get(t)
    if not x: print(f"{t}: not in sample"); continue
    p=x.get("currentPricingInfo") or {}
    pe=p.get("pricingPerEvent") or {}
    events=pe.get("actorChargeEvents") or {}
    print(f"\n{t}")
    print(f"   users30d={u30(x):,}  runs30d={runs30(x):,}  model={p.get('pricingModel')}")
    for k,v in list(events.items())[:4]:
        print(f"   event '{k}': ${v.get('eventPriceUsd')}  ({(v.get('eventTitle') or '')[:50]})")
