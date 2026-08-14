import json, collections, statistics
from urllib.parse import urlparse
items=json.load(open("all.json"))
def calls(i): return (i.get("quality") or {}).get("l30DaysTotalCalls") or 0
def payers(i): return (i.get("quality") or {}).get("l30DaysUniquePayers") or 0
def price(i):
    a=i.get("accepts") or []
    if not a: return None
    try: return int(a[0].get("amount","0"))/1e6
    except: return None

tot=len(items)
active=[i for i in items if calls(i)>0]
print(f"TOTAL registered resources: {tot}")
print(f"Resources with >0 calls in last 30d: {len(active)}  ({len(active)/tot*100:.1f}%)")
for th in (10,100,1000,10000):
    n=len([i for i in items if calls(i)>=th])
    print(f"  >= {th} calls/30d: {n} ({n/tot*100:.2f}%)")
print()
allcalls=sum(calls(i) for i in items)
print(f"Total calls across catalog (30d): {allcalls:,}")

# revenue estimate
rev=[]
for i in items:
    p=price(i); c=calls(i)
    if p is not None: rev.append((p*c,i))
rev.sort(key=lambda x:-x[0])
totrev=sum(r for r,_ in rev)
print(f"Estimated 30d GMV (price x calls): ${totrev:,.0f}")
top10=sum(r for r,_ in rev[:10])
top50=sum(r for r,_ in rev[:50])
print(f"  Top 10 share: {top10/totrev*100:.1f}%   Top 50 share: {top50/totrev*100:.1f}%")
print()
print("=== TOP 25 BY ESTIMATED 30d REVENUE ===")
for r,i in rev[:25]:
    print(f"${r:>10,.0f}  calls={calls(i):>9,}  payers={payers(i):>6,}  ${price(i):<9.6f} {urlparse(i['resource']).netloc[:38]:<38} {(i.get('description') or '')[:60]}")
print()
print("=== TOP 25 BY UNIQUE PAYERS (breadth of real demand) ===")
byp=sorted(items,key=lambda i:-payers(i))
for i in byp[:25]:
    p=price(i)
    print(f"payers={payers(i):>6,} calls={calls(i):>9,} ${p if p is not None else -1:<9.6f} {urlparse(i['resource']).netloc[:38]:<38} {(i.get('description') or '')[:60]}")
