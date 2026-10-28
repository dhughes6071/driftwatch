/**
 * Apify Actor entry point -- "Company Career Site Jobs".
 *
 * Pulls open roles directly from companies' own applicant tracking systems via
 * their public JSON job-board APIs (Greenhouse, Lever, Ashby and Workday),
 * normalizes everything into one schema, and pushes results to the dataset.
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
import { REVIEW_ASK, relatedTip } from "./related.ts";
import { fetchCompany, REMOTE_RE, VERIFIED_ATS, type Ats, type Job, type Prefilter } from "./ats.ts";
import { payFor, type PayFields } from "./pay.ts";
import { FREE_PLAN_NOTE, jobLimit } from "./plan.ts";
import { parseCompanyEntry } from "./targets.ts";
import { MONITOR_STORE, SeenJobs, monitorKey, type MonitorState } from "./monitor.ts";
import { WorkdayClient, fetchWorkdaySite, workdaySitesNamed, type Site, type WorkdayJob } from "./workday-source.ts";

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
  /** Return only jobs this same search has not delivered before (for scheduled runs). */
  onlyNewSinceLastRun?: boolean;
  /** Optional label, so two searches with the same filters keep separate histories. */
  monitorName?: string;
}

/** Charged once per job we deliver. Must match the event configured in Apify. */
const EVENT_JOB = "job";

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? {};

  const {
    companies,
    useCuratedList = true,
    maxJobs: requestedMaxJobs = 1000,
    remoteOnly = false,
    titleKeywords = [],
    locationKeywords = [],
    postedWithinDays,
    includeDescription = true,
    onlyWithSalary = false,
    minAnnualSalary,
    salaryCurrencies = [],
    onlyNewSinceLastRun = false,
    monitorName,
  } = input;
  const { limit: maxJobs, freePlanCapped } = jobLimit(requestedMaxJobs, {
    atHome: Actor.isAtHome(),
    userIsPaying: Actor.getEnv().userIsPaying,
  });
  if (freePlanCapped) log.warning(FREE_PLAN_NOTE);
  const currencies = new Set(salaryCurrencies.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const needSalary = onlyWithSalary || !!minAnnualSalary || currencies.size > 0;

  // ---------------------------------------------------------------- targets

  let targets: Target[] = [];

  /** The named companies, normalised, for the "new since last run" key. */
  const companyKeys: string[] = [];
  if (companies?.length) {
    const skipped: string[] = [];
    for (const entry of companies) {
      const t = parseCompanyEntry(entry);
      if ("skip" in t) {
        skipped.push(t.skip);
        continue;
      }
      if ("sites" in t) {
        companyKeys.push(...t.sites.map((s) => `workday:${s.host}/${s.site.toLowerCase()}`));
        targets.push(...t.sites.map((site) => ({ ats: "workday" as const, site })));
        continue;
      }
      companyKeys.push(`${t.ats ?? "*"}:${t.slug}`);
      // A caller may name the ATS (or paste a link that does) or leave it to us to work out.
      targets.push(...(t.ats ? [{ ats: t.ats, slug: t.slug }] : VERIFIED_ATS.map((ats) => ({ ats, slug: t.slug }))));
      // A plain name ("nvidia", "Morgan Stanley") also finds the company's Workday site, if it has one.
      if (!t.ats) targets.push(...workdaySitesNamed(t.slug).map((site) => ({ ats: "workday" as const, site })));
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

  // ---------------------------------------------------------------- new since last run

  const monitor = onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const mKey = monitor
    ? monitorKey(
        {
          companies: companyKeys, useCuratedList, titleKeywords, locationKeywords, remoteOnly, postedWithinDays,
          onlyWithSalary, minAnnualSalary, salaryCurrencies,
        },
        monitorName,
      )
    : null;
  const prevState = monitor && mKey ? await monitor.getValue<MonitorState>(mKey) : null;
  const history = new SeenJobs(prevState);
  let alreadyDelivered = 0;
  let lastSave = 0;
  const saveMonitor = async (force = false) => {
    // Saved as we go (at most every 20 s) so a crash never re-charges for jobs already delivered.
    if (!monitor || !mKey || (!force && Date.now() - lastSave < 20_000)) return;
    lastSave = Date.now();
    await monitor.setValue(mKey, history.toState(prevState));
  };
  if (monitor) {
    log.info(
      prevState
        ? `Returning only jobs this search has not delivered in its ${prevState.runs} earlier run(s).`
        : `First run of this search (${mKey}): returning all current matches and remembering them.`,
    );
  }
  const seen = new Set<string>();
  let pushed = 0;
  let companiesOk = 0;
  let companiesFailed = 0;
  let budgetReached = false;

  /** Boards fetched at once. At 5, a scan of all 3,584 companies took 328 s -- past the 300 s timeout many integrations use. */
  const CONCURRENCY = 20;
  /** Records per pushData call. One call per job took ~35 ms each, so a 125k-job run outlived the 1-hour timeout. */
  const PUSH_BATCH = 500;

  /*
   * Finish before the run's own timeout rather than being killed by it
   * (users were getting TIMED-OUT, 3-4 Oct). Workers stop taking new
   * companies at `softStop`; at `hardStop` the run delivers what it has and
   * ends even if a slow board is still downloading. The caller keeps
   * everything found and gets a SUCCEEDED run that says it stopped early.
   */
  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const runMs = timeoutAt - Date.now();
  const margin = Math.min(45_000, Math.max(8_000, runMs * 0.2));
  const softStop = timeoutAt - margin;
  const hardStop = timeoutAt - margin / 2;
  let timeLimited = false;

  /*
   * Charge and push together. pushData(items, eventName) charges per item as
   * it is stored, and pushes only as many as the caller's spending limit
   * allows, so nobody is billed for a record they did not receive. If the
   * budget runs out mid-run we stop cleanly. Calls are serialised.
   */
  let pending: object[] = [];
  /**
   * Jobs accepted for delivery: pending + being pushed + pushed. maxJobs is
   * enforced on this, not on `pushed`: while a batch is being pushed it is in
   * neither `pending` nor `pushed`, and checking those let a 20,000-job run
   * deliver 32,179 (4 Oct, before charging started; caught in testing).
   */
  let accepted = 0;
  let pushing: Promise<void> = Promise.resolve();
  function flush(): Promise<void> {
    const records = pending;
    pending = [];
    pushing = pushing.then(async () => {
      for (let i = 0; i < records.length && !budgetReached; i += PUSH_BATCH) {
        const chunk = records.slice(i, i + PUSH_BATCH);
        const charge = await Actor.pushData(chunk, EVENT_JOB);
        const delivered = charge?.eventChargeLimitReached ? charge.chargedCount : chunk.length;
        if (charge?.eventChargeLimitReached) {
          budgetReached = true;
          log.info("Caller's charging limit reached -- stopping cleanly.");
        }
        pushed += delivered;
        if (monitor) {
          const at = new Date().toISOString();
          for (const r of chunk.slice(0, delivered)) history.add((r as { id: string }).id, at);
          await saveMonitor();
        }
      }
    });
    return pushing;
  }

  // The title / location / remote / date filters, applied to Greenhouse's light list before descriptions are downloaded.
  const filters = { remoteOnly, titleKeywords, locationKeywords, cutoff };
  const prefilter: Prefilter | undefined =
    remoteOnly || titleKeywords.length || locationKeywords.length || cutoff
      ? (j) => matches({ ...j, remote: REMOTE_RE.test(`${j.location ?? ""} ${j.title}`), remoteEligible: false } as Job, filters)
      : undefined;

  let stopped = false;
  const full = () => stopped || budgetReached || accepted >= maxJobs;
  let next = 0;
  let searched = 0;

  /*
   * Every company gets at most COMPANY_TIMEOUT_MS. On Apify, runs with 20
   * parallel downloads sat at 0% CPU forever on a few requests whose own
   * 10 s abort never fired (4 Oct; never reproduced locally). The race below
   * guarantees progress whatever the network does, and the watchdog names
   * anything slow so it shows up in the log.
   */
  const COMPANY_TIMEOUT_MS = 60_000; // the biggest boards (Databricks, Zscaler) need ~30 s to parse on a 1 GB run's quarter CPU
  const inflight = new Map<string, number>();
  const watchdog = setInterval(() => {
    const slow = [...inflight].filter(([, at]) => Date.now() - at > COMPANY_TIMEOUT_MS).map(([k]) => k);
    if (slow.length) log.warning(`Still waiting on ${slow.length} job board(s): ${slow.slice(0, 5).join(", ")}`);
  }, 30_000);
  watchdog.unref();
  const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} took over ${ms / 1000} s`)), ms).unref()),
    ]);

  /** Run one job through the filters and queue it for delivery. True when it was taken. */
  function consider(job: Job | WorkdayJob): boolean {
    if (full()) return false;

    // A slug probed across several ATSs can yield the same role twice.
    if (seen.has(job.id)) return false;
    seen.add(job.id);

    if (!matches(job, filters)) return false;

    // Pay is read from the list response (description + structured pay data), so it costs no extra request.
    // Workday's is read from the description already fetched, using the job's country.
    const pay = "pay" in job ? job.pay : payFor(job);
    if (needSalary && !payMatches(pay, minAnnualSalary, currencies)) return false;
    // Delivered by an earlier run of this search.
    if (monitor && history.has(job.id)) {
      alreadyDelivered++;
      return false;
    }

    const { compensation: _internal, pay: _pay, ...pub } = job as Job & { pay?: unknown };
    pending.push(includeDescription ? { ...pub, ...pay } : { ...pub, description: undefined, ...pay });
    accepted++;
    return true;
  }

  // One client for every Workday site, so the whole run keeps to Workday's per-IP rate limit.
  const workday = new WorkdayClient();
  const workdayFilters = { titleKeywords, locationKeywords, remoteOnly, postedWithinDays, needSalary, includeDescription };

  async function worker() {
    while (!full()) {
      if (Date.now() > softStop) {
        timeLimited = true;
        return;
      }
      const t = targets[next++];
      if (!t) return;

      if ("site" in t) {
        // No per-site timeout: a big Workday site legitimately takes minutes, every request has its
        // own 30 s timeout and retry limit, and the run's soft and hard stops end it in time.
        const key = `workday/${t.site.tenant}/${t.site.site}`;
        inflight.set(key, Date.now());
        let listed = 0;
        try {
          listed = await fetchWorkdaySite(workday, t.site, workdayFilters, {
            wanted: () => maxJobs - accepted,
            stopped: full,
            deliver: consider,
            afterBatch: async () => {
              if (pending.length >= PUSH_BATCH) await flush();
            },
          });
        } catch (err) {
          log.warning(`${key} failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          inflight.delete(key);
        }
        searched++;
        if (listed) companiesOk++;
        else companiesFailed++;
        continue;
      }

      let jobs: Job[] = [];
      const key = `${t.ats}/${t.slug}`;
      inflight.set(key, Date.now());
      try {
        jobs = await withTimeout(fetchCompany(t.ats, t.slug, prefilter), COMPANY_TIMEOUT_MS, key);
      } catch (err) {
        // Fail soft. One bad company must never sink the run.
        log.warning(`${key} failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        inflight.delete(key);
      }
      searched++;
      if (jobs.length === 0) {
        companiesFailed++;
        continue;
      }
      companiesOk++;

      for (const job of jobs) {
        if (full()) break;
        consider(job);
      }
      if (pending.length >= PUSH_BATCH) await flush();
      if (searched % 200 === 0) log.info(`progress: ${accepted}/${maxJobs} jobs, ${searched}/${targets.length} boards searched`);
    }
  }

  const scan = Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const outOfTime = new Promise<"time">((res) => {
    const ms = hardStop - Date.now();
    if (Number.isFinite(ms)) setTimeout(() => res("time"), Math.max(0, ms)).unref();
  });
  if ((await Promise.race([scan, outOfTime])) === "time") timeLimited = true;
  stopped = true; // boards still downloading after a hard stop are dropped, not delivered half-way
  clearInterval(watchdog);
  await flush();
  if (timeLimited) {
    log.warning(
      `Stopped early to finish inside this run's time limit: searched ${searched} of ${targets.length} company boards. ` +
        `Give the run a longer timeout to search them all.`,
    );
  }

  if (companies?.length && companiesOk === 0 && targets.length) {
    const slugs = [...new Set(targets.map((t) => ("site" in t ? t.site.tenant : t.slug)))].slice(0, 10).join(", ");
    log.warning(
      `None of these companies has a public Greenhouse, Lever, Ashby or Workday job board we could read: ${slugs}. ` +
        `Check the company's careers page and paste the job-board link instead (e.g. jobs.lever.co/{slug} or {company}.wd5.myworkdayjobs.com/{site}).`,
    );
  }

  // ---------------------------------------------------------------- summary

  await saveMonitor(true);

  await Actor.setValue("SUMMARY", {
    jobsReturned: pushed,
    ...(monitor ? { newSinceLastRun: { monitorKey: mKey, firstRun: !prevState, alreadyDeliveredSkipped: alreadyDelivered } } : {}),
    companiesWithJobs: companiesOk,
    companiesEmptyOrUnreachable: companiesFailed,
    stoppedBecause: budgetReached
      ? "charging_limit"
      : pushed >= maxJobs
        ? (freePlanCapped ? "free_plan_limit" : "maxJobs")
        : timeLimited ? "time_limit" : "completed",
    ...(freePlanCapped && pushed >= maxJobs ? { freePlan: FREE_PLAN_NOTE } : {}),
    filters: { remoteOnly, titleKeywords, locationKeywords, postedWithinDays, onlyWithSalary, minAnnualSalary, salaryCurrencies },
    tip: relatedTip(titleKeywords),
    ...(pushed > 0 ? { review: REVIEW_ASK } : {}),
    finishedAt: new Date().toISOString(),
  });

  log.info(
    `Done. ${pushed} jobs from ${companiesOk} companies ` +
      `(${companiesFailed} empty or unreachable).`,
  );
  log.info(`Tip: ${relatedTip(titleKeywords)}`);
  if (pushed > 0) log.info(REVIEW_ASK);
  const hitFreeCap = freePlanCapped && pushed >= maxJobs;
  if (hitFreeCap) log.warning(FREE_PLAN_NOTE);
  await Actor.exit(
    hitFreeCap
      ? FREE_PLAN_NOTE
      : timeLimited
        ? `Stopped early to stay inside the run's time limit: ${pushed} jobs delivered. Use a longer timeout to search every company.`
        : pushed > 0 ? `${pushed} jobs delivered. ${REVIEW_ASK}` : undefined,
  );
} catch (err) {
  // Actor.fail marks the run FAILED with the reason; exiting normally here
  // used to report crashed runs as SUCCEEDED (found 3 Oct 2026).
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}

