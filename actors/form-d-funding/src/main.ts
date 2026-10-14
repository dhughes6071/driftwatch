/**
 * Apify Actor entry point -- "Recently Funded Companies (SEC Form D)".
 *
 * Lists Form D filings through SEC EDGAR's public search API, newest first,
 * downloads each filing's XML and turns it into one flat record: the company,
 * its address and phone, the amount raised, the round's securities, and the
 * executives named on the form.
 *
 * MONETIZATION: pay-per-event, one `filing` event per record delivered.
 * Filters run BEFORE charging, so filtered-out filings are never billed, and
 * a caller's charging limit stops the run cleanly.
 *
 * COST CONTROL (ours): every filter the search hit can answer (date, state,
 * new vs amendment, company name, already delivered) runs before the XML
 * download. Sector, fund and amount filters need the XML.
 */
import { Actor, log } from "apify";
import { EdgarClient, addDays, isoDay, type Hit } from "./edgar.ts";
import { SECTORS, parseFiling, type Filing } from "./formd.ts";
import { MONITOR_STORE, SeenFilings, monitorKey, type MonitorState } from "./monitor.ts";

interface Input {
  /** Filings from the last N days (ignored when filedFrom is set). */
  daysBack?: number;
  /** Optional exact range, YYYY-MM-DD. */
  filedFrom?: string;
  filedTo?: string;
  /** "companies" (default) leaves out investment funds; "funds" keeps only them; "all" keeps both. */
  companyType?: "companies" | "funds" | "all";
  sectors?: string[];
  /** US state codes (or EDGAR country codes) of the company's business address. */
  states?: string[];
  companyKeywords?: string[];
  /** Only filings reporting at least this much already raised, in USD. */
  minAmountRaised?: number;
  /** Only rounds whose target is at least this much, in USD. */
  minOfferingAmount?: number;
  /** Only companies incorporated in the last N years. */
  incorporatedWithinYears?: number;
  includeAmendments?: boolean;
  /** One record per company: its newest matching filing. */
  latestPerCompany?: boolean;
  onlyNewSinceLastRun?: boolean;
  monitorName?: string;
  maxResults?: number;
}

