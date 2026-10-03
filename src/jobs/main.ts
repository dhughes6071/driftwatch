/**
 * Apify Actor entry point -- "Company Career Site Jobs".
 *
 * Pulls open roles directly from companies' own applicant tracking systems via
 * their public JSON job-board APIs, normalizes everything into one schema, and
 * pushes results to the dataset.
 *
 * MONETIZATION: pay-per-event. We charge per job returned, and only for jobs
 * we actually deliver. Charging is checked against the caller's budget BEFORE
 * we push, so a user can never be billed past their limit.
 *
 * WHY THIS BEATS THE INCUMBENTS: they scrape HTML and sit at 3.6-4.0 stars
 * because markup changes break them. We read documented JSON APIs built for
 * syndication. Reliability is the whole pitch, so this code fails soft --
 * one unreachable company never sinks a run.
 */
import { Actor, log } from "apify";
import { fetchCompany, VERIFIED_ATS, type Ats, type Job } from "./ats.ts";
import { payFor, type PayFields } from "./pay.ts";
import { parseCompanyEntry } from "./targets.ts";

interface Input {
  /**
   * Explicit companies to fetch. Takes precedence over `useCuratedList`.
   * [{ slug, ats? }], plain names, or job-board links (see targets.ts).
   */
  companies?: unknown[];
  /** Use our verified registry of companies instead of naming them. */
  useCuratedList?: boolean;
  /** Cap on results. Also the main cost control for the caller. */
  maxJobs?: number;
  /** Only return roles flagged remote. */
  remoteOnly?: boolean;
  /** Case-insensitive substrings matched against the title. */
  titleKeywords?: string[];
  /** Case-insensitive substrings matched against the location. */
  locationKeywords?: string[];
  /** Only roles posted within this many days. */
  postedWithinDays?: number;
  /** Include the full job description. Off keeps datasets small and fast. */
  includeDescription?: boolean;
  /** Only roles that state pay. */
  onlyWithSalary?: boolean;
  /** Only roles whose annualised top of range reaches this, in the job's own currency. */
  minAnnualSalary?: number;
  /** Only roles paying in these currencies, e.g. ["USD"]. */
  salaryCurrencies?: string[];
}

/** Charged once per job we deliver. Must match the event configured in Apify. */
const EVENT_JOB = "job";

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? {};

  const {
    companies,
    useCuratedList = true,
    maxJobs = 1000,
    remoteOnly = false,
    titleKeywords = [],
    locationKeywords = [],
    postedWithinDays,
    includeDescription = true,
    onlyWithSalary = false,
    minAnnualSalary,
    salaryCurrencies = [],
  } = input;
  const currencies = new Set(salaryCurrencies.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const needSalary = onlyWithSalary || !!minAnnualSalary || currencies.size > 0;

  // ---------------------------------------------------------------- targets

  let targets: Array<{ ats: Ats; slug: string }> = [];

  if (companies?.length) {
    const skipped: string[] = [];
    for (const entry of companies) {
      const t = parseCompanyEntry(entry);
      if ("skip" in t) skipped.push(t.skip);
      // A caller may name the ATS (or paste a link that does) or leave it to us to work out.
      else targets.push(...(t.ats ? [{ ats: t.ats, slug: t.slug }] : VERIFIED_ATS.map((ats) => ({ ats, slug: t.slug }))));
    }
    if (skipped.length) {
      log.warning(
        `Skipped ${skipped.length} of ${companies.length} companies: ${skipped.slice(0, 5).join("; ")}. ` +
          `Use a name ("stripe"), a job-board link, or {"slug": "stripe", "ats": "greenhouse"}.`,
      );
    }
    log.info(`Fetching ${companies.length - skipped.length} caller-specified companies`);
  } else if (useCuratedList) {
    targets = await loadCuratedTargets();
    log.info(`Fetching ${targets.length} companies from the curated registry`);
  } else {
    throw new Error(
      "Provide `companies`, or set `useCuratedList` to true to use the built-in verified company list.",
    );
  }

  if (targets.length === 0) throw new Error("No companies to fetch.");

  // ---------------------------------------------------------------- fetch

  const cutoff = postedWithinDays ? Date.now() - postedWithinDays * 86_400_000 : null;
  const seen = new Set<string>();
  let pushed = 0;
  let companiesOk = 0;
  let companiesFailed = 0;
  let budgetReached = false;

  const CONCURRENCY = 5;
  /** Records per pushData call. One call per job took ~35 ms each, so a 125k-job run outlived the 1-hour timeout. */
  const PUSH_BATCH = 500;

  /*
   * Charge and push together. pushData(items, eventName) charges per item as
   * it is stored, and pushes only as many as the caller's spending limit
   * allows, so nobody is billed for a record they did not receive. If the
   * budget runs out mid-run we stop cleanly.
   */
  async function deliver(records: object[]) {
    for (let i = 0; i < records.length && !budgetReached; i += PUSH_BATCH) {
      const chunk = records.slice(i, i + PUSH_BATCH);
      const charge = await Actor.pushData(chunk, EVENT_JOB);
      if (charge?.eventChargeLimitReached) {
        pushed += charge.chargedCount;
        budgetReached = true;
        log.info("Caller's charging limit reached -- stopping cleanly.");
      } else pushed += chunk.length;
    }
  }

  for (let i = 0; i < targets.length && pushed < maxJobs && !budgetReached; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (t) => {
        try {
          return { t, jobs: await fetchCompany(t.ats, t.slug) };
        } catch (err) {
          // Fail soft. One bad company must never sink the run.
          log.warning(`${t.ats}/${t.slug} failed: ${String(err)}`);
          return { t, jobs: [] as Job[] };
        }
      }),
    );

    for (const { t, jobs } of results) {
      if (jobs.length === 0) {
        companiesFailed++;
        continue;
      }
      companiesOk++;

      const batch: object[] = [];
      for (const job of jobs) {
        if (pushed + batch.length >= maxJobs) break;

        // A slug probed across several ATSs can yield the same role twice.
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        if (!matches(job, { remoteOnly, titleKeywords, locationKeywords, cutoff })) continue;

        // Pay is read from the list response (description + Ashby's pay data), so it costs no extra request.
        const pay = payFor(job);
        if (needSalary && !payMatches(pay, minAnnualSalary, currencies)) continue;

        const { compensation: _internal, ...pub } = job;
        const record = includeDescription ? { ...pub, ...pay } : { ...pub, description: undefined, ...pay };

        batch.push(record);
      }
      await deliver(batch);
      if (budgetReached) break;
    }

    log.info(`progress: ${pushed}/${maxJobs} jobs from ${companiesOk} companies`);
  }

  if (companies?.length && companiesOk === 0 && targets.length) {
    const slugs = [...new Set(targets.map((t) => t.slug))].slice(0, 10).join(", ");
    log.warning(
      `None of these companies has a public Greenhouse, Lever or Ashby job board: ${slugs}. ` +
        `Check the slug on the company's careers page (e.g. jobs.lever.co/{slug}), or paste that link instead.`,
    );
  }

  // ---------------------------------------------------------------- summary

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    companiesWithJobs: companiesOk,
    companiesEmptyOrUnreachable: companiesFailed,
    stoppedBecause: budgetReached ? "charging_limit" : pushed >= maxJobs ? "maxJobs" : "completed",
    filters: { remoteOnly, titleKeywords, locationKeywords, postedWithinDays, onlyWithSalary, minAnnualSalary, salaryCurrencies },
    finishedAt: new Date().toISOString(),
  });

  log.info(
    `Done. ${pushed} jobs from ${companiesOk} companies ` +
      `(${companiesFailed} empty or unreachable).`,
  );
  await Actor.exit();
} catch (err) {
  // Actor.fail marks the run FAILED with the reason; exiting normally here
  // used to report crashed runs as SUCCEEDED (found 3 Oct 2026).
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}

