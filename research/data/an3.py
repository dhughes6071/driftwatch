import json, re
a=json.load(open("apify.json"))
def u30(x): return (x.get("stats") or {}).get("totalUsers30Days") or 0
def rating(x): return x.get("actorReviewRating") or 0
def nrev(x): return x.get("actorReviewCount") or 0

# Platforms whose ToS prohibit scraping, or that have litigated it.
TOS_RISK = re.compile(r"instagram|linkedin|facebook|tiktok|twitter|threads|x\.com|meta-|whatsapp|youtube|reddit|zoominfo|apollo|lusha|indeed|glassdoor|naukri|crunchbase|yelp|tripadvisor|zillow",re.I)
def risky(x):
    blob=f"{x['name']} {x.get('title','')} {' '.join(x.get('categories') or [])}"
    return bool(TOS_RISK.search(blob))

clean=[x for x in a if not risky(x) and u30(x)>=100]
print(f"actors with >=100 users/30d and no obvious ToS-risk platform: {len(clean)} (of 578 total)\n")

print("=== LEGITIMATE NICHES WITH REAL DEMAND ===")
for x in sorted(clean,key=lambda z:-u30(z))[:30]:
    r=f"{rating(x):.2f}*({nrev(x)})" if nrev(x) else "unrated"
    print(f"  {u30(x):>6,}u  {r:<14} {x['username']}/{x['name'][:40]}")

print("\n=== ...OF THOSE, THE WEAK ONES (rating<4.2, >=8 reviews) ===")
weak=[x for x in clean if rating(x)<4.2 and nrev(x)>=8]
for x in sorted(weak,key=lambda z:-u30(z))[:20]:
    print(f"  {u30(x):>6,}u  {rating(x):.2f}*({nrev(x):>3})  {x['username']}/{x['name'][:44]}")
    d=(x.get('description') or '')[:110].replace('\n',' ')
    print(f"          {d}")
