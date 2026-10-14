#!/bin/zsh
# Daily Shopify store refresh: discover more stores, check the stores that are
# due, then publish to Apify. Run by launchd at 10:00, finishing by about 02:00 (com.x402.shopify-stores.plist),
# well clear of the 03:30 career-jobs crawl. Safe to run by hand too.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
mkdir -p data/logs
LOG="data/logs/shopify-stores-$(date +%Y-%m-%d).log"

LOCK="data/shopify-stores.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date) previous run still in progress; skipping" >> "$LOG"
  exit 0
fi
trap 'rmdir "$LOCK"' EXIT
NODE="$(command -v node || echo /opt/homebrew/bin/node)"
notify() {
  echo "$(date '+%Y-%m-%d %H:%M') ALERT: shopify run: $1 (see $LOG)" >> data/logs/alerts.log
  osascript -e "display notification \"Shopify run: $1. See $LOG\" with title \"Shopify store index needs attention\" sound name \"Basso\"" 2>/dev/null
}
S=actors/shopify-stores/crawler

{
  echo "=== $(date) discover (tranco, refreshed list)"
  curl -sfL -m 300 -o data/lists/tranco-top-1m.zip "https://tranco-list.eu/top-1m.csv.zip" && unzip -o -q data/lists/tranco-top-1m.zip -d data/lists && mv -f data/lists/top-1m.csv data/lists/tranco-top-1m.csv
  # Tranco is re-read weekly (Mondays); its finished pass restarts from the top.
  if [ "$(date +%u)" = "1" ]; then "$NODE" --experimental-strip-types $S/discover.ts --tranco data/lists/tranco-top-1m.csv --hours 1; fi
  # Discovery is DNS only (it never touches Shopify), so it runs alongside enrichment.
  CC="$(ls -t data/lists/cc-*-domain-vertices.txt.gz 2>/dev/null | head -1)"
  if [ -n "$CC" ]; then
    echo "=== $(date) discover ($CC, up to 15 h, in the background)"
    "$NODE" --experimental-strip-types $S/discover.ts --cc "$CC" --hours 15 &
    DISCOVER_PID=$!
  fi
  # 10:00 + 16 h = 02:00, clear of the 03:30 career-jobs crawl. 8 requests/s is
  # the sustained rate Shopify tolerated on 14 Oct 2026 (25/s was refused).
  echo "=== $(date) enrich (up to 16 h)"
  "$NODE" --experimental-strip-types $S/enrich.ts --hours 16 --rps 8
  rc=$?
  if [ $rc -eq 3 ]; then notify "Shopify refused too many requests; enrichment stopped early"; elif [ $rc -ne 0 ]; then notify "enrichment failed"; fi
  if [ -n "${DISCOVER_PID:-}" ]; then wait $DISCOVER_PID || notify "discovery failed"; fi
  echo "=== $(date) publish"
  "$NODE" --experimental-strip-types $S/publish.ts || { echo "PUBLISH FAILED"; notify "publishing failed"; exit 1; }
  echo "=== $(date) done"
} >> "$LOG" 2>&1

find data/logs -name 'shopify-stores-*.log' -mtime +14 -delete
