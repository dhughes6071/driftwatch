/**
 * Per-source drop check: did any source return far fewer roles than usual?
 *
 *   node --experimental-strip-types actors/career-jobs/crawler/source-drops.ts
 *
 * Prints one line per source that fell below half of its usual count and
 * exits 1, or prints nothing and exits 0. run-daily.sh runs it after the
 * crawl and check-index.sh at 09:00; both turn its output into an alert.
 *
 * Why: on 17 Oct 2026 Workday answered with HTTP 500 and the crawl got 44k of
 * its usual ~780k roles. Nothing alerted -- the index was fresh and, because
 * failed companies keep their roles, its total size barely moved.
 *
 * "Usual" is the median of the previous few full runs, not just the last one,
 * so one bad night does not become the yardstick for the next. Runs made with
 * CRAWL_ONLY (catch-up runs for one source) or CRAWL_LIMIT (trials) are
 * skipped, both as the run checked and as history -- except that a catch-up
 * run which got the dropped source back to normal clears its alert.
 */
import Database from "better-sqlite3";
import { DB_PATH } from "./crawl.ts";

/** Alert when a source has under this share of its usual count. */
export const DROP_SHARE = 0.5;
/** Sources usually this small are too noisy to alert on. */
export const MIN_USUAL = 500;
/** How many earlier full runs make up "usual". */
export const HISTORY_RUNS = 7;

export interface RunStats {
  workdayJobs?: number;
  oracleJobs?: number;
  srJobs?: number;
  atsJobs?: number;
  small?: Record<string, { jobs?: number }>;
  /** Set by crawl.ts since 17 Oct 2026: the CRAWL_ONLY systems, or null for a full run. */
  only?: string[] | null;
  /** Set by crawl.ts since 17 Oct 2026: CRAWL_LIMIT, or null. */
  limit?: number | null;
}

export interface Drop {
  source: string;
  jobs: number;
  usual: number;
}

/** A full nightly run? Catch-up (CRAWL_ONLY) and trial (CRAWL_LIMIT) runs are not. */
export function isFullRun(s: RunStats): boolean {
  if (s.only?.length || s.limit != null) return false;
  // Runs from before crawl.ts recorded `only`: a catch-up run crawled no small-company systems.
  if (!("only" in s)) return Object.keys(s.small ?? {}).length > 0;
  return true;
}

/** Job count per source: "workday", "oracle", "smartrecruiters", "ats" (Greenhouse/Ashby/Lever), and each small system. */
export function sourceCounts(s: RunStats): Record<string, number> {
  const out: Record<string, number> = {
    workday: s.workdayJobs ?? 0,
    oracle: s.oracleJobs ?? 0,
    smartrecruiters: s.srJobs ?? 0,
    ats: s.atsJobs ?? 0,
  };
  for (const [src, v] of Object.entries(s.small ?? {})) out[src] = v.jobs ?? 0;
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Sources in `latest` below DROP_SHARE of their usual count, where usual is
 * the median over `previous` (earlier full runs, newest first). A source
 * missing from `latest` counts as 0; one with no history is not judged.
 */
export function findDrops(latest: RunStats, previous: RunStats[]): Drop[] {
  const now = sourceCounts(latest);
  const history = previous.slice(0, HISTORY_RUNS).map(sourceCounts);
  const sources = new Set([...Object.keys(now), ...history.flatMap((h) => Object.keys(h))]);
  const drops: Drop[] = [];
  for (const source of sources) {
    const past = history.filter((h) => source in h).map((h) => h[source]);
    if (!past.length) continue;
    const usual = median(past);
    const jobs = now[source] ?? 0;
    if (usual >= MIN_USUAL && jobs < usual * DROP_SHARE) drops.push({ source, jobs, usual: Math.round(usual) });
  }
  return drops.sort((a, b) => b.usual - a.usual);
}

/**
 * Drops not yet made good by a catch-up run: a CRAWL_ONLY run after the
 * latest full run that got that source back to at least DROP_SHARE of usual
 * (17 Oct 2026: the 07:00 Workday-only run got 778,650).
 */
export function notRecovered(drops: Drop[], catchUps: RunStats[]): Drop[] {
  return drops.filter(
    (d) => !catchUps.some((r) => r.limit == null && (sourceCounts(r)[d.source] ?? 0) >= d.usual * DROP_SHARE),
  );
}

/** The latest finished full run, the full runs before it (newest first), and the catch-up runs after it. */
export function readRuns(db: Database.Database): { latest: RunStats | null; previous: RunStats[]; catchUps: RunStats[] } {
  const rows = db
    .prepare("SELECT stats FROM runs WHERE finished_at IS NOT NULL AND stats IS NOT NULL ORDER BY started_at DESC LIMIT 60")
    .all() as Array<{ stats: string }>;
  const runs = rows.map((r) => JSON.parse(r.stats) as RunStats);
  const i = runs.findIndex(isFullRun);
  if (i < 0) return { latest: null, previous: [], catchUps: [] };
  return { latest: runs[i], previous: runs.slice(i + 1).filter(isFullRun), catchUps: runs.slice(0, i) };
}

export const describe = (d: Drop) =>
  `${d.source} returned ${d.jobs.toLocaleString("en-US")} roles, under half its usual ${d.usual.toLocaleString("en-US")}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const { latest, previous, catchUps } = readRuns(db);
  db.close();
  const drops = latest ? notRecovered(findDrops(latest, previous), catchUps) : [];
  for (const d of drops) console.log(describe(d));
  process.exit(drops.length ? 1 : 0);
}
