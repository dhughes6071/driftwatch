/**
 * Workday career sites as a fourth source for this Actor.
 *
 * The client, URL parsing and normalisation are a copy of the Workday Jobs
 * Scraper's (workday.ts). This file adds what this Actor needs on top: the
 * built-in registry of Workday employers, finding a company in it by name, and
 * fetching one site into this Actor's job shape.
 *
 * Workday is slower than the other three: 20 jobs per list request, one
 * request per job for its description, and about 10 requests a second per IP
 * across all Workday sites. So nothing is downloaded that the filters can rule
 * out from the list row, and listing stops as soon as the run has enough.
 */
import SITES from "./workday-sites.json" with { type: "json" };
import { WorkdayClient, companyName, locationMatcher, minAgeDays, normalize, type Posting, type Site } from "./workday.ts";
import type { Job } from "./ats.ts";
import type { PayFields } from "./pay.ts";

export type { Site } from "./workday.ts";
export { WorkdayClient, parseCareerSiteUrl } from "./workday.ts";

/** A Workday job in this Actor's shape, plus the fields only Workday has. */
export type WorkdayJob = Omit<Job, "ats" | "compensation"> & {
  ats: "workday";
  /** "Morgan Stanley", where `company` / `companySlug` hold Workday's id ("ms"). */
  companyName: string;
  additionalLocations: string[];
  country: string | null;
  /** The company's own workplace label: "Remote", "Hybrid", "On-site"... */
  workplaceType: string | null;
  /** Pay read from the description (Workday has no structured pay). Internal: spread into the record by main.ts. */
  pay: PayFields;
};

/** The 4,100+ verified Workday career sites, biggest first. */
const WORKDAY_SITES: Site[] = SITES;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
let byName: Map<string, Site[]> | null = null;

/**
 * Registry sites for a company name or Workday id: "nvidia", "Morgan Stanley", "ms".
 * Exact match after dropping case, spaces and punctuation, so "bank" finds nothing
 * rather than every bank. Empty when the company is not in the registry.
 */
export function workdaySitesNamed(name: string): Site[] {
  if (!byName) {
    byName = new Map();
    for (const s of WORKDAY_SITES) {
      for (const k of new Set([key(s.tenant), key(companyName(s.tenant))])) {
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k)!.push(s);
      }
    }
  }
  return byName.get(key(name)) ?? [];
}

export interface WorkdayFilters {
  titleKeywords: string[];
  locationKeywords: string[];
  remoteOnly: boolean;
  postedWithinDays?: number;
  /** A pay filter is set: pay is read from the description, so every candidate needs its detail call. */
  needSalary: boolean;
  includeDescription: boolean;
}

/**
 * List one Workday site, fetch details for the jobs that may match, and hand
 * each job to `deliver`, which applies the run's own filters and returns
 * whether it took the job. Returns how many postings the site listed (0 means
 * empty or unreachable).
 */
export async function fetchWorkdaySite(
  client: WorkdayClient,
  site: Site,
  f: WorkdayFilters,
  run: {
    /** Jobs the run still wants; listing stops once this many certain matches are found. */
    wanted: () => number;
    /** The run is over (full, out of budget or out of time). */
    stopped: () => boolean;
    deliver: (job: WorkdayJob) => boolean;
    /** Called after each batch of details, so the caller can push and notice a spent budget. */
    afterBatch: () => Promise<void>;
  },
): Promise<number> {
  const now = new Date();
  const titleMatch = locationMatcher(f.titleKeywords);
  const locMatch = locationMatcher(f.locationKeywords);

  /** Decide from the list row alone. "maybe" means the detail call must settle it. */
  const preFilter = (p: Posting): "yes" | "no" | "maybe" => {
    if (f.titleKeywords.length && !titleMatch(p.title)) return "no";
    if (f.postedWithinDays) {
      const age = minAgeDays(p.postedOn);
      // "Posted 30+ Days Ago" is at least 30 days old; for any window up to 30 days it is out.
      if (age !== null && (age > f.postedWithinDays || (/\+/.test(p.postedOn ?? "") && age >= f.postedWithinDays))) return "no";
    }
    let verdict: "yes" | "maybe" = "yes";
    if (f.locationKeywords.length) {
      const loc = (p.locationsText ?? "").toLowerCase();
      // "5 Locations" hides the list -- only the detail call has it.
      if (/^\d+ locations?$/.test(loc)) verdict = "maybe";
      else if (!locMatch(loc)) return "no";
    }
    if (f.remoteOnly || f.needSalary) verdict = "maybe";
    return verdict;
  };

  const candidates: Array<{ p: Posting; category: string | null; sure: boolean }> = [];
  let listed = 0;
  let sure = 0;
  await client.collect(site, {
    onPosting: (p, category) => {
      listed++;
      if (run.stopped()) return true;
      const v = preFilter(p);
      if (v === "no") return;
      candidates.push({ p, category, sure: v === "yes" });
      if (v === "yes") sure++;
      return sure >= run.wanted();
    },
  });

  const BATCH = 8;
  for (let i = 0; i < candidates.length && !run.stopped(); i += BATCH) {
    const jobs = await Promise.all(
      candidates.slice(i, i + BATCH).map(async ({ p, category, sure }) => {
        const needDetail = f.includeDescription || f.needSalary || !sure;
        const d = needDetail ? await client.detail(site, p.externalPath) : null;
        // A job that vanished between list and detail is simply gone.
        if (needDetail && !d) return null;
        return toJob(normalize(site, p, category, d, now));
      }),
    );
    for (const j of jobs) if (j && !run.stopped()) run.deliver(j);
    await run.afterBatch();
  }
  return listed;
}

function toJob(w: ReturnType<typeof normalize>): WorkdayJob {
  return {
    id: w.id,
    ats: "workday",
    company: w.companyName,
    companySlug: w.companySlug,
    companyName: w.companyName,
    title: w.title,
    location: w.location,
    additionalLocations: w.additionalLocations,
    country: w.country,
    remote: w.remote,
    remoteEligible: w.remoteEligible,
    workplaceType: w.workplaceType,
    department: w.department,
    postedAt: w.postedAt,
    url: w.url,
    description: w.description ?? "",
    employmentType: w.employmentType,
    pay: {
      salaryMin: w.salaryMin,
      salaryMax: w.salaryMax,
      salaryCurrency: w.salaryCurrency,
      salaryPeriod: w.salaryPeriod,
      salaryAnnualMin: w.salaryAnnualMin,
      salaryAnnualMax: w.salaryAnnualMax,
      salaryText: w.salaryText,
      salarySource: w.salaryText ? "description" : null,
    },
  };
}
