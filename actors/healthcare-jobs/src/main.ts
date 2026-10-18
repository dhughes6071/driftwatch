/**
 * Apify Actor entry point -- "US Hospital & Health System Jobs".
 *
 * Reads the same daily index as our Career Site Jobs API, keeps the jobs of
 * the largest US health systems (src/health.ts, matched to AHRQ's Compendium
 * of U.S. Health Systems), and adds clinical tags (src/clinical.ts): role,
 * specialty, shift, per diem / travel, sign-on bonus and licenses.
 *
 * MONETIZATION: pay-per-event, one `job` event per job delivered. Filters run
 * before charging, and a caller's charging limit stops the run cleanly.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Actor, log } from "apify";
import type { ClinicalTags } from "./clinical.ts";
import type { IndexJob, Manifest } from "./format.ts";
import { makeHealthMatcher, toRecord, type HealthJob, type HealthQuery } from "./healthcare.ts";
import { HEALTH_SYSTEMS, healthSystemFor } from "./health.ts";
import { descriptionsFor, httpFetcher, unzipText } from "./search.ts";
import { BadRequest, fieldEnums, fieldKinds, serveStandby } from "./standby.ts";

interface Input extends Partial<HealthQuery> {
  includeDescription?: boolean;
  onlyNewSinceLastRun?: boolean;
  monitorName?: string;
}

interface MonitorState {
  seenThrough: string;
  lastRunAt: string;
  runs: number;
}

const EVENT_JOB = "job";
const MONITOR_STORE = "healthcare-jobs-monitor";

await Actor.init();

if (Actor.config.get("metaOrigin") === "STANDBY") {
  await startStandby();
} else {
  try {
    await batchRun((await Actor.getInput<Input>()) ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Actor failed: ${msg}`);
    await Actor.fail(msg);
  }
}

function toQuery(input: Input): HealthQuery {
  return {
    titleKeywords: input.titleKeywords ?? [],
    titleExcludeKeywords: input.titleExcludeKeywords ?? [],
    locationKeywords: input.locationKeywords ?? [],
    postedWithinDays: input.postedWithinDays,
    onlyWithSalary: input.onlyWithSalary ?? false,
    healthSystems: input.healthSystems ?? [],
    systemStates: input.systemStates ?? [],
    roleFamilies: input.roleFamilies ?? [],
    specialties: input.specialties ?? [],
    employment: input.employment ?? [],
    shifts: input.shifts ?? [],
    onlySignOnBonus: input.onlySignOnBonus ?? false,
    minSignOnBonus: input.minSignOnBonus,
    minHourlyRate: input.minHourlyRate,
    minSystemBeds: input.minSystemBeds,
    maxJobs: input.maxJobs ?? 1000,
    maxJobsPerSystem: input.maxJobsPerSystem,
  };
}

async function loadIndex(): Promise<{ manifest: Manifest; tags: Record<string, ClinicalTags> }> {
  // Signed read-only link to the index, injected as an encrypted Actor secret
  // (never in source: this repository is public, and the link unlocks the index).
  const manifestUrl = process.env.CAREER_MANIFEST_URL;
  if (!manifestUrl) throw new Error("CAREER_MANIFEST_URL is not configured.");
  const manifest = JSON.parse(new TextDecoder().decode(await httpFetcher(manifestUrl))) as Manifest;
  // Clinical tags computed at publish, with the full description.
  let tags: Record<string, ClinicalTags> = {};
  if (manifest.health) tags = JSON.parse(unzipText(await httpFetcher(manifest.health.url)));
  else log.warning("This index has no clinical-tags file yet; tags come from job titles only (no bonus amounts or licenses).");
  return { manifest, tags };
}

/**
 * Keep the matching health-system jobs, stopping at maxJobs or the deadline. Reads the index
 * shards, or `preloaded` (Standby keeps every health-system job in memory between requests).
 */
