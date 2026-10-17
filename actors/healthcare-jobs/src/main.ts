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
import { Actor, log } from "apify";
import type { ClinicalTags } from "./clinical.ts";
import type { IndexJob, Manifest } from "./format.ts";
import { makeHealthMatcher, toRecord, type HealthJob, type HealthQuery } from "./healthcare.ts";
import { HEALTH_SYSTEMS } from "./health.ts";
import { descriptionsFor, httpFetcher, unzipText } from "./search.ts";

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

try {
  const input = (await Actor.getInput<Input>()) ?? {};
  const q: HealthQuery = {
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
  const includeDescription = input.includeDescription ?? false;

  // Signed read-only link to the index, injected as an encrypted Actor secret
  // (never in source: this repository is public, and the link unlocks the index).
  const manifestUrl = process.env.CAREER_MANIFEST_URL;
  if (!manifestUrl) throw new Error("CAREER_MANIFEST_URL is not configured.");
  const manifest = JSON.parse(new TextDecoder().decode(await httpFetcher(manifestUrl))) as Manifest;
  const ageHours = (Date.now() - Date.parse(manifest.indexedAt)) / 3_600_000;
  const mapped = HEALTH_SYSTEMS.filter((s) => s.sources.length).length;
  log.info(`Index built ${ageHours.toFixed(1)} h ago; ${mapped} US health systems covered.`);
  if (ageHours > 72) log.warning("The index is more than 3 days old; results may include roles that have since closed.");

  // Clinical tags computed at publish, with the full description.
  let tags: Record<string, ClinicalTags> = {};
  if (manifest.health) tags = JSON.parse(unzipText(await httpFetcher(manifest.health.url)));
  else log.warning("This index has no clinical-tags file yet; tags come from job titles only (no bonus amounts or licenses).");

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
  const match = makeHealthMatcher(q, (j) => tags[j.id]);
  const cutoff = q.postedWithinDays ? new Date(Date.now() - q.postedWithinDays * 86_400_000).toISOString() : null;
  const perSystem = new Map<string, number>();
  const found: HealthJob[] = [];
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
      const h = match(JSON.parse(line) as IndexJob);
      if (!h) continue;
      if (q.maxJobsPerSystem) {
        const c = perSystem.get(h.system.id) ?? 0;
        if (c >= q.maxJobsPerSystem) continue;
        perSystem.set(h.system.id, c + 1);
      }
      found.push(h);
      if (found.length >= q.maxJobs) break;
    }
  }
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
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}

/** One memory per search: the filters (not the caps) plus an optional label. */
function monitorKey(q: HealthQuery, name: string | undefined): string {
  const { maxJobs: _m, maxJobsPerSystem: _c, seenAfter: _s, ...filters } = q;
  const canon = JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}
