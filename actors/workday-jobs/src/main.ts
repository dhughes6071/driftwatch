/**
 * Apify Actor entry point -- "Workday Jobs Scraper".
 *
 * Reads open roles from companies' Workday career sites through the public
 * JSON API the sites themselves run on, normalizes them, and pushes them to
 * the dataset. See workday.ts for the three Workday quirks this handles.
 *
 * MONETIZATION: pay-per-event, one `job` event per job delivered. Filters run
 * BEFORE charging, so filtered-out roles are never billed, and a caller's
 * charging limit stops the run cleanly.
 *
 * COST CONTROL (ours): the list call is cheap (20 jobs per request); the
 * detail call is one request per job. Every filter that can be decided from
 * the list row is applied first, so we only fetch details for jobs we are
 * going to deliver.
 */
import { Actor, log } from "apify";
import {
  WorkdayClient,
  companyName,
  locationMatcher,
  minAgeDays,
  normalize,
  parseCareerSiteUrl,
  type Job,
  type Posting,
  type Site,
} from "./workday.ts";
import { MONITOR_STORE, SeenPostings, monitorKey, postingKey, type MonitorState } from "./monitor.ts";

interface Input {
  /** Workday career-site URLs. Any page on the site works, including a single job. */
  careerSiteUrls?: string[];
  /** Use the built-in registry of verified Workday career sites. */
  useCuratedList?: boolean;
  /** Only registry companies whose name or Workday id contains one of these, e.g. "nvidia", "bank". */
  companyKeywords?: string[];
  /** Workday's own full-text search, run server-side. Fastest way to narrow big employers. */
  searchText?: string;
  titleKeywords?: string[];
  locationKeywords?: string[];
  remoteOnly?: boolean;
  postedWithinDays?: number;
  /** Only roles whose description states pay. */
  onlyWithSalary?: boolean;
  /** Only roles whose annualised top of range reaches this, in the job's own currency. */
  minAnnualSalary?: number;
  /** Only roles paying in these currencies, e.g. ["USD"]. */
  salaryCurrencies?: string[];
  includeDescription?: boolean;
  maxJobs?: number;
  maxJobsPerCompany?: number;
  /** Return only jobs this same search has not delivered before (for scheduled runs). */
  onlyNewSinceLastRun?: boolean;
  /** Optional label, so two searches with the same filters keep separate histories. */
  monitorName?: string;
}

