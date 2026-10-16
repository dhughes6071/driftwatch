/**
 * Roll jobs up into companies: "who is hiring for X", one record per company.
 *
 * Every job in the index is read once. Jobs that match the caller's filters
 * count towards the company's matching roles; every job counts towards its
 * overall size and hiring pace, so a sales team sees both "3 open Salesforce
 * roles" and "120 openings, 40 of them new this month".
 *
 * Pure logic, no Apify SDK, so it is testable against local data.
 */
import type { IndexJob } from "./format.ts";

export interface CompanyFilters {
  /** At least this many matching roles (default 1). */
  minMatchingJobs?: number;
  /** Company size by open roles, all departments. */
  minTotalOpenJobs?: number;
  maxTotalOpenJobs?: number;
  sortBy?: SortBy;
  maxCompanies: number;
  /** Only companies with a matching role first seen after this time (ISO): "new since last run". */
  seenAfter?: string;
}

export type SortBy = "matchingJobs" | "newMatchingJobs" | "hiringGrowth" | "totalOpenJobs";

export interface SampleJob {
  title: string;
  location: string | null;
  department: string | null;
  postedAt: string | null;
  url: string;
}

export interface Company {
  companyName: string;
  /** The company's id on its hiring system, e.g. "stripe". Stable across runs. */
  companyId: string;
  /** Which hiring system (ATS) the company uses: greenhouse, workday, lever... */
  ats: string;
  careerSiteUrl: string;
  /** Open roles that match the search. */
  matchingJobs: number;
  matchingJobsNewLast7Days: number;
  matchingJobsNewLast30Days: number;
  /** Matching roles the index added since this search last ran (only with onlyNewSinceLastRun). */
  matchingJobsNewSinceLastRun?: number;
  latestMatchingPostedAt: string | null;
  /** All open roles at the company, any department or location. */
  totalOpenJobs: number;
  newJobsLast7Days: number;
  newJobsLast30Days: number;
  /**
   * Share of open roles posted in the last 30 days (0-1): how fast the company
   * is hiring right now. Counts only roles whose age is known (see knownAge);
   * null when fewer than half of the company's roles have a known age.
   * Bulk-dated roles already open on the index's first crawl (see bulkDays) never count as new.
   */
  hiringGrowth: number | null;
  matchingRemoteJobs: number;
  /** Most common departments and locations among the matching roles, with counts. */
  topDepartments: Array<{ name: string; jobs: number }>;
  topLocations: Array<{ name: string; jobs: number }>;
  countries: string[];
  /** Pay stated on matching roles, per year, in the most common currency among them. */
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  matchingJobsWithSalary: number;
  /** The newest matching roles, up to 5. */
  sampleJobs: SampleJob[];
  /** Readable one-liner of the sample titles, for spreadsheets and CRMs. */
  sampleTitles: string;
}

interface Acc {
  company: string;
  companyName: string;
  ats: string;
  firstUrl: string;
  total: number;
  /** Earliest firstSeenAt across the company's roles: when the index started watching it. */
  firstSeen: string;
  /** Roles per posting day, to spot bulk re-posts. */
  days: Map<string, number>;
  /**
   * Every role's age facts, settled in results() once the whole company is known.
   * Key: posting day ("" if undated) | first-seen day | matches | new in 7 days | new in 30 days.
   */
  ages: Map<string, number>;
  matching: number;
  mSince: number;
  latest: string | null;
  remote: number;
  depts: Map<string, number>;
  locs: Map<string, number>;
  countries: Set<string>;
  /** currency -> [min, max, count] */
  pay: Map<string, [number, number, number]>;
  samples: SampleJob[];
}

const SAMPLES = 5;
const TOP = 5;

/** The date a role counts from: when posted, or when we first saw it if the site gives no date. */
const when = (j: IndexJob) => j.postedAt ?? j.firstSeenAt;

/**
 * How new a role is for the 7/30-day counts. A role cannot be newer than the
 * day the index first saw it: a site that re-posts an old opening under the
 * same id moves postedAt forward, but firstSeenAt keeps the real age.
 */