async function findJobs(q: HealthQuery, manifest: Manifest, tags: Record<string, ClinicalTags>, deadline: number, preloaded?: IndexJob[]) {
  const match = makeHealthMatcher(q, (j) => tags[j.id]);
  const cutoff = q.postedWithinDays ? new Date(Date.now() - q.postedWithinDays * 86_400_000).toISOString() : null;
  const perSystem = new Map<string, number>();
  const found: HealthJob[] = [];
  const take = (j: IndexJob) => {
    const h = match(j);
    if (!h) return;
    if (q.maxJobsPerSystem) {
      const c = perSystem.get(h.system.id) ?? 0;
      if (c >= q.maxJobsPerSystem) return;
      perSystem.set(h.system.id, c + 1);
    }
    found.push(h);
  };
  if (preloaded) {
    for (const j of preloaded) {
      if (found.length >= q.maxJobs) break;
      take(j);
    }
    return { found, shardsRead: 0, timeLimited: false };
  }
  let shardsRead = 0;
  let timeLimited = false;
  for (const shard of manifest.shards) {
    if (found.length >= q.maxJobs) break;
    if (Date.now() > deadline) {
      timeLimited = true;
      break;
    }
    if (cutoff && shard.undated === 0 && shard.newest && shard.newest < cutoff) continue;
    if (q.seenAfter && shard.newestFirstSeen && shard.newestFirstSeen <= q.seenAfter) continue;
    const text = unzipText(await httpFetcher(shard.url));
    shardsRead++;
    for (const line of text.split("\n")) {
      if (!line) continue;
      take(JSON.parse(line) as IndexJob);
      if (found.length >= q.maxJobs) break;
    }
  }
  return { found, shardsRead, timeLimited };
}

/** Every health-system job in the index (about 1 in 15), for Standby to search in memory. */
async function preloadHealthJobs(manifest: Manifest): Promise<IndexJob[]> {
  // Downloads dominate (~3 s a shard), so fetch 8 at a time; rows of other employers are skipped before parsing.
  const head = /^\{"id":"[^"]*","ats":"([^"]*)","company":"([^"]*)"/;
  const perShard: IndexJob[][] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < manifest.shards.length) {
      const i = next++;
      const out: IndexJob[] = [];
      for (const line of unzipText(await httpFetcher(manifest.shards[i].url)).split("\n")) {
        if (!line) continue;
        const k = head.exec(line);
        if (k && !healthSystemFor(k[1], k[2])) continue;
        const j = JSON.parse(line) as IndexJob;
        if (healthSystemFor(j.ats, j.company)) out.push(j);
      }
      perShard[i] = out;
    }
  }));
  return perShard.flat(); // shard order, as a run reads them
}

