/**
 * Apify Actor entry point -- "Companies Hiring For Any Role".
 *
 * Reads the same daily index as our Career Site Jobs API (1.7M+ open roles on
 * 19,000+ companies' own career sites) and rolls it up into one record per
 * company: how many roles match the search, how many are new, how big the
 * company's hiring is overall, where and in which departments. Built for
 * sales and recruiting teams who want accounts, not job ads.
 *
 * MONETIZATION: pay-per-event, one `company` event per company delivered.
 * Filters run before charging, and a caller's charging limit stops the run
 * cleanly.
 */
import { Actor, log } from "apify";
import type { IndexJob, Manifest } from "./format.ts";
import { httpFetcher, makeMatcher, unzipText, type Query } from "./search.ts";
import { CompanyRollup, type SortBy } from "./companies.ts";
import { MONITOR_STORE, monitorKey, type MonitorState } from "./monitor.ts";

interface Input {
  titleKeywords?: string[];
  titleExcludeKeywords?: string[];
  locationKeywords?: string[];
  companyKeywords?: string[];
  sources?: string[];
  remoteOnly?: boolean;
  postedWithinDays?: number;
  onlyWithSalary?: boolean;
  minAnnualSalary?: number;
  salaryCurrencies?: string[];
  minMatchingJobs?: number;
  minTotalOpenJobs?: number;
  maxTotalOpenJobs?: number;
  sortBy?: SortBy;
  /** Leave out roles posted more than this many days ago (default 365; 0 keeps everything). */
  maxRoleAgeDays?: number;
  maxCompanies?: number;
  onlyNewSinceLastRun?: boolean;
  monitorName?: string;
}