const ageFrom = (j: IndexJob) => (j.postedAt && j.postedAt < j.firstSeenAt ? j.postedAt : j.firstSeenAt);

/** A posting day holding more than this share of a company's roles (and at least BULK_MIN of them) is a bulk re-post. */
export const BULK_SHARE = 0.4;
export const BULK_MIN = 20;
/** Roles first seen on the company's first two crawl days were already open when the index started watching. */
const FIRST_CRAWL_DAYS = 2;

/**
 * Posting days that look like a bulk re-post or system migration rather than
 * real hiring: one day holds over 40% of the company's roles, 20 or more. On
 * 16 Oct 2026 Adobe had 230 of 329 roles dated 18 Sep and Snap 191 of 392
 * dated 25 Sep, all already open when the index first crawled them; read at
 * face value they made both look like they had hired their whole team this
 * month. Roles on such a day that the index saw appear later (LCBO's 455
 * holiday roles, posted weeks after we started watching it) are real new roles.
 */
export function bulkDays(days: Map<string, number>, total: number): Set<string> {
  const out = new Set<string>();
  for (const [d, n] of days) if (n >= BULK_MIN && n > total * BULK_SHARE) out.add(d);
  return out;
}

/**
 * Can we tell whether a role is new within a window? Dated roles go by their
 * posting date. An undated role's first-seen date only proves its age when
 * the index was already watching the company before the window opened;
 * otherwise every role the first crawl found looks brand new (on 16 Oct 2026
 * the index was 19 days old, and JBS USA showed 439 of 439 undated roles as
 * "new this month").
 */
const knownAge = (dated: boolean, companyFirstSeen: string, cut: string) => dated || companyFirstSeen < cut;

export class CompanyRollup {
  private accs = new Map<string, Acc>();
  private cut7: string;
  private cut30: string;
  private match: (j: IndexJob) => boolean;
  private seenAfter: string | undefined;
  private staleBefore: string | null;
  jobsRead = 0;
  jobsMatched = 0;
  /** Roles ignored as stale: postings older than maxRoleAgeDays. */
  jobsStale = 0;

  /**
   * maxRoleAgeDays: roles posted longer ago than this are left out of every
   * count. Some career sites never take old ads down (one listed 240
   * "Salesforce" roles, all from 2017); without this they top every list.
   */
  constructor(match: (j: IndexJob) => boolean, seenAfter: string | undefined, now = Date.now(), maxRoleAgeDays: number | null = 365) {
    this.match = match;
    this.seenAfter = seenAfter;
    this.staleBefore = maxRoleAgeDays ? new Date(now - maxRoleAgeDays * 86_400_000).toISOString() : null;
    this.cut7 = new Date(now - 7 * 86_400_000).toISOString();
    this.cut30 = new Date(now - 30 * 86_400_000).toISOString();
  }

