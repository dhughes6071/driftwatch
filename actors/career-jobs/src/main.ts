/**
 * Apify Actor entry point -- "Career Site Jobs API".
 *
 * Searches a daily index of every open role on 19,000+ companies' own career
 * sites (Workday, Oracle, SmartRecruiters, UKG, Greenhouse and 10 more) and
 * returns the matches in seconds. The index is built by crawler/ on the owner's machine and read
 * here through signed, read-only links -- see src/format.ts for the layout.
 *
 * MONETIZATION: pay-per-event, one `job` event per job delivered. Filters run
 * before charging, and a caller's charging limit stops the run cleanly.
 */
import { Actor, log } from "apify";
import type { IndexJob, Manifest } from "./format.ts";
import { descriptionsFor, httpFetcher, search, type Query } from "./search.ts";
import { MONITOR_STORE, monitorKey, type MonitorState } from "./monitor.ts";

interface Input extends Partial<Query> {
  includeDescription?: boolean;
  /** Return only jobs the index has added since this search last ran. */
  onlyNewSinceLastRun?: boolean;
  /** Optional label, so two searches with the same filters keep separate histories. */
  monitorName?: string;
}


const EVENT_JOB = "job";

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? {};
  const q: Query = {
    titleKeywords: input.titleKeywords ?? [],
    titleExcludeKeywords: input.titleExcludeKeywords ?? [],
    locationKeywords: input.locationKeywords ?? [],
    companyKeywords: input.companyKeywords ?? [],
    sources: input.sources ?? [],
    remoteOnly: input.remoteOnly ?? false,
    postedWithinDays: input.postedWithinDays,
    onlyWithSalary: input.onlyWithSalary ?? false,
    minAnnualSalary: input.minAnnualSalary,
    salaryCurrencies: input.salaryCurrencies ?? [],
    maxJobs: input.maxJobs ?? 1000,
    maxJobsPerCompany: input.maxJobsPerCompany,
  };
  const includeDescription = input.includeDescription ?? true;

  // Signed read-only link to the index, injected as an encrypted Actor secret
  // (never in source: this repository is public, and the link unlocks the index).
  const manifestUrl = process.env.CAREER_MANIFEST_URL;
  if (!manifestUrl) throw new Error("CAREER_MANIFEST_URL is not configured.");
  const manifest = JSON.parse(new TextDecoder().decode(await httpFetcher(manifestUrl))) as Manifest;
  const ageHours = (Date.now() - Date.parse(manifest.indexedAt)) / 3_600_000;
  log.info(
    `Index: ${manifest.totalJobs.toLocaleString()} jobs from ${manifest.companies.toLocaleString()} companies, ` +
      `built ${ageHours.toFixed(1)} h ago`,
  );
  if (ageHours > 72) log.warning("The index is more than 3 days old; results may include roles that have since closed.");

  // New since last run: filter to jobs first seen after the index this search last read.
  const monitor = input.onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const key = monitor ? monitorKey(q, input.monitorName) : null;
  const prev = monitor && key ? await monitor.getValue<MonitorState>(key) : null;
  if (monitor) {
    if (!prev) log.info(`First run of this search (${key}): returning all current matches and remembering where it left off.`);
    else if (prev.seenThrough >= manifest.indexedAt) log.info(`No new index since this search last ran (${prev.lastRunAt}); nothing new to return.`);
    else log.info(`Returning only jobs added since this search last ran (index of ${prev.seenThrough}).`);
    if (prev) q.seenAfter = prev.seenThrough;
  }

  const { jobs, shardsRead } = await search(manifest, q);
  log.info(`${jobs.length} matching jobs (read ${shardsRead} of ${manifest.shards.length} index shards)`);

  const descriptions = includeDescription && jobs.length ? await descriptionsFor(manifest, jobs) : new Map<string, string>();

  let pushed = 0;
  let budgetReached = false;
  for (const j of jobs) {
    const charge = await Actor.pushData(toRecord(j, manifest.indexedAt, includeDescription ? (descriptions.get(j.id) ?? "") : undefined), EVENT_JOB);
    pushed++;
    if (charge?.eventChargeLimitReached) {
      budgetReached = true;
      log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
      break;
    }
  }

  const stoppedBecause = budgetReached ? "charging_limit" : pushed >= q.maxJobs ? "maxJobs" : "completed";
  if (monitor && key) {
    // Jobs past a limit are not delivered now and will not count as new next time.
    if (stoppedBecause !== "completed") {
      log.warning(`Stopped at ${stoppedBecause}; any further new jobs from this index are skipped. Raise maxJobs to receive them all.`);
    }
    await monitor.setValue(key, { seenThrough: prev && prev.seenThrough > manifest.indexedAt ? prev.seenThrough : manifest.indexedAt, lastRunAt: new Date().toISOString(), runs: (prev?.runs ?? 0) + 1 } satisfies MonitorState);
  }

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    stoppedBecause,
    ...(monitor ? { newSinceLastRun: { monitorKey: key, since: prev?.seenThrough ?? null, firstRun: !prev } } : {}),
    indexedAt: manifest.indexedAt,
    indexSize: { jobs: manifest.totalJobs, companies: manifest.companies, bySource: manifest.bySource },
    query: q,
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} jobs delivered.`);
  await Actor.exit();
} catch (err) {
  // Actor.fail marks the run FAILED with the reason; exiting normally here
  // used to report crashed runs as SUCCEEDED (found 3 Oct 2026).
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}

/** Public record: the index row minus internals, plus freshness. */
function toRecord(j: IndexJob, indexedAt: string, description: string | undefined) {
  const { d: _d, ...rest } = j;
  return { ...rest, ...(description !== undefined ? { description } : {}), indexedAt };
}