/** Charged once per filing delivered. Must match the event configured in Apify. */
const EVENT = "filing";
/** XML downloads in flight at once; the rate limiter keeps the total under SEC's limit. */
const BATCH = 16;

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? {};
  const {
    daysBack = 7,
    filedFrom,
    filedTo,
    companyType = "companies",
    sectors = [],
    states = [],
    companyKeywords = [],
    minAmountRaised,
    minOfferingAmount,
    incorporatedWithinYears,
    includeAmendments = false,
    latestPerCompany = true,
    onlyNewSinceLastRun = false,
    monitorName,
    maxResults = 200,
  } = input;

  // ---------------------------------------------------------------- range and filters

  const today = isoDay(new Date());
  const day = /^\d{4}-\d{2}-\d{2}$/;
  for (const [k, v] of [["filedFrom", filedFrom], ["filedTo", filedTo]] as const) {
    // The round trip catches impossible dates such as 2026-09-31.
    if (v && (!day.test(v.trim()) || isoDay(new Date(v.trim() + "T00:00:00Z")) !== v.trim())) {
      throw new Error(`\`${k}\` must be a real date like 2026-10-01, got "${v}".`);
    }
  }
  const to = filedTo?.trim() || today;
  const from = filedFrom?.trim() || addDays(to, -(Math.max(1, Math.min(365, daysBack)) - 1));
  if (from > to) throw new Error(`\`filedFrom\` (${from}) is after \`filedTo\` (${to}).`);

  const sectorSet = new Set(sectors.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const unknownSectors = [...sectorSet].filter((s) => !SECTORS.some((x) => x.toLowerCase() === s));
  if (unknownSectors.length) log.warning(`Unknown sector(s) ignored: ${unknownSectors.join(", ")}. Choose from: ${SECTORS.join(", ")}.`);
  const locations = [...new Set(states.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const nameKw = companyKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const minYear = incorporatedWithinYears ? new Date().getUTCFullYear() - incorporatedWithinYears : null;

  log.info(
    `Form D filings ${from} to ${to}` +
      (locations.length ? ` in ${locations.join(", ")}` : "") +
      ` -- ${companyType === "funds" ? "investment funds only" : companyType === "all" ? "companies and funds" : "operating companies (funds left out)"}` +
      `, up to ${maxResults} results`,
  );

  /** Decide from the search hit alone, before downloading anything. */
  function preFilter(h: Hit): boolean {
    if (!includeAmendments && h.form !== "D") return false;
    if (nameKw.length && !nameKw.some((k) => h.name.toLowerCase().includes(k))) return false;
    return true;
  }

  function finalFilter(f: Filing): boolean {
    if (!includeAmendments && f.filingType === "Amendment") return false;
    if (companyType === "companies" && f.isFund) return false;
    if (companyType === "funds" && !f.isFund) return false;
    if (sectorSet.size && !sectorSet.has((f.sector ?? "").toLowerCase()) && !sectorSet.has((f.industry ?? "").toLowerCase())) return false;
    if (minAmountRaised && (f.totalAmountSold ?? 0) < minAmountRaised) return false;
    if (minOfferingAmount && !f.offeringAmountIndefinite && (f.totalOfferingAmount ?? 0) < minOfferingAmount) return false;
    if (minYear !== null) {
      if (f.yearOfIncorporation != null) {
        if (f.yearOfIncorporation < minYear) return false;
      } else if (!(f.incorporatedWithin === "Within five years" && incorporatedWithinYears! >= 5) && f.incorporatedWithin !== "Yet to be formed") {
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- new since last run

  const monitor = onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const mKey = monitor
    ? monitorKey(
        {
          // The date window slides on every scheduled run, so it is not part of the identity.
          companyType, sectors, states, companyKeywords, minAmountRaised, minOfferingAmount,
          incorporatedWithinYears, includeAmendments, latestPerCompany,
        },
        monitorName,
      )
    : null;
  const prevState = monitor && mKey ? await monitor.getValue<MonitorState>(mKey) : null;
  const history = new SeenFilings(prevState);
  let alreadyDelivered = 0;
  const saveMonitor = async () => {
    if (monitor && mKey) await monitor.setValue(mKey, history.toState(prevState));
  };
  if (monitor) {
    log.info(
      prevState
        ? `Returning only filings this search has not delivered in its ${prevState.runs} earlier run(s).`
        : `First run of this search (${mKey}): returning all current matches and remembering them.`,
    );
  }

  // ---------------------------------------------------------------- fetch

  const client = new EdgarClient();
  const companies = new Set<string>();
  let scanned = 0;
  let downloaded = 0;
  let missing = 0;
  let pushed = 0;
  let budgetReached = false;
  const pending: Hit[] = [];

  // Finish inside the run's own time limit.
  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const softStop = timeoutAt - Math.min(45_000, Math.max(8_000, (timeoutAt - Date.now()) * 0.2));
  let timeLimited = false;
  const outOfTime = () => (Date.now() > softStop ? (timeLimited = true) : false);
  const done = () => pushed >= maxResults || budgetReached || outOfTime();

  /** Download, parse, filter and deliver the queued hits, newest first. */
  async function flush() {
    const batch = pending.splice(0);
    const results = await Promise.all(
      batch.map(async (h) => {
        const xml = await client.filingXml(h);
        if (xml == null) return null;
        downloaded++;
        try {
          return parseFiling(xml, h);
        } catch (err) {
          log.warning(`Could not read filing ${h.accessionNumber}: ${String(err)}`);
          return null;
        }
      }),
    );
    const out: Filing[] = [];
    for (let i = 0; i < batch.length; i++) {
      const f = results[i];
      if (!f) {
        missing++;
        continue;
      }
      if (!finalFilter(f)) continue;
      if (latestPerCompany && companies.has(f.cik)) continue;
      if (pushed + out.length >= maxResults) break;
      companies.add(f.cik);
      out.push(f);
    }
    if (!out.length) return;
    const charge = await Actor.pushData(out, EVENT);
    pushed += out.length;
    if (monitor) {
      const at = new Date().toISOString();
      for (const f of out) history.add(f.accessionNumber, at);
      await saveMonitor();
    }
    if (charge?.eventChargeLimitReached) {
      budgetReached = true;
      log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
    }
  }

  await client.search(
    { from, to, locations },
    async (h) => {
      if (done()) return true;
      scanned++;
      if (monitor && history.has(h.accessionNumber)) return void alreadyDelivered++;
      if (!preFilter(h)) return;
      // Newest first: a company already delivered has nothing newer to add.
      if (latestPerCompany && companies.has(h.cik)) return;
      pending.push(h);
      if (pending.length >= BATCH) {
        await flush();
        if (scanned % 500 < BATCH) log.info(`Scanned ${scanned} filings, delivered ${pushed}`);
      }
      return done();
    },
    (w) => log.warning(w),
  );
  if (!done()) await flush();

  // ---------------------------------------------------------------- summary

  await saveMonitor();
  const stoppedBecause = budgetReached ? "charging_limit" : pushed >= maxResults ? "maxResults" : timeLimited ? "time_limit" : "completed";
  await Actor.setValue("SUMMARY", {
    filingsReturned: pushed,
    filingsScanned: scanned,
    filingsDownloaded: downloaded,
    filingsUnavailable: missing,
    secRequests: client.requests,
    dateRange: { from, to },
    stoppedBecause,
    ...(monitor ? { newSinceLastRun: { monitorKey: mKey, firstRun: !prevState, alreadyDeliveredSkipped: alreadyDelivered } } : {}),
    filters: {
      companyType, sectors, states: locations, companyKeywords, minAmountRaised, minOfferingAmount,
      incorporatedWithinYears, includeAmendments, latestPerCompany,
    },
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} filings delivered from ${scanned} scanned (${from} to ${to}).`);
  if (timeLimited) {
    log.warning("Stopped early to finish inside this run's time limit. Give the run a longer timeout, or a shorter date range, for complete results.");
  }
  await Actor.exit(timeLimited ? `Stopped early to stay inside the run's time limit: ${pushed} filings delivered.` : undefined);
} catch (err) {
  // Actor.fail marks the run FAILED with the reason, instead of a misleading SUCCEEDED.
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}