/** Charged once per job delivered. Must match the event configured in Apify. */
const EVENT_JOB = "job";
const DETAIL_CONCURRENCY = 8;

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? {};
  const {
    careerSiteUrls = [],
    useCuratedList = false,
    companyKeywords = [],
    searchText = "",
    titleKeywords = [],
    locationKeywords = [],
    remoteOnly = false,
    postedWithinDays,
    onlyWithSalary = false,
    minAnnualSalary,
    salaryCurrencies = [],
    includeDescription = true,
    maxJobs = 1000,
    maxJobsPerCompany,
    onlyNewSinceLastRun = false,
    monitorName,
  } = input;

  // ---------------------------------------------------------------- targets

  const sites: Site[] = [];
  const bad: string[] = [];
  for (const u of careerSiteUrls) {
    const s = parseCareerSiteUrl(u);
    if (s) sites.push(s);
    else bad.push(u);
  }
  if (bad.length) {
    log.warning(
      `Skipped ${bad.length} URL(s) that are not Workday career sites: ${bad.slice(0, 5).join(", ")}. ` +
        `Expected something like https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`,
    );
  }
  if (useCuratedList) {
    const registry = await loadRegistry();
    const kw = companyKeywords.map((k) => k.toLowerCase());
    // Match the Workday id ("ghr") or the real name ("Bank of America").
    const picked = kw.length
      ? registry.filter((s) => {
          const name = companyName(s.tenant).toLowerCase();
          return kw.some((k) => s.tenant.includes(k) || name.includes(k));
        })
      : registry;
    sites.push(...picked);
    log.info(`Registry: ${picked.length} of ${registry.length} career sites selected`);
  }
  const unique = dedupeSites(sites);
  if (unique.length === 0) {
    throw new Error(
      "No Workday career sites to fetch. Add at least one URL to `careerSiteUrls`, or turn on `useCuratedList`.",
    );
  }
  log.info(`Fetching ${unique.length} Workday career site(s)`);

  // ---------------------------------------------------------------- new since last run

  const monitor = onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const mKey = monitor
    ? monitorKey(
        {
          careerSiteUrls, useCuratedList, companyKeywords, searchText, titleKeywords, locationKeywords, remoteOnly, postedWithinDays,
          onlyWithSalary, minAnnualSalary, salaryCurrencies,
        },
        monitorName,
      )
    : null;
  const prevState = monitor && mKey ? await monitor.getValue<MonitorState>(mKey) : null;
  const history = new SeenPostings(prevState);
  let alreadyDelivered = 0;
  const saveMonitor = async () => {
    if (monitor && mKey) await monitor.setValue(mKey, history.toState(prevState));
  };
  if (monitor) {
    log.info(
      prevState
        ? `Returning only jobs this search has not delivered in its ${prevState.runs} earlier run(s).`
        : `First run of this search (${mKey}): returning all current matches and remembering them.`,
    );
  }

  // ---------------------------------------------------------------- filters

  const now = new Date();
  const titleKw = titleKeywords.map((k) => k.toLowerCase()).filter(Boolean);
  const locKw = locationKeywords.map((k) => k.toLowerCase()).filter(Boolean);
  const locMatch = locationMatcher(locKw);
  const cutoff = postedWithinDays ? now.getTime() - postedWithinDays * 86_400_000 : null;
  const currencies = new Set(salaryCurrencies.map((c) => c.trim().toUpperCase()).filter(Boolean));
  // Pay is read from the description, so any pay filter needs the detail call.
  const needSalary = onlyWithSalary || !!minAnnualSalary || currencies.size > 0;

  /** Decide from the list row alone. "maybe" means the detail call must settle it. */
  function preFilter(p: Posting): "yes" | "no" | "maybe" {
    if (titleKw.length && !titleKw.some((k) => p.title.toLowerCase().includes(k))) return "no";
    if (postedWithinDays) {
      const age = minAgeDays(p.postedOn);
      // "Posted 30+ Days Ago" is at least 30 days old; for any window up to 30 days it is out.
      if (age !== null && (age > postedWithinDays || (/\+/.test(p.postedOn ?? "") && age >= postedWithinDays))) return "no";
    }
    let verdict: "yes" | "maybe" = "yes";
    if (locKw.length) {
      const loc = (p.locationsText ?? "").toLowerCase();
      // "5 Locations" hides the list -- only the detail call has it.
      if (/^\d+ locations?$/.test(loc)) verdict = "maybe";
      else if (!locMatch(loc)) return "no";
    }
    if (remoteOnly || needSalary) verdict = "maybe";
    return verdict;
  }

  function finalFilter(j: Job): boolean {
    if (remoteOnly && !j.remote) return false;
    if (needSalary) {
      if (j.salaryAnnualMax == null) return false;
      if (minAnnualSalary && j.salaryAnnualMax < minAnnualSalary) return false;
      if (currencies.size && !currencies.has(j.salaryCurrency ?? "")) return false;
    }
    if (locKw.length) {
      const all = [j.location ?? "", ...j.additionalLocations].join(" | ").toLowerCase();
      if (!locMatch(all)) return false;
    }
    if (cutoff && j.postedAt) {
      const ts = Date.parse(j.postedAt);
      if (Number.isFinite(ts) && ts < cutoff - 86_400_000) return false; // a day's grace for date-only values
    }
    return true;
  }

  // ---------------------------------------------------------------- fetch

  const client = new WorkdayClient();
  const seenJobs = new Set<string>();
  let pushed = 0;
  let budgetReached = false;
  const perSite: Array<{ site: string; jobs: number; status: string }> = [];
  const incomplete: string[] = [];

  // Finish inside the run's own time limit: stop starting sites and detail batches with a margin left.
  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const softStop = timeoutAt - Math.min(45_000, Math.max(8_000, (timeoutAt - Date.now()) * 0.2));
  let timeLimited = false;
  const outOfTime = () => (Date.now() > softStop ? (timeLimited = true) : false);

  for (const site of unique) {
    if (pushed >= maxJobs || budgetReached || outOfTime()) break;
    const label = `${site.tenant}/${site.site}`;
    const siteCap = Math.min(maxJobsPerCompany ?? Infinity, maxJobs - pushed);

    // 1. List. Keep rows that pass (or might pass) the filters; stop early
    //    once there are certainly enough.
    const candidates: Array<{ p: Posting; category: string | null; sure: boolean; key: string }> = [];
    let sure = 0;
    try {
      await client.collect(site, {
        searchText,
        onIncomplete: (why) => {
          incomplete.push(why);
          log.warning(why);
        },
        onPosting: (p, category) => {
          const key = postingKey(site.tenant, site.site, p.externalPath);
          // Delivered by an earlier run of this search: skip before any detail call.
          if (monitor && history.has(key)) return void alreadyDelivered++;
          const v = preFilter(p);
          if (v === "no") return;
          candidates.push({ p, category, sure: v === "yes", key });
          if (v === "yes") sure++;
          return sure >= siteCap;
        },
      });
    } catch (err) {
      // Fail soft: one unreachable site never sinks the run.
      log.warning(`${label} failed while listing: ${String(err)}`);
      perSite.push({ site: label, jobs: 0, status: "unreachable" });
      continue;
    }

    // 2. Details (when wanted or needed), final filter, charge + push -- in
    //    small batches so the charging limit and caps are honoured promptly.
    let siteDelivered = 0;
    for (let i = 0; i < candidates.length && siteDelivered < siteCap && !budgetReached && !outOfTime(); i += DETAIL_CONCURRENCY) {
      const batch = candidates.slice(i, i + DETAIL_CONCURRENCY);
      const jobs = await Promise.all(
        batch.map(async ({ p, category, sure, key }) => {
          const needDetail = includeDescription || !sure;
          const d = needDetail ? await client.detail(site, p.externalPath) : null;
          // A job that vanished between list and detail is simply gone.
          if (needDetail && !d) return null;
          return { j: normalize(site, p, category, d, now), key };
        }),
      );
      for (const r of jobs) {
        if (!r || siteDelivered >= siteCap || pushed >= maxJobs) continue;
        const { j, key } = r;
        // One company often runs several career sites listing the same role.
        if (seenJobs.has(j.id)) continue;
        // ...and may list a role delivered earlier under another site's path.
        if (monitor && history.has(`id:${j.id}`)) {
          alreadyDelivered++;
          history.add(key, new Date().toISOString());
          continue;
        }
        if (!finalFilter(j)) continue;
        seenJobs.add(j.id);

        const record = includeDescription ? j : { ...j, description: undefined };
        const charge = await Actor.pushData(record, EVENT_JOB);
        pushed++;
        siteDelivered++;
        if (monitor) {
          const at = new Date().toISOString();
          history.add(key, at);
          history.add(`id:${j.id}`, at);
        }
        if (charge?.eventChargeLimitReached) {
          budgetReached = true;
          log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
          break;
        }
      }
    }

    perSite.push({ site: label, jobs: siteDelivered, status: candidates.length ? "ok" : "no matching jobs" });
    log.info(`${label}: ${siteDelivered} jobs (total ${pushed}/${maxJobs})`);
    // Save as we go, so a crash never re-charges for jobs already delivered.
    if (siteDelivered) await saveMonitor();
  }

  // ---------------------------------------------------------------- summary

  await saveMonitor();

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    sitesFetched: perSite.length,
    sitesWithJobs: perSite.filter((s) => s.jobs > 0).length,
    stoppedBecause: budgetReached ? "charging_limit" : pushed >= maxJobs ? "maxJobs" : timeLimited ? "time_limit" : "completed",
    coverageWarnings: incomplete,
    ...(monitor ? { newSinceLastRun: { monitorKey: mKey, firstRun: !prevState, alreadyDeliveredSkipped: alreadyDelivered } } : {}),
    perSite,
    filters: { searchText, titleKeywords, locationKeywords, remoteOnly, postedWithinDays, onlyWithSalary, minAnnualSalary, salaryCurrencies },
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} jobs from ${perSite.filter((s) => s.jobs > 0).length} career site(s).`);
  if (timeLimited) {
    log.warning(`Stopped early to finish inside this run's time limit (${perSite.length} of ${unique.length} career sites). Give the run a longer timeout for complete results.`);
  }
  await Actor.exit(timeLimited ? `Stopped early to stay inside the run's time limit: ${pushed} jobs delivered. Use a longer timeout for complete results.` : undefined);
} catch (err) {
  // Actor.fail marks the run FAILED with the reason; exiting normally here
  // used to report crashed runs as SUCCEEDED (found 3 Oct 2026).
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}

// ------------------------------------------------------------------ helpers

function dedupeSites(sites: Site[]): Site[] {
  const seen = new Set<string>();
  return sites.filter((s) => {
    // Site ids are case-insensitive on Workday's side; hosts differ only by casing we already lowered.
    const k = `${s.host}|${s.tenant}|${s.site.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The verified registry shipped with the image. Built by scripts/discover.ts. */
async function loadRegistry(): Promise<Site[]> {
  const { readFile } = await import("node:fs/promises");
  const rows = JSON.parse(await readFile(new URL("./sites.json", import.meta.url), "utf8")) as Array<
    Site & { jobCount: number }
  >;
  return rows.map(({ host, tenant, site }) => ({ host, tenant, site }));
}
