"""Daily snapshot for the CMM Actors dashboard (https://claude.ai/artifact/GtwYuJKauRqh6gcuJCL51y).

  python3 scripts/dashboard_snapshot.py

Writes data/dashboard/*.json (gitignored), one file per dashboard dataset:

  actors.json     one row per Actor: Store status, price, users, runs, paying/free users and profit this month
  history.json    users and runs per Actor per day (research/data/actor_stats.csv plus a daily row from here on)
  revenue.json    this month's costs, revenue and profit, as read from Console > Insights > Monetization
  rankings.json   where each Actor ranks in Apify Store search, latest run of scripts/store_rankings.py
  index.json      health of the data behind the Actors: jobs index, hospital tags, Shopify stores, last crawl

Users and runs come from the Apify API (APIFY_TOKEN in .env). Revenue and paying users are only shown in the
Console's Insights page, so they come from data/dashboard/insights.json, which is updated by reading that page
(see the dashboard routine); its `readAt` says how old they are.
"""
import csv, datetime, json, os, sqlite3, subprocess, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "data", "dashboard")
os.makedirs(OUT, exist_ok=True)

ACTORS = [  # id, name, short label
    ("z8bXLsZLfOGquXA0U", "company-career-site-jobs", "Greenhouse, Lever & Ashby"),
    ("oDFG9ptBmIy6QjQDZ", "career-site-jobs-api", "Career Site Jobs API"),
    ("OR5uVFwIHBPyHrBWH", "us-hospital-jobs", "Hospital & Nurse Jobs"),
    ("9YFhLqT6A7qTgxbzt", "workday-jobs-scraper", "Workday Jobs"),
    ("aYrYbWxHfi5ugoAwK", "companies-hiring-leads", "Companies Hiring"),
    ("jCLHVtAcrQRjONvIX", "sec-form-d-funding-tracker", "Form D Funding"),
    ("00TIlJfSotxmi4Jzb", "shopify-store-leads", "Shopify Store Leads"),
]


