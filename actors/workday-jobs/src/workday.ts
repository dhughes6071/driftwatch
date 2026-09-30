/**
 * Workday career-site client.
 *
 * Every Workday career site is a single-page app backed by a public JSON API
 * (`/wday/cxs/{tenant}/{site}/...`). The site's own robots.txt allows the site
 * and publishes a sitemap -- these listings exist to be found. We call the
 * same endpoints the page itself calls, with no login and no browser.
 *
 * Verified live 2026-09-26 against NVIDIA, Salesforce, TJX, AB InBev, White & Case.
 *
 * THREE QUIRKS THAT MAKE NAIVE WORKDAY SCRAPERS WRONG (all measured, not assumed):
 *
 *  1. `limit` above 20 is a hard HTTP 400.
 *  2. `total` is only reported on the first page (offset 0). Later pages say 0.
 *  3. On MANY sites (not all) `total` is capped at exactly 2,000, and offsets
 *     past 2,000 silently wrap back to the first page. NVIDIA reports 2,000 but
 *     has 2,650 -- a scraper that trusts `total` misses 650 roles and returns
 *     duplicates without any error. Other sites (Dollar Tree 23,636; TJX
 *     11,357) report their real count and page normally past 2,000.
 *
 * The fix for 3: a total of exactly 2,000 means "capped". Then split the
 * search by a facet (job category first) so every slice is under the cap,
 * recursing if one category is itself capped. Any other total is trusted.
 */

import NAMES from "./names.json" with { type: "json" };
import { extractSalary, type Period, type Salary } from "./salary.ts";

/**
 * Display names for known Workday tenants ("ms" -> "Morgan Stanley").
 * Workday publishes no name field: these were read from each career site's
 * own description, one by one, for all 1,785 registry companies (26 Sep 2026).
 */
const COMPANY_NAMES: Record<string, string> = NAMES;

/** The company's display name, or its Workday id when we have not named it. */
export const companyName = (tenant: string): string => COMPANY_NAMES[tenant] ?? tenant;

export const PAGE = 20;
export const CAP = 2000;

/** Where one Workday career site lives. */
export interface Site {
  /** e.g. "nvidia.wd5.myworkdayjobs.com" or "wd1.myworkdaysite.com" */
  host: string;
  tenant: string;
  /** The career site id, e.g. "NVIDIAExternalCareerSite". Workday matches it case-insensitively (verified). */
  site: string;
}

/** One row of a list response. */
export interface Posting {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
  remoteType?: string;
}

interface Facet {
  facetParameter: string;
  descriptor?: string;
  /** Some values are themselves nested facets -- see flattenFacets. */
  values?: Array<{ id?: string; descriptor?: string; count?: number }>;
}

interface ListResponse {
  total?: number;
  jobPostings?: Posting[];
  facets?: Facet[];
}

export interface Detail {
  title?: string;
  jobDescription?: string;
  location?: string;
  additionalLocations?: string[];
  postedOn?: string;
  startDate?: string;
  timeType?: string;
  remoteType?: string;
  jobReqId?: string;
  externalUrl?: string;
  country?: { descriptor?: string };
}

/** One job, normalized. Mirrors the main jobs actor's schema, plus Workday fields. */
export interface Job {
  /** Stable id: "workday:{tenant}:{jobReqId}" */
  id: string;
  ats: "workday";
  /** Workday's id for the company, e.g. "ms". Stable; use it to join or filter. */
  company: string;
  companySlug: string;
  /** Human-readable name, e.g. "Morgan Stanley". Falls back to the id for companies outside the registry. */
  companyName: string;
  careerSite: string;
  title: string;
  location: string | null;
  additionalLocations: string[];
  country: string | null;
  /** Location or workplace text itself says remote. Precise. */
  remote: boolean;
  /** Same as `remote` for Workday -- kept for schema parity with the main actor. */
  remoteEligible: boolean;
  /** The company's own workplace label, verbatim: "Remote", "Hybrid", "Office - Flexible"... */
  workplaceType: string | null;
  /** Workday "job family" / category, when the site publishes one. */
  department: string | null;
  /** ISO date. Exact when the description was fetched; derived from "Posted N Days Ago" otherwise. */
  postedAt: string | null;
  /** Workday's own relative label, e.g. "Posted 3 Days Ago". */
  postedOnText: string | null;
  url: string;
  description?: string;
  employmentType: string | null;
  jobReqId: string | null;
  /** Stated pay, read from the description (null when none is stated or no description was fetched). */
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: Period | null;
  /** Annualised (hour x 2,080, day x 260, week x 52, month x 12), same currency. */
  salaryAnnualMin: number | null;
  salaryAnnualMax: number | null;
  /** The text the pay was read from, for checking. */
  salaryText: string | null;
}

