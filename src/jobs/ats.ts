/**
 * ATS job-board aggregator.
 *
 * Pulls open roles from the PUBLIC, DOCUMENTED job-board APIs that applicant
 * tracking systems expose. These endpoints exist so that a company's jobs can
 * be syndicated -- consuming them is their intended use, not scraping.
 *
 * Verified live on 2026-08-07:
 *   greenhouse  boards-api.greenhouse.io/v1/boards/{slug}/jobs   -> 551 jobs (stripe)
 *   ashby       api.ashbyhq.com/posting-api/job-board/{slug}     -> 123 jobs (ramp)
 *   lever       api.lever.co/v0/postings/{slug}?mode=json
 *   workable    apply.workable.com/api/v1/widget/accounts/{slug}
 *
 * Why this and not HTML scraping: the incumbents on Apify sit at 3.6-4.0 stars
 * precisely because they scrape markup and break. A JSON API does not break.
 * Reliability is the entire competitive angle.
 */
import { config } from "../lib/config.ts";
import { log } from "../lib/log.ts";

export type Ats = "greenhouse" | "lever" | "ashby" | "workable";

/**
 * ATSs we have VERIFIED serve a reliable public JSON job board.
 *
 * Workable is excluded for RELIABILITY, not absence. Observed on 2026-08-07:
 * `apply.workable.com/api/v1/widget/accounts/{slug}` served valid JSON for
 * huggingface on one call and an HTML page for the same slug minutes later.
 * It also returns HTML rather than a 404 for unknown accounts, so a naive
 * probe cannot distinguish "no such company" from "endpoint is having a
 * moment" -- which means it silently produces phantom hits and phantom misses.
 *
 * The adapter is kept and works when the endpoint cooperates. It is off by
 * default because unreliable coverage is worse than no coverage: our entire
 * competitive claim against the 3.98-star incumbent is that we do not break.
 */
export const VERIFIED_ATS: Ats[] = ["greenhouse", "ashby", "lever"];

/** One job, normalized across every ATS. This schema is the product. */
export interface Job {
  /** Stable id: "{ats}:{companySlug}:{nativeId}" */
  id: string;
  ats: Ats;
  company: string;
  companySlug: string;
  title: string;
  /** Free-text location as published. */
  location: string | null;
  /**
   * Conservative: the LOCATION text itself says remote. High precision --
   * if this is true, the role really is location-independent.
   */
  remote: boolean;
  /**
   * The company's own remote flag from the ATS, where it publishes one.
   * Higher recall, much lower precision: Ashby reported 112 of Ramp's 123
   * roles as remote while listing every one of them at "New York, NY (HQ)"
   * (measured 2026-08-07). It appears to mean "remote-eligible", not "remote".
   * Surfaced separately so callers can decide which signal they trust.
   */
  remoteEligible: boolean;
  department: string | null;
  /** ISO 8601 when the ATS provides it. */
  postedAt: string | null;
  /** Canonical apply URL on the company's own board. */
  url: string;
  /** Plain-text description, truncated. Empty when the ATS omits it from list responses. */
  description: string;
  employmentType: string | null;
  /**
   * The company's structured pay data, raw: Ashby's `compensation` object, or
   * `{ payInputRanges }` from Greenhouse, or `{ leverSalaryRange }` from Lever. Internal: turned into the salary
   * fields by pay.ts and the Career Site Jobs API index, never output as is.
   */
  compensation?: unknown;
}

const UA = "driftwatch-jobs/0.1 (+ATS public job board aggregator)";
// 8,000, not 4,000: pay-transparency ranges usually sit at the END of a
// description, and the old cap cut them off (measured 28 Sep 2026).
const MAX_DESC = 8_000;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(config.limits.upstreamTimeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Strip HTML to plain text. ATS descriptions are HTML fragments. */
function toText(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_DESC);
}

export const REMOTE_RE = /\bremote\b|\bwork from home\b|\bwfh\b|\bdistributed\b|\banywhere\b/i;

// ------------------------------------------------------------------ greenhouse

interface GhJob {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url: string;
  content?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  metadata?: unknown;
  /** Present with ?pay_transparency=true. */
  pay_input_ranges?: unknown[];
}

/**
 * A cheap test on a job's title / location / date, run before descriptions
 * are downloaded. Greenhouse's full list is ~12x the size of its plain list
 * (Stripe: 5.6 MB vs 0.46 MB, 4 Oct), and a filtered search over every
 * company spent most of its time downloading descriptions it then threw away.
 */
export type Prefilter = (j: { title: string; location: string | null; postedAt: string | null }) => boolean;

