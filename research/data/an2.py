import json, collections, re, statistics
a=json.load(open("apify.json"))
def u30(x): return (x.get("stats") or {}).get("totalUsers30Days") or 0
def rating(x): return x.get("actorReviewRating") or 0
def nrev(x): return x.get("actorReviewCount") or 0
def fails(x):
    s=(x.get("stats") or {}).get("publicActorRunStats30Days") or {}
    t=s.get("TOTAL") or 0
    return ((s.get("FAILED",0)+s.get("TIMED-OUT",0))/t) if t else None

traction=[x for x in a if u30(x)>=100]
print(f"actors with >=100 users/30d: {len(traction)}\n")

print("=== TOP 25 BY 30-DAY USERS (the saturated head) ===")
for x in sorted(traction,key=lambda z:-u30(z))[:25]:
    f=fails(x)
    print(f"  {u30(x):>7,}u  {rating(x):.2f}*({nrev(x):>4})  fail={('%.0f%%'%(f*100)) if f is not None else ' n/a'}  {x['username']}/{x['name'][:38]}")

print("\n=== HIGH DEMAND, WEAK INCUMBENT (rating<4.3 w/ >=10 reviews, or fail rate>20%) ===")
weak=[x for x in traction if (rating(x)<4.3 and nrev(x)>=10) or (fails(x) or 0)>0.20]
for x in sorted(weak,key=lambda z:-u30(z))[:25]:
    f=fails(x)
    print(f"  {u30(x):>7,}u  {rating(x):.2f}*({nrev(x):>4})  fail={('%.0f%%'%(f*100)) if f is not None else ' n/a'}  {x['username']}/{x['name'][:38]}")
