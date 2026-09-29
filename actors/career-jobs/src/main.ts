/**
 * Apify Actor entry point -- "Career Site Jobs API".
 *
 * Searches a daily index of every open role on 5,000+ companies' own career
 * sites (Workday, Greenhouse, Ashby, Lever) and returns the matches in
 * seconds. The index is built by crawler/ on the owner's machine and read
 * here through signed, read-only links -- see src/format.ts for the layout.
 *
 * MONETIZATION: pay-per-event, one `job` event per job delivered. Filters run
 * before charging, and a caller's charging limit stops the run cleanly.
 */
import { Actor, log } from "apify";
import type { IndexJob, Manifest } from "./format.ts";
import { descriptionsFor, httpFetcher, search, type Query } from "./search.ts";

interface Input extends Partial<Query> {
  includeDescription?: boolean;
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

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    stoppedBecause: budgetReached ? "charging_limit" : pushed >= q.maxJobs ? "maxJobs" : "completed",
    indexedAt: manifest.indexedAt,
    indexSize: { jobs: manifest.totalJobs, companies: manifest.companies, bySource: manifest.bySource },
    query: q,
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} jobs delivered.`);
} catch (err) {
  log.error(`Actor failed: ${err instanceof Error ? err.message : String(err)}`);
  throw err;
} finally {
  await Actor.exit();
}

/** Public record: the index row minus internals, plus freshness. */
function toRecord(j: IndexJob, indexedAt: string, description: string | undefined) {
  const { d: _d, ...rest } = j;
  return { ...rest, ...(description !== undefined ? { description } : {}), indexedAt };
}
