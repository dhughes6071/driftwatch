#!/bin/zsh
# Morning health check for the Career Site Jobs API index (run by launchd at 09:00,
# see com.x402.career-jobs-check.plist; safe to run by hand).
#
# Alerts with a macOS notification, and a line in data/logs/alerts.log, when:
#   - the published index is more than MAX_AGE_HOURS old (the nightly run didn't publish),
#   - last night's log says CRAWL FAILED or PUBLISH FAILED,
#   - a run has held the lock for more than 8 hours (stuck).
# The index URL is read from the gitignored data/career-manifest-url.txt; never print it.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
mkdir -p data/logs
MAX_AGE_HOURS=${MAX_AGE_HOURS:-30}
problems=()

# 1. How old is the index users are actually searching?
if [[ -s data/career-manifest-url.txt ]]; then
  age=$(curl -s -m 60 "$(cat data/career-manifest-url.txt)" | python3 -c '
import json, sys, datetime as d
try:
    m = json.load(sys.stdin)
    t = d.datetime.fromisoformat(m["indexedAt"].replace("Z", "+00:00"))
    print(int((d.datetime.now(d.timezone.utc) - t).total_seconds() // 3600), m["totalJobs"])
except Exception:
    print("unreadable")
')
  if [[ "$age" == unreadable || -z "$age" ]]; then
    problems+=("the published index could not be read")
  elif (( ${age%% *} > MAX_AGE_HOURS )); then
    problems+=("the index is ${age%% *} hours old (last good publish: ${age##* } jobs)")
  fi
else
  problems+=("data/career-manifest-url.txt is missing")
fi

# 2. Did last night's run fail?
LOG="data/logs/career-jobs-$(date +%Y-%m-%d).log"
if [[ -f "$LOG" ]] && grep -qE "CRAWL FAILED|PUBLISH FAILED" "$LOG"; then
  problems+=("last night's run failed (see $LOG)")
elif [[ ! -f "$LOG" ]]; then
  problems+=("no run log for today: the 03:30 run did not start (Mac asleep or off?)")
fi

# 3. Stuck run?
if [[ -d data/career-jobs.lock ]] && [[ -n "$(find data/career-jobs.lock -maxdepth 0 -mmin +480)" ]]; then
  problems+=("a run has been holding the lock for over 8 hours")
fi

if (( ${#problems} )); then
  msg="${(j:; :)problems}"
  echo "$(date '+%Y-%m-%d %H:%M') ALERT: $msg" >> data/logs/alerts.log
  osascript -e "display notification \"${msg//\"/\'}\" with title \"Career Jobs index needs attention\" sound name \"Basso\"" 2>/dev/null
  echo "ALERT: $msg"
  exit 1
fi
echo "$(date '+%Y-%m-%d %H:%M') ok (index ${age%% *} h old, ${age##* } jobs)" >> data/logs/alerts.log
echo "ok: index ${age%% *} h old, ${age##* } jobs"
