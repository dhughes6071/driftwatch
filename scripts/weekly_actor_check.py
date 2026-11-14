#!/usr/bin/env python3
"""Weekly Apify actor check: gathers everything the weekly scheduled task reports.

Read-only except for one thing: it appends today's rows to
research/data/actor_stats.csv (skipped if today's rows are already there).
It changes no actor, price, launchd job or git state.

Run from anywhere:  python3 scripts/weekly_actor_check.py
"""
import csv
import datetime as dt
import glob
import json
import os
import sqlite3
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "research/data/actor_stats.csv")
HEADER = ["date", "actor", "totalUsers", "users7d", "users30d", "totalRuns",
          "runs30d", "failed30d", "timedout30d"]
ACTORS = [
    "9YFhLqT6A7qTgxbzt",                          # workday-jobs-scraper
    "viridian_layout_ea2/company-career-site-jobs",
    "oDFG9ptBmIy6QjQDZ",                          # career-site-jobs-api
    "jCLHVtAcrQRjONvIX",                          # sec-form-d-funding-tracker
    "aYrYbWxHfi5ugoAwK",                          # companies-hiring-leads
    "00TIlJfSotxmi4Jzb",                          # shopify-store-leads
    "OR5uVFwIHBPyHrBWH",                          # us-hospital-jobs
]


def section(title):
    print(f"\n===== {title} =====")


def actor_stats():
    section("APIFY ACTOR STATS")
    env = dict(os.environ, APIFY_CLI_DISABLE_TELEMETRY="1")
    rows = []
    for a in ACTORS:
        p = subprocess.run(["apify", "actors", "info", a, "--json"], cwd=ROOT, env=env,
                           stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
        try:
            d = json.loads(p.stdout)
        except json.JSONDecodeError:
            print(f"{a}: could not read CLI output (exit {p.returncode}): {p.stderr.strip()[:300]}")
            continue
        s = d.get("stats") or {}
        r = s.get("publicActorRunStats30Days") or {}
        missing = [k for k in ("totalUsers", "totalUsers7Days", "totalUsers30Days", "totalRuns")
                   if k not in s] + ([] if r else ["publicActorRunStats30Days"])
        print(f"{d.get('name')}: isPublic={d.get('isPublic')} totalUsers={s.get('totalUsers')} "
              f"users7d={s.get('totalUsers7Days')} users30d={s.get('totalUsers30Days')} "
              f"totalRuns={s.get('totalRuns')} runs30d={r}"
              + (f"  MISSING FIELDS: {missing}" if missing else ""))
        rows.append([d.get("name"), s.get("totalUsers"), s.get("totalUsers7Days"),
                     s.get("totalUsers30Days"), s.get("totalRuns"), r.get("TOTAL"),
                     r.get("FAILED"), r.get("TIMED-OUT")])
    return rows


def append_csv(rows):
    section("CSV")
    today = dt.date.today().isoformat()
    exists = os.path.exists(CSV_PATH)
    previous = []
    if exists:
        with open(CSV_PATH, newline="") as f:
            previous = list(csv.reader(f))[1:]
    # One row per actor per day: skip actors already recorded today, add any new ones.
    done = {r[1] for r in previous if len(r) > 1 and r[0] == today}
    new = [r for r in rows if r[0] not in done]
    if not new:
        print(f"rows for {today} already present; not appending again")
    else:
        with open(CSV_PATH, "a", newline="") as f:
            w = csv.writer(f)
            if not exists:
                w.writerow(HEADER)
            for r in new:
                w.writerow([today] + ["" if v is None else v for v in r])
        print(f"appended {len(new)} rows for {today} to {CSV_PATH}")
    print("previous rows (newest last, for comparison):")
    for r in [r for r in previous if r and r[0] != today][-28:]:
        print("  " + ",".join(r))


def newest(pattern):
    files = glob.glob(os.path.join(ROOT, pattern))
    return max(files, key=os.path.getmtime) if files else None


def tail(path, n):
    with open(path, errors="replace") as f:
        return f.readlines()[-n:]


def query(db, sqls):
    # immutable=1 reads a snapshot without needing to create lock files; fine for counts.
    c = sqlite3.connect(f"file:{db}?mode=ro&immutable=1", uri=True)
    try:
        for q in sqls:
            print(f"> {q}")
            for row in c.execute(q).fetchall():
                print("  ", row)
    finally:
        c.close()


def career_index():
    section("CAREER-JOBS INDEX")
    log = newest("data/logs/career-jobs-*.log")
    if log:
        print(f"newest log: {log}")
        lines = open(log, errors="replace").readlines()
        print("".join(lines[-5:]).rstrip())
        bad = [l.rstrip() for l in lines if any(k in l for k in ("CRAWL FAILED", "PUBLISH FAILED", "skipping"))]
        print("failure markers:", bad[-3:] if bad else "none")
    else:
        print("no career-jobs log found")
    query(os.path.join(ROOT, "data/career-index.db"),
          ["SELECT started_at, finished_at, stats FROM runs ORDER BY started_at DESC LIMIT 3"])


def shopify_index():
    section("SHOPIFY INDEX")
    log = newest("data/logs/shopify-stores-*.log")
    if log:
        print(f"newest log: {log}")
        print("".join(tail(log, 4)).rstrip())
    else:
        print("no shopify log found")
    alerts = os.path.join(ROOT, "data/logs/alerts.log")
    if os.path.exists(alerts):
        print("--- last 20 lines of alerts.log")
        print("".join(tail(alerts, 20)).rstrip())
    query(os.path.join(ROOT, "data/shopify-stores.db"), [
        "SELECT status, count(*) FROM stores GROUP BY status",
        "SELECT source, position, done FROM progress",
        "SELECT kind, started_at, stats FROM runs WHERE kind='publish' ORDER BY started_at DESC LIMIT 1",
    ])


if __name__ == "__main__":
    print("run at", dt.datetime.now().isoformat(timespec="seconds"))
    rows = actor_stats()
    append_csv(rows)
    for step in (career_index, shopify_index):
        try:
            step()
        except Exception as e:  # keep going so the report still has the other parts
            print(f"ERROR in {step.__name__}: {e}")