export type Fetch = typeof fetch;

const UA = "workday-jobs-actor/0.1 (+public career-site listings)";
const MAX_DESC = 8_000;

// ------------------------------------------------------------------ URLs

/**
 * Turn anything a user might paste -- a career site, a single job, with or
 * without a locale segment -- into the site it belongs to.
 *
 *   https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite
 *   https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/...
 *   https://wd1.myworkdaysite.com/recruiting/tjx/TJX_EXTERNAL
 */
export function parseCareerSiteUrl(raw: string): Site | null {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  // A leading locale ("en-US", "fr-FR", "de") is presentation, not identity.
  if (parts[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0])) parts.shift();

  const jobs = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (jobs && parts[0]) return { host, tenant: jobs[1], site: parts[0] };

  if (/^wd\d+\.myworkdaysite\.com$/.test(host) && parts[0] === "recruiting" && parts[1] && parts[2]) {
    return { host, tenant: parts[1], site: parts[2] };
  }
  return null;
}

export const apiBase = (s: Site) => `https://${s.host}/wday/cxs/${s.tenant}/${s.site}`;

export const publicBase = (s: Site) =>
  s.host.endsWith(".myworkdaysite.com")
    ? `https://${s.host}/recruiting/${s.tenant}/${s.site}`
    : `https://${s.host}/${s.site}`;

// ------------------------------------------------------------------ HTTP

export class WorkdayClient {
  // Plain fields, not parameter properties: Node's type stripping rejects those.
  private readonly fetchImpl: Fetch;
  private readonly timeoutMs: number;