// ------------------------------------------------------------------ helpers

function matches(
  job: Job,
  f: {
    remoteOnly: boolean;
    titleKeywords: string[];
    locationKeywords: string[];
    cutoff: number | null;
  },
): boolean {
  // Accept either signal: `remote` is location-derived and precise,
  // `remoteEligible` is the company's own flag and broader. Both ship in the
  // record so a caller can tighten this themselves.
  if (f.remoteOnly && !job.remote && !job.remoteEligible) return false;

  if (f.titleKeywords.length) {
    const t = job.title.toLowerCase();
    if (!f.titleKeywords.some((k) => t.includes(k.toLowerCase()))) return false;
  }

  if (f.locationKeywords.length) {
    const l = (job.location ?? "").toLowerCase();
    if (!locationMatcher(f.locationKeywords)(l)) return false;
  }

  if (f.cutoff && job.postedAt) {
    const ts = Date.parse(job.postedAt);
    // Keep undated roles rather than silently dropping them.
    if (Number.isFinite(ts) && ts < f.cutoff) return false;
  }

  return true;
}

function payMatches(pay: PayFields, minAnnual: number | undefined, currencies: Set<string>): boolean {
  if (pay.salaryAnnualMax == null) return false;
  if (minAnnual && pay.salaryAnnualMax < minAnnual) return false;
  if (currencies.size && !currencies.has(pay.salaryCurrency ?? "")) return false;
  return true;
}

/**
 * Load the curated company registry that ships with the Actor image.
 *
 * Reads a plain JSON file rather than the SQLite database on purpose:
 *
 *  1. `apify push` honours .gitignore, which excludes `data/` -- the database
 *     never reached the build context, and the first push failed on exactly
 *     this (2026-08-08).
 *  2. Shipping JSON means the Actor image needs no native SQLite module at
 *     all, removing a compile step that could break the build.
 *
 * `scripts/discover-companies.ts` writes the database; `npm run jobs:export`
 * turns it into this file. The database stays the working store, the JSON is
 * the shipped artifact.
 */
async function loadCuratedTargets(): Promise<Array<{ ats: Ats; slug: string }>> {
  try {
    const { readFile } = await import("node:fs/promises");
    const url = new URL("./companies.json", import.meta.url);
    const rows = JSON.parse(await readFile(url, "utf8")) as Array<{ ats: Ats; slug: string }>;
    if (rows.length) return rows.map((r) => ({ ats: r.ats, slug: r.slug }));
  } catch (err) {
    log.warning(`Curated registry unavailable (${String(err)}); falling back to the seed list.`);
  }

  const { SEED_COMPANIES } = await import("./seed.ts");
  return SEED_COMPANIES.flatMap((name) =>
    VERIFIED_ATS.map((ats) => ({ ats, slug: name.toLowerCase().replace(/[^a-z0-9]/g, "") })),
  );
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