/** At or below this many matches, fetch each matching job instead of the company's full list. */
const GH_PER_JOB_MAX = 15;

async function fetchGreenhouse(slug: string, prefilter?: Prefilter): Promise<Job[]> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
  let rows: GhJob[] | undefined;
  if (prefilter) {
    const light = (await getJson<{ jobs?: GhJob[] }>(`${base}?pay_transparency=true`))?.jobs;
    if (!light) return [];
    const hits = light.filter((j) =>
      prefilter({ title: j.title.trim(), location: j.location?.name ?? null, postedAt: j.first_published ?? j.updated_at ?? null }),
    );
    if (hits.length === 0) return [];
    if (hits.length <= GH_PER_JOB_MAX) {
      const full = await Promise.all(hits.map((j) => getJson<GhJob>(`${base}/${j.id}?pay_transparency=true`)));
      rows = full.map((f, i) => f ?? hits[i]); // a job that fails its detail call keeps its light row
    }
  }
  rows ??= (await getJson<{ jobs?: GhJob[] }>(`${base}?content=true&pay_transparency=true`))?.jobs;
  if (!rows) return [];

  return rows.map((j) => {
    const loc = j.location?.name ?? null;
    return {
      id: `greenhouse:${slug}:${j.id}`,
      ats: "greenhouse" as const,
      company: slug,
      companySlug: slug,
      title: j.title.trim(),
      location: loc,
      remote: REMOTE_RE.test(`${loc ?? ""} ${j.title}`),
      remoteEligible: REMOTE_RE.test(`${loc ?? ""} ${j.title}`),
      department: j.departments?.[0]?.name ?? null,
      postedAt: j.first_published ?? j.updated_at ?? null,
      url: j.absolute_url,
      // Greenhouse returns HTML-entity-encoded markup (&lt;p&gt;...), so it
      // needs decoding twice: once for the entities, once for the tags.
      description: toText(decodeEntities(j.content ?? "")),
      employmentType: null,
      ...(j.pay_input_ranges?.length ? { compensation: { payInputRanges: j.pay_input_ranges } } : {}),
    };
  });
}

/** Decode the HTML entities Greenhouse wraps its markup in. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

// ------------------------------------------------------------------ lever

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  descriptionPlain?: string;
  /** Titled sections ("Requirements", "Compensation"...), HTML content. */
  lists?: Array<{ text?: string; content?: string }>;
  additionalPlain?: string;
  /** Structured pay, when the company publishes it. */
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } | null;
  salaryDescriptionPlain?: string;
  categories?: { location?: string; team?: string; commitment?: string };
  workplaceType?: string;
}

/**
 * Lever's `descriptionPlain` is only the opening paragraph; requirements,
 * benefits and often the pay ("Compensation: Base pay $95,000 - $140,000")
 * are in `lists` and `additionalPlain` (Veeva, 30 Sep). Join them all.
 */
export function leverDescription(j: Pick<LeverJob, "descriptionPlain" | "lists" | "additionalPlain" | "salaryDescriptionPlain">): string {
  const parts = [
    j.descriptionPlain ?? "",
    ...(j.lists ?? []).map((l) => [l.text ?? "", toText(l.content)].filter(Boolean).join("\n")),
    j.additionalPlain ?? "",
    j.salaryDescriptionPlain ?? "",
  ];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_DESC);
}

async function fetchLever(slug: string): Promise<Job[]> {
  const data = await getJson<LeverJob[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  );
  if (!Array.isArray(data)) return [];

  return data.map((j) => {
    const loc = j.categories?.location ?? null;
    return {
      id: `lever:${slug}:${j.id}`,
      ats: "lever" as const,
      company: slug,
      companySlug: slug,
      title: j.text.trim(),
      location: loc,
      remote: REMOTE_RE.test(`${loc ?? ""} ${j.text}`),
      remoteEligible: j.workplaceType === "remote" || REMOTE_RE.test(`${loc ?? ""} ${j.text}`),
      department: j.categories?.team ?? null,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      url: j.hostedUrl,
      description: leverDescription(j),
      employmentType: j.categories?.commitment ?? null,
      ...(j.salaryRange ? { compensation: { leverSalaryRange: j.salaryRange } } : {}),
    };
  });
}

// ------------------------------------------------------------------ ashby

interface AshbyJob {
  compensation?: unknown;
  id: string;
  title: string;
  location?: string;
  department?: string;
  team?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  employmentType?: string;
  isRemote?: boolean;
}