  constructor(fetchImpl: Fetch = fetch, timeoutMs = 30_000) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  /** JSON request with retries on 429/5xx. Returns null on a definitive miss (404/422). */
  private async json<T>(url: string, body?: unknown): Promise<T | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: body ? "POST" : "GET",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": UA,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          return null;
        }
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return null; // 400/404/422: the site or job does not exist -- retrying will not help
    }
    return null;
  }

  async page(site: Site, applied: Record<string, string[]>, offset: number, searchText = "") {
    return this.json<ListResponse>(`${apiBase(site)}/jobs`, {
      appliedFacets: applied,
      limit: PAGE,
      offset,
      searchText,
    });
  }

  async detail(site: Site, externalPath: string): Promise<Detail | null> {
    const r = await this.json<{ jobPostingInfo?: Detail }>(`${apiBase(site)}${externalPath}`);
    return r?.jobPostingInfo ?? null;
  }

  /**
   * Walk every posting on a site, each delivered once, with its category when known.
   *
   * Always splits by job category when the site has one -- that costs one
   * request per category and is what gives every row a `department`. Beyond
   * that it only splits further when a slice hits the 2,000 cap.
   *
   * Requests run in parallel up to `concurrency`: TJX needs ~3,300 location
   * slices, which is half an hour one at a time and a few minutes this way.
   *
   * `onPosting` returns true to stop early (the caller has enough); requests
   * already in flight finish, no new ones start.
   */
  async collect(
    site: Site,
    opts: {
      searchText?: string;
      concurrency?: number;
      onPosting: (posting: Posting, category: string | null) => boolean | void;
      onIncomplete?: (why: string) => void;
    },
  ): Promise<void> {
    const seen = new Set<string>();
    const searchText = opts.searchText ?? "";
    const gate = semaphore(opts.concurrency ?? 6);
    let stopped = false;

    const page = (applied: Record<string, string[]>, offset: number) =>
      // Checked when the request reaches the front of the queue, not when it
      // was queued -- otherwise every page queued before the stop still runs.
      gate(() => (stopped ? Promise.resolve(null) : this.page(site, applied, offset, searchText)));

    const emit = (rows: Posting[], category: string | null) => {
      for (const p of rows) {
        if (stopped) return;
        if (seen.has(p.externalPath)) continue;
        seen.add(p.externalPath);
        if (opts.onPosting(p, category)) stopped = true;
      }
    };

    const walk = async (
      applied: Record<string, string[]>,
      category: string | null,
      depth: number,
    ): Promise<void> => {
      const first = await page(applied, 0);
      if (!first || stopped) return;
      const total = first.total ?? 0;
      if (total === 0) return;

      // Exactly CAP means Workday stopped counting; anything else is the real count.
      const mustSplit = total === CAP;
      const facet = depth < 4 ? chooseSplit(first.facets ?? [], applied, total) : null;

      if (facet && (mustSplit || (depth === 0 && facet.facetParameter === "jobFamilyGroup"))) {
        await Promise.all(
          (facet.values ?? [])
            .filter((v) => v.id && v.count)
            .map((v) =>
              walk(
                { ...applied, [facet.facetParameter]: [v.id!] },
                facet.facetParameter === "jobFamilyGroup" ? (v.descriptor ?? null) : category,
                depth + 1,
              ),
            ),
        );
        return;
      }

      if (mustSplit) {
        opts.onIncomplete?.(`${site.tenant}/${site.site}: a capped slice (2,000+ jobs) had no filter left to split it; got the first ${CAP}`);
      }

      // Plain paging.
      emit(first.jobPostings ?? [], category);
      // On a capped slice, never page past the cap: beyond it Workday wraps to page one.
      const last = mustSplit ? CAP : total;
      const offsets: number[] = [];
      for (let o = PAGE; o < last; o += PAGE) offsets.push(o);
      // Emit each page as it lands, so a caller that has enough stops the rest.
      await Promise.all(offsets.map((o) => page(applied, o).then((r) => emit(r?.jobPostings ?? [], category))));
    };

    await walk({}, null, 0);
  }
}

/**
 * Workday nests some facets one level down (locations sit inside a
 * "locationMainGroup" wrapper). Flatten so they can be split on too -- for
 * TJX the location facet is the only one that breaks up an 8,000-job slice.
 */
export function flattenFacets(facets: Facet[]): Facet[] {
  const out: Facet[] = [];
  for (const f of facets) {
    out.push(f);
    for (const v of f.values ?? []) {
      const nested = v as unknown as Facet;
      if (nested.facetParameter && Array.isArray(nested.values)) out.push(...flattenFacets([nested]));
    }
  }
  return out;
}

/**
 * Pick the facet to split a result set by.
 *
 * Only facets whose counts add up to the whole set qualify -- anything else
 * would silently drop the jobs it does not cover (TJX's full/part-time facet
 * misses 20 of 10,872). Among those:
 *
 *  1. job category, because it also becomes the `department` field (a
 *     still-capped category is split again one level down);
 *  2. otherwise the facet that gets every slice under the cap in the fewest
 *     requests;
 *  3. otherwise the one with the smallest biggest slice, and recurse.
 */
export function chooseSplit(
  facets: Facet[],
  applied: Record<string, string[]>,
  total: number,
): Facet | null {
  const usable = flattenFacets(facets)
    .filter((f) => !applied[f.facetParameter])
    .map((f) => {
      const vals = (f.values ?? []).filter((v) => v.id && typeof v.count === "number");
      const sum = vals.reduce((a, v) => a + (v.count ?? 0), 0);
      const max = Math.max(0, ...vals.map((v) => v.count ?? 0));
      return { f: { ...f, values: vals }, n: vals.length, sum, max };
    })
    .filter((x) => x.n >= 2 && x.sum >= total && x.max < total);

  const category = usable.find((x) => x.f.facetParameter === "jobFamilyGroup");
  if (category) return category.f;

  const oneLevel = usable.filter((x) => x.max < CAP).sort((a, b) => a.n - b.n)[0];
  if (oneLevel) return oneLevel.f;
  return usable.sort((a, b) => a.max - b.max)[0]?.f ?? null;
}

