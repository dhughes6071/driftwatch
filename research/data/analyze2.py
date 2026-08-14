import json, collections
from urllib.parse import urlparse
items=json.load(open("all.json"))
def calls(i): return (i.get("quality") or {}).get("l30DaysTotalCalls") or 0
def payers(i): return (i.get("quality") or {}).get("l30DaysUniquePayers") or 0
def price(i):
    a=i.get("accepts") or []
    if not a: return None
    try:
        p=int(a[0].get("amount","0"))/1e6
        return p if 0 < p <= 500 else None
    except: return None

# realistic GMV
rev=[(price(i)*calls(i), i) for i in items if price(i) is not None]
rev.sort(key=lambda x:-x[0])
tot=sum(r for r,_ in rev)
print(f"Est. 30d GMV (sane prices <= $500): ${tot:,.0f}  across {len(rev)} priced resources")
print(f"  Top 10 = {sum(r for r,_ in rev[:10])/tot*100:.1f}%   Top 25 = {sum(r for r,_ in rev[:25])/tot*100:.1f}%")
print()

print("=== REPEAT DEMAND: services with >=20 payers AND >=10 calls per payer ===")
cands=[i for i in items if payers(i)>=20 and calls(i)/max(payers(i),1)>=10]
cands.sort(key=lambda i:-calls(i))
print(f"{len(cands)} services qualify out of {len(items)}\n")
for i in cands[:30]:
    p=price(i); pr=f"${p:.4f}" if p else "n/a"
    mrr = p*calls(i) if p else 0
    print(f"calls={calls(i):>8,} payers={payers(i):>4,} c/p={calls(i)/payers(i):>7.1f} {pr:>10} ~${mrr:>8,.0f}/mo  {urlparse(i['resource']).netloc[:32]:<32} {(i.get('description') or '')[:55]}")

print()
print("=== DOMAIN-LEVEL: top operators by total calls ===")
dom=collections.defaultdict(lambda:[0,0,0,0])
for i in items:
    d=urlparse(i["resource"]).netloc
    dom[d][0]+=calls(i); dom[d][1]=max(dom[d][1],payers(i)); dom[d][2]+=1
    p=price(i)
    if p: dom[d][3]+= p*calls(i)
top=sorted(dom.items(),key=lambda x:-x[1][0])[:25]
for d,(c,pmax,n,r) in top:
    print(f"calls={c:>9,} maxPayers={pmax:>5,} endpoints={n:>5,} est=${r:>9,.0f}/mo  {d}")