  add(j: IndexJob) {
    this.jobsRead++;
    if (this.staleBefore && when(j) < this.staleBefore) return void this.jobsStale++;
    const key = `${j.ats}:${j.company}`;
    let a = this.accs.get(key);
    if (!a) {
      a = {
        company: j.company, companyName: j.companyName, ats: j.ats, firstUrl: j.url,
        total: 0, firstSeen: j.firstSeenAt, days: new Map(), ages: new Map(), matching: 0, mSince: 0, latest: null, remote: 0,
        depts: new Map(), locs: new Map(), countries: new Set(), pay: new Map(), samples: [],
      };
      this.accs.set(key, a);
    }
    const matched = this.match(j);
    a.total++;
    if (j.firstSeenAt < a.firstSeen) a.firstSeen = j.firstSeenAt;
    // Ages wait for results(), when the company's first appearance and bulk days are known.
    const pd = j.postedAt ? j.postedAt.slice(0, 10) : "";
    if (pd) bump(a.days, pd);
    const from = ageFrom(j);
    bump(a.ages, `${pd}|${j.firstSeenAt.slice(0, 10)}|${+matched}|${+(from >= this.cut7)}|${+(from >= this.cut30)}`);
    if (!matched) return;

    this.jobsMatched++;
    a.matching++;
    if (this.seenAfter && j.firstSeenAt > this.seenAfter) a.mSince++;
    if (!a.latest || (j.postedAt && j.postedAt > a.latest)) a.latest = j.postedAt ?? a.latest;
    if (j.remote) a.remote++;
    if (j.department) bump(a.depts, j.department.trim());
    if (j.location) bump(a.locs, j.location.trim());
    if (j.country) a.countries.add(j.country);
    if (j.salaryAnnualMax != null && j.salaryCurrency) {
      const p = a.pay.get(j.salaryCurrency);
      const lo = j.salaryAnnualMin ?? j.salaryAnnualMax;
      if (p) {
        p[0] = Math.min(p[0], lo);
        p[1] = Math.max(p[1], j.salaryAnnualMax);
        p[2]++;
      } else a.pay.set(j.salaryCurrency, [lo, j.salaryAnnualMax, 1]);
    }
    // Keep the newest few, by posting date.
    const s: SampleJob = { title: j.title, location: j.location, department: j.department, postedAt: j.postedAt, url: j.url };
    if (a.samples.length < SAMPLES) a.samples.push(s);
    else {
      let oldest = 0;
      for (let i = 1; i < a.samples.length; i++) if (sampleWhen(a.samples[i]) < sampleWhen(a.samples[oldest])) oldest = i;
      if (sampleWhen(s) > sampleWhen(a.samples[oldest])) a.samples[oldest] = s;
    }
  }

  /** Companies passing the company-level filters, sorted, capped. */
  results(f: CompanyFilters): { companies: Company[]; totalMatchingCompanies: number } {
    const min = Math.max(1, f.minMatchingJobs ?? 1);
    const rows: Company[] = [];
    for (const a of this.accs.values()) {
      if (a.matching < min) continue;
      if (f.minTotalOpenJobs && a.total < f.minTotalOpenJobs) continue;
      if (f.maxTotalOpenJobs && a.total > f.maxTotalOpenJobs) continue;
      if (f.seenAfter && a.mSince === 0) continue;
      rows.push(toCompany(a, !!f.seenAfter, this.cut7, this.cut30));
    }
    const sortBy = f.sortBy ?? "matchingJobs";
    rows.sort((x, y) => key(y, sortBy) - key(x, sortBy) || y.matchingJobs - x.matchingJobs || x.companyName.localeCompare(y.companyName));
    return { companies: rows.slice(0, f.maxCompanies), totalMatchingCompanies: rows.length };
  }
}

function key(c: Company, s: SortBy): number {
  switch (s) {
    case "newMatchingJobs":
      return c.matchingJobsNewLast30Days;
    case "hiringGrowth":
      // Tiny companies swing to 100% with one new role; weight by size so the list leads with real momentum.
      // Unknown growth sorts last.
      return c.hiringGrowth == null ? -1 : c.hiringGrowth * Math.log10(10 + c.totalOpenJobs);
    case "totalOpenJobs":
      return c.totalOpenJobs;
    default:
      return c.matchingJobs;
  }
}

const sampleWhen = (s: SampleJob) => s.postedAt ?? "";

function bump(m: Map<string, number>, k: string) {
  if (k) m.set(k, (m.get(k) ?? 0) + 1);
}

function top(m: Map<string, number>) {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP)
    .map(([name, jobs]) => ({ name, jobs }));
}

