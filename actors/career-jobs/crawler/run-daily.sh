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

{
  echo "=== $(date) crawl"
  "$NODE" --experimental-strip-types actors/career-jobs/crawler/crawl.ts || { echo "CRAWL FAILED"; notify "the crawl failed"; exit 1; }
  echo "=== $(date) publish"
  "$NODE" --experimental-strip-types actors/career-jobs/crawler/publish.ts || { echo "PUBLISH FAILED"; notify "publishing failed"; exit 1; }
  echo "=== $(date) done"
} >> "$LOG" 2>&1

# Keep two weeks of logs.
find data/logs -name 'career-jobs-*.log' -mtime +14 -delete