def env_token():
    for line in open(os.path.join(ROOT, ".env")):
        if line.startswith("APIFY_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("APIFY_TOKEN missing from .env")


def api(path, token):
    req = urllib.request.Request("https://api.apify.com/v2/" + path, headers={"Authorization": "Bearer " + token})
    return json.load(urllib.request.urlopen(req, timeout=60))["data"]


def price_per_1000(act):
    p = (act.get("pricingInfos") or [{}])[-1]
    for name, ev in (p.get("pricingPerEvent") or {}).get("actorChargeEvents", {}).items():
        if name == "apify-actor-start":
            continue
        tiers = ev.get("eventTieredPricingUsd")
        usd = tiers["FREE"]["tieredEventPriceUsd"] if tiers else ev.get("eventPriceUsd")
        return round(usd * 1000, 2) if usd is not None else None
    return None


def write(name, rows, **extra):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump({"rows": rows, **extra}, f, indent=1)


def main():
    token = env_token()
    now = datetime.datetime.now(datetime.timezone.utc)
    today = now.date().isoformat()
    insights = {}
    ins_path = os.path.join(OUT, "insights.json")
    if os.path.exists(ins_path):
        insights = json.load(open(ins_path))
    per_actor = insights.get("actors", {})

    # ---- actors + today's history row
    actors, hist_today = [], []
    for aid, name, label in ACTORS:
        a = api(f"acts/{aid}", token)
        s = a.get("stats", {})
        ins = per_actor.get(name, {})
        actors.append({
            "actor": label,
            "name": name,
            "status": "Public" if a.get("isPublic") else "Private",
            "pricePer1000": price_per_1000(a),
            "usersTotal": s.get("totalUsers", 0),
            "users7d": s.get("totalUsers7Days", 0),
            "users30d": s.get("totalUsers30Days", 0),
            "runs30d": (s.get("publicActorRunStats30Days") or {}).get("TOTAL", 0),
            "payingUsersMonth": ins.get("payingUsers"),
            "freeUsersMonth": ins.get("freeUsers"),
            "profitMonth": ins.get("profit"),
            "storeUrl": f"https://apify.com/viridian_layout_ea2/{name}",
        })
        hist_today.append({"date": today, "actor": label, "users30d": s.get("totalUsers30Days", 0),
                           "runs30d": (s.get("publicActorRunStats30Days") or {}).get("TOTAL", 0)})
    write("actors.json", actors)

    # ---- history: weekly rows from the old check, daily rows from here on (one per day, latest wins)
    daily_path = os.path.join(ROOT, "research", "data", "actor_stats_daily.csv")
    daily = {}
    if os.path.exists(daily_path):
        for r in csv.DictReader(open(daily_path)):
            daily[(r["date"], r["actor"])] = r
    for r in hist_today:
        daily[(r["date"], r["actor"])] = {k: str(v) for k, v in r.items()}
    with open(daily_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "actor", "users30d", "runs30d"])
        w.writeheader()
        w.writerows(sorted(daily.values(), key=lambda r: (r["date"], r["actor"])))
    labels = {name: label for _, name, label in ACTORS}
    hist = {}
    for r in csv.DictReader(open(os.path.join(ROOT, "research", "data", "actor_stats.csv"))):
        if r["actor"] in labels:
            hist[(r["date"], labels[r["actor"]])] = {"date": r["date"], "actor": labels[r["actor"]],
                                                     "users30d": int(r["users30d"]), "runs30d": int(r["runs30d"])}
    for r in daily.values():
        hist[(r["date"], r["actor"])] = {"date": r["date"], "actor": r["actor"], "users30d": int(r["users30d"]),
                                         "runs30d": int(r["runs30d"])}
    write("history.json", sorted(hist.values(), key=lambda r: (r["date"], r["actor"])))

    # ---- revenue (from the Insights reading)
    write("revenue.json", [{
        "month": insights.get("month"), "revenue": insights.get("revenue"), "costs": insights.get("costs"),
        "profit": insights.get("profit"), "readAt": insights.get("readAt"),
    }] if insights else [])

    # ---- rankings: run the tracker, keep its latest date
    subprocess.run(["python3", os.path.join(ROOT, "scripts", "store_rankings.py")], check=True, capture_output=True)
    rk = list(csv.DictReader(open(os.path.join(ROOT, "research", "data", "store_rankings.csv"))))
    last = max(r["date"] for r in rk)
    write("rankings.json", [{"key": f"{r['query']} | {labels.get(r['actor'], r['actor']) or 'none'}",
                             "query": r["query"], "results": int(r["results"]),
                             "rank": int(r["rank"]) if r["rank"] else None,
                             "actor": labels.get(r["actor"], r["actor"]) or "Not in top 100"}
                            for r in rk if r["date"] == last], date=last)

    # ---- index health
    rows = []
    try:
        man = json.load(urllib.request.urlopen(open(os.path.join(ROOT, "data", "career-manifest-url.txt")).read().strip(), timeout=60))
        rows += [{"metric": "Open jobs in the index", "value": man["totalJobs"], "asOf": man["indexedAt"]},
                 {"metric": "Companies in the index", "value": man["companies"], "asOf": man["indexedAt"]},
                 {"metric": "Hospital jobs with clinical tags", "value": (man.get("health") or {}).get("count"), "asOf": man["indexedAt"]}]
    except Exception as e:  # keep the other figures
        print("career manifest:", e)
    try:
        sm = json.load(urllib.request.urlopen(open(os.path.join(ROOT, "data", "shopify-manifest-url.txt")).read().strip(), timeout=60))
        rows.append({"metric": "Live Shopify stores", "value": sm["totalStores"], "asOf": sm["indexedAt"]})
    except Exception as e:
        print("shopify manifest:", e)
    try:
        # SELECT only. Read-only mode is refused while the crawler's write-ahead log is active.
        db = sqlite3.connect(os.path.join(ROOT, "data", "career-index.db"), timeout=30)
        # The latest full nightly crawl: a catch-up run of one source (CRAWL_ONLY) has no ATS or Oracle companies.
        for started, stats in db.execute("SELECT started_at, stats FROM runs WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 10"):
            st = json.loads(stats or "{}")
            if st.get("atsCompanies") and st.get("oracleSites"):
                rows.append({"metric": "Workday jobs in last crawl", "value": st.get("workdayJobs"), "asOf": started})
                rows.append({"metric": "Crawl errors in last crawl", "value": st.get("errors"), "asOf": started})
                break
    except Exception as e:
        print("crawl stats:", e)
    write("index.json", rows)
    print(f"wrote {OUT}: {len(actors)} actors, {len(hist)} history rows, rankings of {last}, {len(rows)} index figures")


if __name__ == "__main__":
    main()
