import json, urllib.request
from concurrent.futures import ThreadPoolExecutor
B="https://api.apify.com/v2/store?limit=1000&offset={}&sortBy=popularity"
def get(o):
    for _ in range(3):
        try: return json.load(urllib.request.urlopen(B.format(o),timeout=90))["data"]["items"]
        except Exception as e: err=e
    print("FAIL",o,err); return []
items=[]
with ThreadPoolExecutor(6) as ex:
    for r in ex.map(get,range(0,12000,1000)): items+=r
seen={i["id"]:i for i in items}
json.dump(list(seen.values()),open("store_2026-09-26.json","w"))
print(len(seen))
