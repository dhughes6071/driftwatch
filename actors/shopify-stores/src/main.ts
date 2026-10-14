/**
 * Apify Actor entry point -- "Shopify Store Leads".
 *
 * Searches our index of live Shopify stores, found by DNS and re-checked
 * about every two weeks on the owner's machine (see crawler/), and returns one record
 * per store: name, location, currency, shipping countries, catalog size and
 * prices, recent product activity, theme, apps, and the contact details the
 * store publishes. The index is read through a signed, read-only link.
 *
 * MONETIZATION: pay-per-event, one `store` event per store delivered. Filters
 * run before charging, and a caller's charging limit stops the run cleanly.
 */
import { Actor, log } from "apify";
import type { Manifest } from "./format.ts";
import { httpFetcher, search, type Query } from "./search.ts";
import { MONITOR_STORE, monitorKey, type MonitorState } from "./monitor.ts";

interface Input extends Partial<Query> {
  onlyNewSinceLastRun?: boolean;
  monitorName?: string;
}

/** Charged once per store delivered. Must match the event configured in Apify. */
const EVENT = "store";
const PUSH_BATCH = 200;

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? {};
  const { onlyNewSinceLastRun, monitorName, ...rest } = input;
  const q: Query = { ...rest, maxResults: input.maxResults ?? 500 };

  // Signed read-only link to the index, injected as an encrypted Actor secret
  // (never in source: this repository is public, and the link unlocks the index).
  const manifestUrl = process.env.SHOPIFY_MANIFEST_URL;
  if (!manifestUrl) throw new Error("SHOPIFY_MANIFEST_URL is not configured.");
  const manifest = JSON.parse(new TextDecoder().decode(await httpFetcher(manifestUrl))) as Manifest;
  const ageHours = (Date.now() - Date.parse(manifest.indexedAt)) / 3_600_000;
  log.info(`Index: ${manifest.totalStores.toLocaleString()} live Shopify stores in ${Object.keys(manifest.byCountry).length} countries, published ${ageHours.toFixed(1)} h ago`);
  if (ageHours > 96) log.warning("The index is more than 4 days old.");

  // New since last run: only stores the index found after this search last ran.
  const monitor = onlyNewSinceLastRun ? await Actor.openKeyValueStore(MONITOR_STORE) : null;
  const { maxResults: _m, sortBy: _s, ...filters } = q;
  const mKey = monitor ? monitorKey(filters as Record<string, unknown>, monitorName) : null;
  const prev = monitor && mKey ? await monitor.getValue<MonitorState>(mKey) : null;
  if (monitor) {
    if (!prev) log.info(`First run of this search (${mKey}): returning current matches and remembering where it left off.`);
    else if (prev.seenThrough >= manifest.indexedAt) log.info(`No new index since this search last ran (${prev.lastRunAt}); nothing new to return.`);
    else log.info(`Returning only stores found since this search last ran (index of ${prev.seenThrough}).`);
    if (prev) q.seenAfter = prev.seenThrough;
  }

  const timeoutAt = Actor.getEnv().timeoutAt?.getTime() ?? Infinity;
  const deadline = timeoutAt - Math.min(45_000, Math.max(8_000, (timeoutAt - Date.now()) * 0.25));
  const { stores, matched, shardsRead, timeLimited } = await search(manifest, q, httpFetcher, Date.now(), deadline);
  if (timeLimited) log.warning(`Stopped reading early to finish inside this run's time limit (${shardsRead} of ${manifest.shards.length} index shards). Give the run a longer timeout for complete results.`);
  log.info(`${matched.toLocaleString()} matching stores${q.sortBy && q.sortBy !== "newestFound" ? "" : " (counting stops once enough are found)"}; delivering ${stores.length}.`);

  let pushed = 0;
  let budgetReached = false;
  for (let i = 0; i < stores.length && !budgetReached; i += PUSH_BATCH) {
    const batch = stores.slice(i, i + PUSH_BATCH).map((s) => ({ ...s, indexedAt: manifest.indexedAt }));
    const charge = await Actor.pushData(batch, EVENT);
    // At the limit the SDK keeps only the items it could charge for.
    pushed += charge?.eventChargeLimitReached ? (charge.chargedCount ?? batch.length) : batch.length;
    if (charge?.eventChargeLimitReached) {
      budgetReached = true;
      log.info("Charging limit reached -- stopping cleanly with everything delivered so far.");
    }
  }

  const stoppedBecause = budgetReached ? "charging_limit" : timeLimited ? "time_limit" : pushed >= q.maxResults ? "maxResults" : "completed";
  if (monitor && mKey && !timeLimited) {
    if (stoppedBecause !== "completed") log.warning(`Stopped at ${stoppedBecause}; stores past the limit are skipped from now on. Raise maxResults to receive them all.`);
    await monitor.setValue(mKey, {
      seenThrough: prev && prev.seenThrough > manifest.indexedAt ? prev.seenThrough : manifest.indexedAt,
      lastRunAt: new Date().toISOString(),
      runs: (prev?.runs ?? 0) + 1,
    } satisfies MonitorState);
  }

  await Actor.setValue("SUMMARY", {
    storesReturned: pushed,
    storesMatched: matched,
    stoppedBecause,
    ...(monitor ? { newSinceLastRun: { monitorKey: mKey, since: prev?.seenThrough ?? null, firstRun: !prev } } : {}),
    indexedAt: manifest.indexedAt,
    indexSize: manifest.totalStores,
    query: q,
    finishedAt: new Date().toISOString(),
  });
  log.info(`Done. ${pushed} stores delivered.`);
  await Actor.exit(timeLimited ? `Stopped early to stay inside the run's time limit: ${pushed} stores delivered.` : undefined);
} catch (err) {
  // Actor.fail marks the run FAILED with the reason, instead of a misleading SUCCEEDED.
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`Actor failed: ${msg}`);
  await Actor.fail(msg);
}