/** Charged once per company delivered. Must match the event configured in Apify. */
const EVENT = "company";
const PUSH_BATCH = 100;

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
    maxJobs: Infinity,
  };
  const maxCompanies = input.maxCompanies ?? 200;
  const companyFilters = {
    minMatchingJobs: input.minMatchingJobs ?? 1,
    minTotalOpenJobs: input.minTotalOpenJobs,
    maxTotalOpenJobs: input.maxTotalOpenJobs,
    sortBy: input.sortBy ?? "matchingJobs",
    maxRoleAgeDays: input.maxRoleAgeDays ?? 365,
  };
  if (!q.titleKeywords!.length && !q.companyKeywords!.length && !q.locationKeywords!.length) {
    log.warning("No title, company or location keywords: every company in the index matches. Add `titleKeywords` (e.g. \"salesforce\") to find companies hiring for a role.");
  }

  // Signed read-only link to the index, injected as an encrypted Actor secret
  // (never in source: this repository is public, and the link unlocks the index).
  const manifestUrl = process.env.CAREER_MANIFEST_URL;
  if (!manifestUrl) throw new Error("CAREER_MANIFEST_URL is not configured.");
  const manifest = JSON.parse(new TextDecoder().decode(await httpFetcher(manifestUrl))) as Manifest;
  const ageHours = (Date.now() - Date.parse(manifest.indexedAt)) / 3_600_000;
  log.info(
    `Index: ${manifest.totalJobs.toLocaleString()} jobs from ${manifest.companies.toLocaleString()} companies, built ${ageHours.toFixed(1)} h ago`,
  );
  if (ageHours > 72) log.warning("The index is more than 3 days old; counts may include roles that have since closed.");

  // New since last run: only companies with a matching role the index added after this search last ran.
  const monitor = input.onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const { maxJobs: _m, ...jobFilters } = q;
  const mKey = monitor ? monitorKey({ ...jobFilters, ...companyFilters }, input.monitorName) : null;
  const prev = monitor && mKey ? await monitor.getValue<MonitorState>(mKey) : null;
  if (monitor) {
    if (!prev) log.info(`First run of this search (${mKey}): returning all matching companies and remembering where it left off.`);
    else if (prev.seenThrough >= manifest.indexedAt) log.info(`No new index since this search last ran (${prev.lastRunAt}); nothing new to return.`);
    else log.info(`Returning only companies with matching roles added since this search last ran (index of ${prev.seenThrough}).`);
  }
  const seenAfter = prev?.seenThrough;

  // Read every shard: company totals and hiring pace need the whole index, not just the matches.
  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const deadline = timeoutAt - Math.min(45_000, Math.max(8_000, (timeoutAt - Date.now()) * 0.25));
  const rollup = new CompanyRollup(makeMatcher(q), seenAfter, Date.now(), companyFilters.maxRoleAgeDays || null);
  let shardsRead = 0;
  let timeLimited = false;
  for (const shard of manifest.shards) {
    if (Date.now() > deadline) {
      timeLimited = true;
      break;
    }
    const text = unzipText(await httpFetcher(shard.url));
    shardsRead++;
    for (const line of text.split("\n")) if (line) rollup.add(JSON.parse(line) as IndexJob);
  }
  if (timeLimited) {
    log.warning(`Stopped reading early to finish inside this run's time limit (${shardsRead} of ${manifest.shards.length} index shards): counts are incomplete. Give the run a longer timeout.`);
  }
  const { companies, totalMatchingCompanies } = rollup.results({ ...companyFilters, maxCompanies, seenAfter });
  log.info(`${rollup.jobsMatched.toLocaleString()} matching roles at ${totalMatchingCompanies.toLocaleString()} companies; delivering ${companies.length}.`);

  let pushed = 0;
  let budgetReached = false;
  for (let i = 0; i < companies.length && !budgetReached; i += PUSH_BATCH) {
    const batch = companies.slice(i, i + PUSH_BATCH).map((c) => ({ ...c, indexedAt: manifest.indexedAt }));
    const charge = await Actor.pushData(batch, EVENT);
    // At the limit the SDK keeps only the items it could charge for.
    pushed += charge?.eventChargeLimitReached ? (charge.chargedCount ?? batch.length) : batch.length;
    if (charge?.eventChargeLimitReached) {
      budgetReached = true;
      log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
    }
  }

  const stoppedBecause = budgetReached ? "charging_limit" : timeLimited ? "time_limit" : pushed < totalMatchingCompanies ? "maxCompanies" : "completed";
  if (monitor && mKey && !timeLimited) {
    if (stoppedBecause !== "completed") {
      log.warning(`Stopped at ${stoppedBecause}; companies past the limit are skipped this time and only return if they post new matching roles. Raise maxCompanies to receive them all.`);
    }
    await monitor.setValue(mKey, {
      seenThrough: prev && prev.seenThrough > manifest.indexedAt ? prev.seenThrough : manifest.indexedAt,
      lastRunAt: new Date().toISOString(),
      runs: (prev?.runs ?? 0) + 1,
    } satisfies MonitorState);
  }

  await Actor.setValue("SUMMARY", {
    companiesReturned: pushed,
    companiesMatching: totalMatchingCompanies,
    matchingJobs: rollup.jobsMatched,
    jobsScanned: rollup.jobsRead,
    staleJobsIgnored: rollup.jobsStale,
    stoppedBecause,
    ...(monitor ? { newSinceLastRun: { monitorKey: mKey, since: seenAfter ?? null, firstRun: !prev } } : {}),
    indexedAt: manifest.indexedAt,
    indexSize: { jobs: manifest.totalJobs, companies: manifest.companies, bySource: manifest.bySource },
    filters: { ...jobFilters, ...companyFilters, maxCompanies },
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} companies delivered.`);
  await Actor.exit(timeLimited ? `Stopped early to stay inside the run's time limit: ${pushed} companies delivered from partial counts. Use a longer timeout.` : undefined);
} catch (err) {
  // Actor.fail marks the run FAILED with the reason, instead of a misleading SUCCEEDED.
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}