function toCompany(a: Acc, withSince: boolean, cut7: string, cut30: string): Company {
  let new7 = 0, new30 = 0, m7 = 0, m30 = 0, known30 = 0;
  const bulk = bulkDays(a.days, a.total);
  const firstCrawlEnd = new Date(Date.parse(a.firstSeen) + FIRST_CRAWL_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const [k, n] of a.ages) {
    const [pd, seenDay, matched, in7, in30] = k.split("|");
    if (bulk.has(pd) && seenDay < firstCrawlEnd) {
      // On a bulk-dated day and already open when the index started watching: its date says nothing
      // about its age, so it counts towards the company's size but never as new.
      known30 += n;
      continue;
    }
    if (in7 === "1" && knownAge(!!pd, a.firstSeen, cut7)) {
      new7 += n;
      if (matched === "1") m7 += n;
    }
    if (!knownAge(!!pd, a.firstSeen, cut30)) continue;
    known30 += n;
    if (in30 === "1") {
      new30 += n;
      if (matched === "1") m30 += n;
    }
  }
  let cur: string | null = null;
  let pay: [number, number, number] | null = null;
  for (const [c, p] of a.pay) if (!pay || p[2] > pay[2]) [cur, pay] = [c, p];
  const samples = [...a.samples].sort((x, y) => (sampleWhen(y) > sampleWhen(x) ? 1 : -1));
  return {
    companyName: displayName(a.companyName, a.company),
    companyId: a.company,
    ats: a.ats,
    careerSiteUrl: careerSiteUrl(a.ats, a.company, a.firstUrl),
    matchingJobs: a.matching,
    matchingJobsNewLast7Days: m7,
    matchingJobsNewLast30Days: m30,
    ...(withSince ? { matchingJobsNewSinceLastRun: a.mSince } : {}),
    latestMatchingPostedAt: a.latest,
    totalOpenJobs: a.total,
    newJobsLast7Days: new7,
    newJobsLast30Days: new30,
    hiringGrowth: known30 && known30 * 2 >= a.total ? Math.round((new30 / known30) * 100) / 100 : null,
    matchingRemoteJobs: a.remote,
    topDepartments: top(a.depts),
    topLocations: top(a.locs),
    countries: [...a.countries].sort(),
    salaryMin: pay ? pay[0] : null,
    salaryMax: pay ? pay[1] : null,
    salaryCurrency: cur,
    matchingJobsWithSalary: [...a.pay.values()].reduce((s, p) => s + p[2], 0),
    sampleJobs: samples,
    sampleTitles: [...new Set(samples.map((s) => s.title))].join("; "),
  };
}

/**
 * Lever and Ashby only give a slug ("elevenlabs"); make it readable. Real
 * names ("Morgan Stanley") pass through untouched.
 */
export function displayName(name: string, id: string): string {
  if (name && name !== id) return name;
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** The company's jobs page on its hiring system, derived from one job link. */
export function careerSiteUrl(ats: string, id: string, jobUrl: string): string {
  let u: URL;
  try {
    u = new URL(jobUrl);
  } catch {
    return jobUrl;
  }
  const at = (marker: string) => {
    const i = u.pathname.indexOf(marker);
    return i >= 0 ? `${u.origin}${u.pathname.slice(0, i) || "/"}` : null;
  };
  switch (ats) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${id}`;
    case "lever":
      return `https://jobs.lever.co/${id}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${id}`;
    case "workable":
      return `https://apply.workable.com/${id}/`;
    case "rippling":
      return `https://ats.rippling.com/${id}/jobs`;
    case "smartrecruiters": {
      // jobs.smartrecruiters.com/{Company}/{jobId}-{slug}: the company's own casing matters.
      const first = u.pathname.split("/")[1];
      return first ? `${u.origin}/${first}` : u.origin;
    }
    case "workday":
    case "jobvite":
      return at("/job/") ?? u.origin;
    case "oracle":
      return at("/job/") ?? u.origin;
    case "ukg": {
      const m = /^(.*\/JobBoard\/[^/]+)/.exec(u.pathname);
      return m ? `${u.origin}${m[1]}` : u.origin;
    }
    case "personio":
    case "bamboohr":
    case "breezy":
    case "teamtailor":
    case "recruitee":
      return (at("/job/") ?? at("/careers/") ?? at("/p/") ?? at("/jobs/") ?? at("/o/") ?? u.origin).replace(/\/$/, "") + (ats === "bamboohr" ? "/careers" : "");
    default:
      return u.origin;
  }
}
