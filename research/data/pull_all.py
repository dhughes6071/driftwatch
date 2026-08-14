import json, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE="https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100&offset={}"
def get(off):
    for _ in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request(BASE.format(off),headers={"Accept":"application/json"}),timeout=45)
            return json.load(r).get("items",[])
        except Exception as e:
            err=e
    print("FAIL",off,err); return []

offs=list(range(0,14200,100))
items=[]
with ThreadPoolExecutor(max_workers=12) as ex:
    for res in ex.map(get,offs):
        items.extend(res)
# dedupe by resource url
seen={}
for it in items:
    seen[it.get("resource")]=it
items=list(seen.values())
json.dump(items,open("all.json","w"))
print("unique resources:",len(items))
