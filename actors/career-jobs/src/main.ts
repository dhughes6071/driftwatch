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
import { readFile } from "node:fs/promises";
import { BadRequest, fieldEnums, fieldKinds, serveStandby } from "./standby.ts";
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

if (Actor.config.get("metaOrigin") === "STANDBY") {
  await startStandby();
} else {
  try {
    await batchRun((await Actor.getInput<Input>()) ?? {});
  } catch (err) {
    // Actor.fail marks the run FAILED with the reason; exiting normally here
    // used to report crashed runs as SUCCEEDED (found 3 Oct 2026).
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Actor failed: ${msg}`);
    await Actor.fail(msg);
  }
}

function toQuery(input: Input): Query {
  return {
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
}

async function loadManifest(): Promise<Manifest> {
  // Signed read-only link to the index, injected as an encrypted Actor secret
  // (never in source: this repository is public, and the link unlocks the index).
  const manifestUrl = process.env.CAREER_MANIFEST_URL;
  if (!manifestUrl) throw new Error("CAREER_MANIFEST_URL is not configured.");
  return JSON.parse(new TextDecoder().decode(await httpFetcher(manifestUrl))) as Manifest;
}

async function batchRun(input: Input) {
  const q = toQuery(input);
  const includeDescription = input.includeDescription ?? true;

  const manifest = await loadManifest();
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

  // Finish inside the run's own time limit (a caller's short timeout used to end in TIMED-OUT).
  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const margin = Math.min(45_000, Math.max(8_000, (timeoutAt - Date.now()) * 0.25));
  const { jobs, shardsRead, timeLimited } = await search(manifest, q, httpFetcher, Date.now(), timeoutAt - margin);
  if (timeLimited) {
    log.warning(`Stopped early to finish inside this run's time limit (read ${shardsRead} of ${manifest.shards.length} index shards). Give the run a longer timeout for complete results.`);
  }
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

  const stoppedBecause = budgetReached ? "charging_limit" : pushed >= q.maxJobs ? "maxJobs" : timeLimited ? "time_limit" : "completed";
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
  await Actor.exit(timeLimited ? `Stopped early to stay inside the run's time limit: ${pushed} jobs delivered. Use a longer timeout for complete results.` : undefined);
}

/**
 * Standby mode (src/standby.ts): each HTTP request is one search, answered as
 * JSON. Same filters and price as a run; a request is charged for the jobs it
 * returns, and a caller's charging limit trims the answer.
 */
async function startStandby() {
  const schema = JSON.parse(await readFile(new URL("../.actor/input_schema.json", import.meta.url), "utf8"));
  const kinds = fieldKinds(schema.properties);
  let cached: { manifest: Manifest; at: number } | null = null;
  const manifest = async () => {
    // The index is rebuilt once a night; re-read its manifest at most every 15 minutes.
    if (!cached || Date.now() - cached.at > 15 * 60_000) cached = { manifest: await loadManifest(), at: Date.now() };
    return cached.manifest;
  };
  await manifest(); // fail fast if the index link is broken

  serveStandby(Actor.config.get("containerPort"), kinds, fieldEnums(schema.properties), async (raw) => {
    const input = raw as Input;
    if (input.onlyNewSinceLastRun) throw new BadRequest("onlyNewSinceLastRun needs a normal (scheduled) run; Standby requests do not keep a history.");
    const q = toQuery(input);
    if (!(q.maxJobs >= 1)) throw new BadRequest("maxJobs must be at least 1");
    q.maxJobs = Math.min(q.maxJobs, 5000); // one HTTP answer; larger pulls belong in a run
    const includeDescription = input.includeDescription ?? false; // descriptions make answers ~20x larger
    const m = await manifest();
    const { jobs, shardsRead, timeLimited } = await search(m, q, httpFetcher, Date.now(), Date.now() + 120_000);
    const charged = jobs.length ? await Actor.charge({ eventName: EVENT_JOB, count: jobs.length }) : null;
    const n = charged ? Math.min(jobs.length, charged.chargedCount) : 0;
    const delivered = jobs.slice(0, n);
    const descriptions = includeDescription && n ? await descriptionsFor(m, delivered) : new Map<string, string>();
    log.info(`Standby request: ${n} jobs returned (read ${shardsRead} of ${m.shards.length} shards)`);
    return {
      count: n,
      stoppedBecause: charged?.eventChargeLimitReached && n < jobs.length ? "charging_limit" : n >= q.maxJobs ? "maxJobs" : timeLimited ? "time_limit" : "completed",
      indexedAt: m.indexedAt,
      jobs: delivered.map((j) => toRecord(j, m.indexedAt, includeDescription ? (descriptions.get(j.id) ?? "") : undefined)),
    };
  }, (msg) => log.error(msg));
  log.info(`Standby: listening on port ${Actor.config.get("containerPort")}`);
}
/** Public record: the index row minus internals, plus freshness. */
function toRecord(j: IndexJob, indexedAt: string, description: string | undefined) {
  const { d: _d, ...rest } = j;
  return { ...rest, ...(description !== undefined ? { description } : {}), indexedAt };
}
