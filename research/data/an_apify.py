import json, collections
a=json.load(open("apify.json"))
def u30(x): return (x.get("stats") or {}).get("totalUsers30Days") or 0
def runs(x): return (x.get("stats") or {}).get("totalRuns") or 0
def rating(x): return x.get("actorReviewRating") or 0
def revcount(x): return x.get("actorReviewCount") or 0

print(f"actors sampled: {len(a)}")
act=[x for x in a if u30(x)>0]
print(f"with >0 users in last 30d: {len(act)} ({len(act)/len(a)*100:.1f}%)")
for t in (10,100,1000):
    n=len([x for x in a if u30(x)>=t]); print(f"  >= {t} users/30d: {n} ({n/len(a)*100:.2f}%)")
print()
# pricing model distribution
pm=collections.Counter((x.get("currentPricingInfo") or {}).get("pricingModel","NONE") for x in a)
print("pricing models:", dict(pm))
print()
# category demand vs supply
cat_supply=collections.Counter()
cat_demand=collections.Counter()
for x in a:
    for c in (x.get("categories") or ["(none)"]):
        cat_supply[c]+=1
        cat_demand[c]+=u30(x)
print(f"{'CATEGORY':<28}{'actors':>8}{'users30d':>12}{'users/actor':>13}")
rows=[]
for c,s in cat_supply.items():
    d=cat_demand[c]
    rows.append((c,s,d,d/s))
for c,s,d,r in sorted(rows,key=lambda z:-z[3])[:22]:
    print(f"{c[:27]:<28}{s:>8,}{d:>12,}{r:>13,.1f}")