// ------------------------------------------------------------------ helpers

/** What a run fetches: a Greenhouse / Lever / Ashby board, or one Workday career site. */
type Target = { ats: Ats; slug: string } | { ats: "workday"; site: Site };

function matches(
  job: Job | WorkdayJob,
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
    // Titles use the same rule as locations: keywords of 3 characters or fewer
    // ("RN", "QA", "PM") match whole words only -- as substrings "RN" matched
    // "External" and "Vernon" (found 7 Oct 2026).
    if (!locationMatcher(f.titleKeywords)(t)) return false;
  }

  if (f.locationKeywords.length) {
    // Workday jobs can list several locations; any of them counts.
    const l = [job.location ?? "", ...("additionalLocations" in job ? job.additionalLocations : [])].join(" | ").toLowerCase();
    if (!locationMatcher(f.locationKeywords)(l)) return false;
  }

  if (f.cutoff && job.postedAt) {
    const ts = Date.parse(job.postedAt);
    // Keep undated roles rather than silently dropping them. A date with no time
    // (Workday's) gets a day's grace, or a role posted on the cutoff day is dropped.
    const grace = /^\d{4}-\d{2}-\d{2}$/.test(job.postedAt) ? 86_400_000 : 0;
    if (Number.isFinite(ts) && ts < f.cutoff - grace) return false;
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
