import json, random, urllib.request, urllib.error, collections, ssl, socket
from concurrent.futures import ThreadPoolExecutor
items=json.load(open("all.json"))
def calls(i): return (i.get("quality") or {}).get("l30DaysTotalCalls") or 0
random.seed(42)
# sample: 150 random + all with >=50 calls
pop=[i for i in items if calls(i)>=50]
samp=random.sample([i for i in items if calls(i)<50], 200) + pop[:150]
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def probe(i):
    url=i["resource"]
    try:
        req=urllib.request.Request(url, headers={"User-Agent":"x402-market-research/1.0","Accept":"application/json"})
        r=urllib.request.urlopen(req,timeout=12,context=ctx)
        return (i, r.status, "")
    except urllib.error.HTTPError as e:
        return (i, e.code, "")
    except Exception as e:
        return (i, 0, type(e).__name__)
res=[]
with ThreadPoolExecutor(max_workers=30) as ex:
    res=list(ex.map(probe,samp))
c=collections.Counter(s for _,s,_ in res)
print("=== HTTP status distribution across", len(res), "sampled registered x402 endpoints ===")
for k,v in c.most_common():
    label={402:"402 Payment Required (healthy)",0:"connection failed / DNS / TLS error",404:"404 Not Found (dead route)",200:"200 OK (no paywall!)",500:"500 server error",403:"403 forbidden"}.get(k,f"HTTP {k}")
    print(f"  {label:<40} {v:>4}  ({v/len(res)*100:.1f}%)")
healthy=c[402]
print(f"\nHEALTHY (returns 402): {healthy}/{len(res)} = {healthy/len(res)*100:.1f}%")
print(f"BROKEN/UNREACHABLE:    {len(res)-healthy}/{len(res)} = {(len(res)-healthy)/len(res)*100:.1f}%")
errs=collections.Counter(e for _,s,e in res if s==0)
print("\nconnection error types:", dict(errs))
# high-traffic subset health
hi=[(i,s) for i,s,_ in res if calls(i)>=50]
print(f"\nAmong endpoints with >=50 calls/30d: {sum(1 for _,s in hi if s==402)}/{len(hi)} healthy")
