import json, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE="https://api.apify.com/v2/store?limit=1000&offset={}"
def get(off):
    for _ in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request(BASE.format(off),
                headers={"Accept":"application/json","User-Agent":"market-research/1.0"}),timeout=60)
            return json.load(r)["data"]["items"]
        except Exception as e:
            err=e
    print("FAIL",off,err); return []

offs=list(range(0,45000,1000))
items=[]
with ThreadPoolExecutor(max_workers=8) as ex:
    for res in ex.map(get,offs):
        items.extend(res)
seen={}
for it in items: seen[it.get("id")]=it
items=list(seen.values())
json.dump(items,open("apify.json","w"))
print("unique actors:",len(items))