/** Run at most `n` of the given tasks at once. */
function semaphore(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/**
 * Location keyword test. Short keywords (state/country codes like "NY", "TX",
 * "UK") must match as whole words: as substrings, "NY" matches "Germany" and
 * "Albany", "CA" matches "Jamaica". Longer keywords match anywhere.
 */
export function locationMatcher(keywords: string[]): (text: string) => boolean {
  const tests = keywords
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .map((k) => {
      if (k.length > 3) return (t: string) => t.includes(k);
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
      return (t: string) => re.test(t);
    });
  return (text) => {
    const t = text.toLowerCase();
    return tests.some((f) => f(t));
  };
}

// ------------------------------------------------------------------ normalize

const REMOTE_RE = /\bremote\b|\bwork from home\b|\bwfh\b|\bvirtual\b|\banywhere\b/i;

/** "Posted Today" / "Posted Yesterday" / "Posted 5 Days Ago" -> ISO date. "30+ Days" is unknowable -> null. */
export function parsePostedOn(text: string | undefined, now = new Date()): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  let days: number | null = null;
  if (t.includes("today")) days = 0;
  else if (t.includes("yesterday")) days = 1;
  else {
    const m = t.match(/(\d+)(\+)?\s*days?\s*ago/);
    if (m && !m[2]) days = Number(m[1]);
  }
  if (days === null) return null;
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Minimum age in days implied by "Posted N Days Ago" / "Posted 30+ Days Ago". Null when unknown. */
export function minAgeDays(text: string | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("today")) return 0;
  if (t.includes("yesterday")) return 1;
  const m = t.match(/(\d+)\+?\s*days?\s*ago/);
  return m ? Number(m[1]) : null;
}

export function toText(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_DESC);
}

export function normalize(
  site: Site,
  p: Posting,
  category: string | null,
  d: Detail | null,
  now = new Date(),
): Job {
  const reqId = d?.jobReqId ?? p.bulletFields?.[0] ?? null;
  const location = d?.location ?? (p.locationsText && !/^\d+ locations?$/i.test(p.locationsText) ? p.locationsText : null);
  const additional = d?.additionalLocations ?? [];
  const workplace = d?.remoteType ?? p.remoteType ?? null;
  const remote = REMOTE_RE.test([location, ...additional, workplace ?? ""].join(" "));
  const postedOnText = d?.postedOn ?? p.postedOn ?? null;

  const job: Job = {
    id: `workday:${site.tenant}:${reqId ?? p.externalPath}`,
    ats: "workday",
    company: site.tenant,
    companySlug: site.tenant,
    companyName: companyName(site.tenant),
    careerSite: site.site,
    title: (d?.title ?? p.title).trim(),
    location,
    additionalLocations: additional,
    country: d?.country?.descriptor ?? null,
    remote,
    remoteEligible: remote,
    workplaceType: workplace,
    department: category,
    // startDate is the posting's own date; only the detail call returns it.
    postedAt: d?.startDate ?? parsePostedOn(postedOnText ?? undefined, now),
    postedOnText,
    url: d?.externalUrl ?? `${publicBase(site)}${p.externalPath}`,
    employmentType: d?.timeType ?? null,
    jobReqId: reqId,
    ...salaryFields(null),
  };
  if (d) {
    job.description = toText(d.jobDescription);
    Object.assign(job, salaryFields(extractSalary(job.description, job.country)));
  }
  return job;
}

/** Salary fields from an extraction result (all null when there is none). */
export function salaryFields(s: Salary | null) {
  return {
    salaryMin: s?.min ?? null,
    salaryMax: s?.max ?? null,
    salaryCurrency: s?.currency ?? null,
    salaryPeriod: s?.period ?? null,
    salaryAnnualMin: s?.annualMin ?? null,
    salaryAnnualMax: s?.annualMax ?? null,
    salaryText: s?.text ?? null,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
