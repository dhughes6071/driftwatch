"""Where each CMM Research Actor ranks in Apify Store search, for the queries buyers use.

  python3 scripts/store_rankings.py            # prints and appends to research/data/store_rankings.csv
"""
import csv, datetime, json, os, urllib.parse, urllib.request

USER = "viridian_layout_ea2"
QUERIES = ["jobs", "job scraper", "jobs api", "job listings", "greenhouse", "lever jobs", "ashby", "workday",
           "workday jobs", "salary", "career site", "hiring", "companies hiring", "hiring signals", "sales leads",
           "funding", "form d", "startups funding", "nurse jobs", "hospital jobs", "healthcare jobs", "shopify",
           "shopify stores", "shopify leads", "ecommerce leads"]
OUT = os.path.join(os.path.dirname(__file__), "..", "research", "data", "store_rankings.csv")

today = datetime.date.today().isoformat()
rows = []
for q in QUERIES:
    r = json.load(urllib.request.urlopen("https://api.apify.com/v2/store?" + urllib.parse.urlencode({"search": q, "limit": 100})))
    items = r["data"]["items"]
    hits = [(i + 1, a["name"]) for i, a in enumerate(items) if a["username"] == USER]
    for rank, name in hits or [(None, None)]:
        rows.append({"date": today, "query": q, "results": r["data"]["total"], "rank": rank or "", "actor": name or ""})
    print(f"{q:20} {r['data']['total']:6} results   " + (", ".join(f"#{k} {n}" for k, n in hits) or "not in top 100"))

new = not os.path.exists(OUT)
with open(OUT, "a", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["date", "query", "results", "rank", "actor"])
    if new:
        w.writeheader()
    w.writerows(rows)