async function batchRun(input: Input) {
  const q = toQuery(input);
  const includeDescription = input.includeDescription ?? false;
  const { manifest, tags } = await loadIndex();
  const ageHours = (Date.now() - Date.parse(manifest.indexedAt)) / 3_600_000;
  const mapped = HEALTH_SYSTEMS.filter((s) => s.sources.length).length;
  log.info(`Index built ${ageHours.toFixed(1)} h ago; ${mapped} US health systems covered.`);
  if (ageHours > 72) log.warning("The index is more than 3 days old; results may include roles that have since closed.");

  const monitor = input.onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const key = monitor ? monitorKey(q, input.monitorName) : null;
  const prev = monitor && key ? await monitor.getValue<MonitorState>(key) : null;
  if (monitor) {
    if (!prev) log.info(`First run of this search (${key}): returning all current matches and remembering where it left off.`);
    else if (prev.seenThrough >= manifest.indexedAt) log.info(`No new index since this search last ran (${prev.lastRunAt}); nothing new to return.`);
    else log.info(`Returning only jobs added since this search last ran (index of ${prev.seenThrough}).`);
    if (prev) q.seenAfter = prev.seenThrough;
  }

  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const deadline = timeoutAt - Math.min(45_000, Math.max(8_000, (timeoutAt - Date.now()) * 0.25));
  const { found, shardsRead, timeLimited } = await findJobs(q, manifest, tags, deadline);
  if (timeLimited) log.warning(`Stopped early to finish inside this run's time limit (read ${shardsRead} of ${manifest.shards.length} index shards).`);
  log.info(`${found.length} matching jobs (read ${shardsRead} of ${manifest.shards.length} index shards)`);

  const descriptions = includeDescription && found.length ? await descriptionsFor(manifest, found.map((h) => h.job)) : new Map<string, string>();

  let pushed = 0;
  let budgetReached = false;
  for (let i = 0; i < found.length && !budgetReached; i += 500) {
    const batch = found.slice(i, i + 500).map((h) => toRecord(h, manifest.indexedAt, includeDescription ? (descriptions.get(h.job.id) ?? "") : undefined));
    const charge = await Actor.pushData(batch, EVENT_JOB);
    pushed += charge?.eventChargeLimitReached ? (charge.chargedCount ?? batch.length) : batch.length;
    if (charge?.eventChargeLimitReached) {
      budgetReached = true;
      log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
    }
  }

  const stoppedBecause = budgetReached ? "charging_limit" : pushed >= q.maxJobs ? "maxJobs" : timeLimited ? "time_limit" : "completed";
  if (monitor && key && !timeLimited) {
    if (stoppedBecause !== "completed") log.warning(`Stopped at ${stoppedBecause}; further new jobs from this index are skipped. Raise maxJobs to receive them all.`);
    await monitor.setValue(key, {
      seenThrough: prev && prev.seenThrough > manifest.indexedAt ? prev.seenThrough : manifest.indexedAt,
      lastRunAt: new Date().toISOString(),
      runs: (prev?.runs ?? 0) + 1,
    } satisfies MonitorState);
  }

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    stoppedBecause,
    ...(monitor ? { newSinceLastRun: { monitorKey: key, since: prev?.seenThrough ?? null, firstRun: !prev } } : {}),
    healthSystemsCovered: mapped,
    indexedAt: manifest.indexedAt,
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
  type Index = Awaited<ReturnType<typeof loadIndex>>;
  // Answer at once (the platform gives up on a first request after ~2 minutes): until every health-system job is in
  // memory, requests read the index shards like a run does; then they search memory in milliseconds.
  let base: Promise<Index> = loadIndex();
  let loaded: (Index & { jobs: IndexJob[] }) | null = null;
  const preload = async () => {
    const started = Date.now();
    const idx = await base;
    const jobs = await preloadHealthJobs(idx.manifest);
    loaded = { ...idx, jobs };
    log.info(`Standby: loaded ${jobs.length.toLocaleString()} health-system jobs from the index of ${idx.manifest.indexedAt} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  };
  preload().catch((err) => log.error(`Standby: preload failed, searching the index shards instead: ${err instanceof Error ? err.message : err}`));
  // The index is rebuilt once a night: look for a newer one every 15 minutes and swap it in once loaded.
  setInterval(async () => {
    try {
      const m = JSON.parse(new TextDecoder().decode(await httpFetcher(process.env.CAREER_MANIFEST_URL!))) as Manifest;
      if (loaded && m.indexedAt !== loaded.manifest.indexedAt) {
        const fresh = loadIndex();
        await fresh;
        base = fresh;
        await preload();
      }
    } catch (err) {
      log.warning(`Standby: index refresh failed, keeping the loaded one: ${err instanceof Error ? err.message : err}`);
    }
  }, 15 * 60_000).unref();

  serveStandby(Actor.config.get("containerPort"), kinds, fieldEnums(schema.properties), async (raw) => {
    const input = raw as Input;
    if (input.onlyNewSinceLastRun) throw new BadRequest("onlyNewSinceLastRun needs a normal (scheduled) run; Standby requests do not keep a history.");
    const q = toQuery(input);
    if (!(q.maxJobs >= 1)) throw new BadRequest("maxJobs must be at least 1");
    q.maxJobs = Math.min(q.maxJobs, 5000); // one HTTP answer; larger pulls belong in a run
    const includeDescription = input.includeDescription ?? false;
    const { manifest, tags } = loaded ?? (await base);
    const { found, timeLimited } = await findJobs(q, manifest, tags, Date.now() + 90_000, loaded?.jobs);
    const charged = found.length ? await Actor.charge({ eventName: EVENT_JOB, count: found.length }) : null;
    const n = charged ? Math.min(found.length, charged.chargedCount) : 0;
    const delivered = found.slice(0, n);
    const descriptions = includeDescription && n ? await descriptionsFor(manifest, delivered.map((h) => h.job)) : new Map<string, string>();
    log.info(`Standby request: ${n} jobs returned`);
    return {
      count: n,
      stoppedBecause: charged?.eventChargeLimitReached && n < found.length ? "charging_limit" : n >= q.maxJobs ? "maxJobs" : timeLimited ? "time_limit" : "completed",
      indexedAt: manifest.indexedAt,
      jobs: delivered.map((h) => toRecord(h, manifest.indexedAt, includeDescription ? (descriptions.get(h.job.id) ?? "") : undefined)),
    };
  }, (msg) => log.error(msg));
  log.info(`Standby: listening on port ${Actor.config.get("containerPort")}`);
}

/** One memory per search: the filters (not the caps) plus an optional label. */
function monitorKey(q: HealthQuery, name: string | undefined): string {
  const { maxJobs: _m, maxJobsPerSystem: _c, seenAfter: _s, ...filters } = q;
  const canon = JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}
