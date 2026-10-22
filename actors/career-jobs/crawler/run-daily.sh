#!/bin/zsh
# Daily index refresh: crawl every career site, then publish to Apify.
# Run by launchd (see com.x402.career-jobs.plist); safe to run by hand too.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
mkdir -p data/logs
LOG="data/logs/career-jobs-$(date +%Y-%m-%d).log"

# One crawl at a time: a run that overlaps the previous one would double the load on every site.
LOCK="data/career-jobs.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date) previous run still in progress; skipping" >> "$LOG"
  exit 0
fi
trap 'rmdir "$LOCK"' EXIT
NODE="$(command -v node || echo /opt/homebrew/bin/node)"
# Tell the owner straight away; check-index.sh repeats it at 09:00 if still broken.
notify() {
  echo "$(date '+%Y-%m-%d %H:%M') ALERT: nightly run: $1 (see $LOG)" >> data/logs/alerts.log
  osascript -e "display notification \"Nightly run: $1. See $LOG\" with title \"Career Jobs index needs attention\" sound name \"Basso\"" 2>/dev/null
}

# Wait for the internet before crawling. On 22 Oct 2026 the connection was down
# from about 03:30 to 06:25: every Greenhouse, Workday, Oracle and SmartRecruiters
# company failed, and only the small systems crawled after 06:25 got through.
online() {
  curl -sf -m 15 -o /dev/null "https://boards-api.greenhouse.io/v1/boards/stripe/jobs" &&
  curl -sf -m 15 -o /dev/null -X POST -H "Content-Type: application/json" -H "Accept-Language: en-US" \
    -d '{"limit":1,"offset":0,"searchText":"","appliedFacets":{}}' \
    "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"
}

{
  if ! online; then
    echo "=== $(date) not online (Greenhouse/Workday unreachable); waiting up to 3 h"
    for i in {1..36}; do sleep 300; online && break; done
    if ! online; then echo "STILL OFFLINE"; notify "no internet for 3 hours, so the crawl did not run (the published index is unchanged)"; exit 1; fi
    echo "=== $(date) back online"
  fi
  echo "=== $(date) crawl"
  "$NODE" --experimental-strip-types actors/career-jobs/crawler/crawl.ts || { echo "CRAWL FAILED"; notify "the crawl failed"; exit 1; }
  # A source far below its usual count (17 Oct 2026: Workday 44k of ~780k) is worth a look,
  # but still publish: companies that failed keep their roles, so the index stays whole.
  drops=$("$NODE" --experimental-strip-types actors/career-jobs/crawler/source-drops.ts 2>/dev/null)
  if [[ -n "$drops" ]]; then echo "SOURCE DROP: $drops"; notify "${drops//$'\n'/; }"; fi
  echo "=== $(date) publish"
  "$NODE" --experimental-strip-types actors/career-jobs/crawler/publish.ts || { echo "PUBLISH FAILED"; notify "publishing failed"; exit 1; }
  echo "=== $(date) done"
} >> "$LOG" 2>&1

# Keep two weeks of logs.
find data/logs -name 'career-jobs-*.log' -mtime +14 -delete