async function fetchAshby(slug: string): Promise<Job[]> {
  const data = await getJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  if (!data?.jobs) return [];

  return data.jobs.map((j) => ({
    id: `ashby:${slug}:${j.id}`,
    ats: "ashby" as const,
    company: slug,
    companySlug: slug,
    title: j.title.trim(),
    location: j.location ?? null,
    remote: REMOTE_RE.test(`${j.location ?? ""} ${j.title}`),
    remoteEligible: j.isRemote === true || REMOTE_RE.test(`${j.location ?? ""} ${j.title}`),
    department: j.department ?? j.team ?? null,
    postedAt: j.publishedAt ?? null,
    url: j.jobUrl ?? j.applyUrl ?? "",
    description: j.descriptionPlain?.slice(0, MAX_DESC) ?? toText(j.descriptionHtml),
    employmentType: j.employmentType ?? null,
    compensation: j.compensation,
  }));
}

// ------------------------------------------------------------------ workable

interface WkJob {
  id?: string;
  shortcode?: string;
  title: string;
  location?: { city?: string; country?: string; workplace?: string } | string;
  department?: string;
  published_on?: string;
  url?: string;
  application_url?: string;
  description?: string;
  type?: string;
}

async function fetchWorkable(slug: string): Promise<Job[]> {
  // NOTE: as of 2026-08-07 this endpoint serves HTML, not JSON, for every
  // account tested. getJson returns null on a parse failure, so this adapter
  // yields nothing rather than misbehaving. Left in place in case it returns.
  const data = await getJson<{ jobs?: WkJob[] } | WkJob[]>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
  );
  const jobs = Array.isArray(data) ? data : (data?.jobs ?? []);
  if (!Array.isArray(jobs)) return [];

  return jobs.map((j) => {
    const loc =
      typeof j.location === "string"
        ? j.location
        : [j.location?.city, j.location?.country].filter(Boolean).join(", ") || null;
    const wp = typeof j.location === "object" ? j.location?.workplace : undefined;
    return {
      id: `workable:${slug}:${j.shortcode ?? j.id ?? j.title}`,
      ats: "workable" as const,
      company: slug,
      companySlug: slug,
      title: j.title.trim(),
      location: loc,
      remote: REMOTE_RE.test(`${loc ?? ""} ${j.title}`),
      remoteEligible: wp === "remote" || REMOTE_RE.test(`${loc ?? ""} ${j.title}`),
      department: j.department ?? null,
      postedAt: j.published_on ?? null,
      url: j.url ?? j.application_url ?? "",
      description: toText(j.description),
      employmentType: j.type ?? null,
    };
  });
}

// ------------------------------------------------------------------ public API

const FETCHERS: Record<Ats, (slug: string) => Promise<Job[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  workable: fetchWorkable,
};

/** Fetch all open roles for one company on one ATS. */
/**
 * All open jobs at one company. With a `prefilter`, systems that can list
 * jobs without their descriptions (Greenhouse) may skip companies -- or jobs
 * -- that fail it, so only use one when the caller filters the same way.
 */
export async function fetchCompany(ats: Ats, slug: string, prefilter?: Prefilter): Promise<Job[]> {
  const jobs = ats === "greenhouse" ? await fetchGreenhouse(slug, prefilter) : await FETCHERS[ats](slug);
  log.debug("ats fetch", { ats, slug, jobs: jobs.length });
  return jobs;
}

/**
 * Probe every ATS for a slug. Companies move between systems, and a slug is
 * usually unique to one of them -- this finds which without being told.
 */
export async function discoverAts(slug: string): Promise<{ ats: Ats; jobs: Job[] } | null> {
  const results = await Promise.all(
    (Object.keys(FETCHERS) as Ats[]).map(async (ats) => ({ ats, jobs: await fetchCompany(ats, slug) })),
  );
  const hit = results.find((r) => r.jobs.length > 0);
  return hit ?? null;
}

/**
 * Fetch many companies with bounded concurrency. We stay deliberately polite:
 * these endpoints are a courtesy, and hammering them is how a source gets
 * closed to everyone.
 */
export async function fetchMany(
  targets: Array<{ ats: Ats; slug: string }>,
  concurrency = 6,
): Promise<{ jobs: Job[]; ok: number; empty: number }> {
  const jobs: Job[] = [];
  let ok = 0;
  let empty = 0;

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((t) => fetchCompany(t.ats, t.slug)));
    for (const r of results) {
      if (r.length > 0) {
        ok++;
        jobs.push(...r);
      } else {
        empty++;
      }
    }
  }
  return { jobs, ok, empty };
}
