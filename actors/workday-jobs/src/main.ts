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
  minAgeDays,
  normalize,
  parseCareerSiteUrl,
  type Job,
  type Posting,
  type Site,
} from "./workday.ts";

interface Input {
  /** Workday career-site URLs. Any page on the site works, including a single job. */
  careerSiteUrls?: string[];
  /** Use the built-in registry of verified Workday career sites. */
  useCuratedList?: boolean;
  /** Only registry companies whose Workday id contains one of these, e.g. "nvidia". */
  companyKeywords?: string[];
  /** Workday's own full-text search, run server-side. Fastest way to narrow big employers. */
  searchText?: string;
  titleKeywords?: string[];
  locationKeywords?: string[];
  remoteOnly?: boolean;
  postedWithinDays?: number;
  includeDescription?: boolean;
  maxJobs?: number;
  maxJobsPerCompany?: number;
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
    includeDescription = true,
    maxJobs = 1000,
    maxJobsPerCompany,
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
    const picked = kw.length ? registry.filter((s) => kw.some((k) => s.tenant.includes(k))) : registry;
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

  // ---------------------------------------------------------------- filters

  const now = new Date();
  const titleKw = titleKeywords.map((k) => k.toLowerCase()).filter(Boolean);
  const locKw = locationKeywords.map((k) => k.toLowerCase()).filter(Boolean);
  const cutoff = postedWithinDays ? now.getTime() - postedWithinDays * 86_400_000 : null;

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
      else if (!locKw.some((k) => loc.includes(k))) return "no";
    }
    if (remoteOnly) verdict = "maybe";
    return verdict;
  }

  function finalFilter(j: Job): boolean {
    if (remoteOnly && !j.remote) return false;
    if (locKw.length) {
      const all = [j.location ?? "", ...j.additionalLocations].join(" | ").toLowerCase();
      if (!locKw.some((k) => all.includes(k))) return false;
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

  for (const site of unique) {
    if (pushed >= maxJobs || budgetReached) break;
    const label = `${site.tenant}/${site.site}`;
    const siteCap = Math.min(maxJobsPerCompany ?? Infinity, maxJobs - pushed);

    // 1. List. Keep rows that pass (or might pass) the filters; stop early
    //    once there are certainly enough.
    const candidates: Array<{ p: Posting; category: string | null; sure: boolean }> = [];
    let sure = 0;
    try {
      await client.collect(site, {
        searchText,
        onIncomplete: (why) => {
          incomplete.push(why);
          log.warning(why);
        },
        onPosting: (p, category) => {
          const v = preFilter(p);
          if (v === "no") return;
          candidates.push({ p, category, sure: v === "yes" });
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
    let delivered = 0;
    for (let i = 0; i < candidates.length && delivered < siteCap && !budgetReached; i += DETAIL_CONCURRENCY) {
      const batch = candidates.slice(i, i + DETAIL_CONCURRENCY);
      const jobs = await Promise.all(
        batch.map(async ({ p, category, sure }) => {
          const needDetail = includeDescription || !sure;
          const d = needDetail ? await client.detail(site, p.externalPath) : null;
          // A job that vanished between list and detail is simply gone.
          if (needDetail && !d) return null;
          return normalize(site, p, category, d, now);
        }),
      );
      for (const j of jobs) {
        if (!j || delivered >= siteCap || pushed >= maxJobs) continue;
        // One company often runs several career sites listing the same role.
        if (seenJobs.has(j.id)) continue;
        if (!finalFilter(j)) continue;
        seenJobs.add(j.id);

        const record = includeDescription ? j : { ...j, description: undefined };
        const charge = await Actor.pushData(record, EVENT_JOB);
        pushed++;
        delivered++;
        if (charge?.eventChargeLimitReached) {
          budgetReached = true;
          log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
          break;
        }
      }
    }

    perSite.push({ site: label, jobs: delivered, status: candidates.length ? "ok" : "no matching jobs" });
    log.info(`${label}: ${delivered} jobs (total ${pushed}/${maxJobs})`);
  }

  // ---------------------------------------------------------------- summary

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    sitesFetched: perSite.length,
    sitesWithJobs: perSite.filter((s) => s.jobs > 0).length,
    stoppedBecause: budgetReached ? "charging_limit" : pushed >= maxJobs ? "maxJobs" : "completed",
    coverageWarnings: incomplete,
    perSite,
    filters: { searchText, titleKeywords, locationKeywords, remoteOnly, postedWithinDays },
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} jobs from ${perSite.filter((s) => s.jobs > 0).length} career site(s).`);
} catch (err) {
  log.error(`Actor failed: ${err instanceof Error ? err.message : String(err)}`);
  throw err;
} finally {
  await Actor.exit();
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
