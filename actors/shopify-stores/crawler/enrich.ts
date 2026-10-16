/**
 * Check stores and record what they publicly show -- runs on the Mac mini.
 *
 *   node --experimental-strip-types actors/shopify-stores/crawler/enrich.ts --hours 5
 *
 * For each store that is due (new ones first, then the longest unchecked):
 *   robots.txt -> /meta.json -> homepage -> /pages/contact (only if the
 *   homepage had no email or phone) -> /products.json page 1
 * and stores one StoreRecord per live store. Live stores are re-checked about
 * every two weeks; closed, password-protected and non-Shopify domains less often.
 *
 * Politeness: every store is a different site, but they all sit behind
 * Shopify's edge, which sees one IP. Measured 14 Oct 2026: 20 stores at a
 * time (~26 requests/s) drew zero refusals for 3 minutes, but sustained runs
 * did -- so requests are capped per second (default 8). If refusals (429/430/403) pass
 * 10% of recent responses the crawler pauses and halves its pace, and if they
 * stay high it stops for the night -- an IP block would cost far more than a
 * slower crawl.
 */
import type { StoreRecord } from "../src/format.ts";
import { finishRun, log, openDb, startRun, type Db, type Status } from "./db.ts";
import { mergePages, parseMeta, parsePage, parseProducts, robotsAllows, type PageFacts } from "./extract.ts";

export const USER_AGENT = "Mozilla/5.0 (compatible; CMMResearchBot/1.0; +mailto:chazmichael_michaels@icloud.com)";
const DAY = 86_400_000;
/** Days until the next check, by outcome. */
const RECHECK: Record<Status, number> = { new: 0, live: 14, password: 21, closed: 45, not_shopify: 90, robots: 60, error: 21 };
/** robots.txt rarely changes; re-read it monthly. */
const ROBOTS_DAYS = 30;

export interface Http {
  get(url: string): Promise<{ status: number | "ERR"; body: string; finalUrl: string }>;
}

/**
 * Spaces requests evenly so the whole crawl stays under `perSecond`. Measured
 * 14 Oct 2026: ~26 requests/s for 3 minutes drew no refusals, but sustained
 * for 10 minutes it did (Shopify's edge limits one IP's request rate), so the
 * cap is on requests, not just on stores in flight.
 */
export class RateLimiter {
  private next = 0;
  perSecond: number;
  constructor(perSecond: number) {
    this.perSecond = perSecond;
  }
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + 1000 / this.perSecond;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

export function limitedHttp(inner: Http, limiter: RateLimiter): Http {
  return {
    async get(url) {
      await limiter.wait();
      return inner.get(url);
    },
  };
}

export const fetchHttp: Http = {
  async get(url) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      // Homepages can be several MB and the facts we want are near the top, so HTML
      // is cut at 1.5 MB. JSON is kept whole: a cut products.json can't be parsed,
      // and 250 products with descriptions often run past 1.5 MB (found 15 Oct 2026,
      // when a third of stores had lost their catalog data this way).
      const text = res.ok ? await res.text() : (await res.body?.cancel(), "");
      const isJson = /json/i.test(res.headers.get("content-type") ?? "") || new URL(url).pathname.endsWith(".json");
      const body = isJson ? text.slice(0, 30_000_000) : text.slice(0, 1_500_000);
      return { status: res.status, body, finalUrl: res.url };
    } catch {
      return { status: "ERR", body: "", finalUrl: url };
    }
  },
};

/** Watches recent responses and decides when to slow down or stop. */
export class Throttle {
  private window: boolean[] = [];
  private badWindows = 0;
  limit: number;
  pausedUntil = 0;
  stopped = false;
  refusals = 0;
  private max: number;
  constructor(max: number) {
    this.max = max;
    this.limit = max;
  }
  /** Record one response from a store. Returns a message when the pace changed. */
  record(status: number | "ERR", now = Date.now()): string | null {
    const refused = status === 429 || status === 430 || status === 403;
    if (refused) this.refusals++;
    this.window.push(refused);
    if (this.window.length < 200) return null;
    const share = this.window.filter(Boolean).length / this.window.length;
    this.window = [];
    if (share > 0.1) {
      this.badWindows++;
      if (this.badWindows >= 3) {
        this.stopped = true;
        return `refusals at ${(share * 100).toFixed(0)}% for 3 windows in a row: stopping for tonight to protect the IP`;
      }
      this.limit = Math.max(2, Math.floor(this.limit / 2));
      this.pausedUntil = now + 120_000 * this.badWindows;
      return `refusals at ${(share * 100).toFixed(0)}%: pausing ${2 * this.badWindows} min, then ${this.limit} stores at a time`;
    }
    this.badWindows = 0;
    if (this.limit < this.max && share < 0.02) {
      this.limit = Math.min(this.max, this.limit + 1);
      if (this.limit === this.max) return `refusals back under 2%: full speed again (${this.max} stores at a time)`;
    }
    return null;
  }
}

export interface CheckResult {
  status: Status;
  record: StoreRecord | null;
  shopId: string | null;
  /** Shopify refused us (429/430/403): retry soon, don't mark the store. */
  refused: boolean;
  /** robots.txt as fetched this time (undefined when the cached copy was used). */
  robots?: string;
}

/** One store, start to finish. Exported for tests (pass a fake Http). */
export async function checkStore(
  domain: string,
  firstSeen: string,
  http: Http,
  onResponse: (s: number | "ERR") => void,
  now = Date.now(),
  /** A robots.txt fetched in the last month, to save a request. */
  cachedRobots?: string,
): Promise<CheckResult> {
  const base = `https://${domain}`;
  const get = async (path: string) => {
    const r = await http.get(base + path);
    onResponse(r.status);
    return r;
  };
  const refusedCode = (s: number | "ERR") => s === 429 || s === 430 || s === 403;
  let fetchedRobotsOut: string | undefined;
  const result = (status: Status, refused = false): CheckResult => ({ status, record: null, shopId: null, refused, robots: fetchedRobotsOut });

  let rules = cachedRobots;
  let fetchedRobots: string | undefined;
  if (rules === undefined) {
    const robots = await get("/robots.txt");
    if (refusedCode(robots.status)) return result("error", true);
    rules = fetchedRobots = robots.status === 200 ? robots.body.slice(0, 50_000) : "";
    fetchedRobotsOut = fetchedRobots;
  }
  const allowed = (p: string) => robotsAllows(rules, p);
  if (!allowed("/meta.json")) return result("robots");

  const meta = await get("/meta.json");
  if (meta.status === "ERR") return result("error");
  if (refusedCode(meta.status)) return result("error", true);
  if (meta.status === 402 || meta.status === 423 || meta.status === 409) return result("closed");
  const m = meta.status === 200 ? parseMeta(meta.body) : null;
  if (!m) return result("not_shopify");

  let page: PageFacts | null = null;
  if (allowed("/")) {
    const home = await get("/");
    if (refusedCode(home.status)) return result("error", true);
    if (home.status === 200 || home.finalUrl.includes("/password")) page = parsePage(home.body, home.finalUrl);
  }
  if (page?.passwordProtected) return { status: "password", record: null, shopId: m.myshopifyDomain, refused: false, robots: fetchedRobots };
  if (page && (!page.emails.length || !page.phones.length) && allowed("/pages/contact")) {
    const c = await get("/pages/contact");
    if (refusedCode(c.status)) return result("error", true);
    if (c.status === 200) page = mergePages(page, parsePage(c.body, c.finalUrl));
  }
  const catalog = allowed("/products.json") ? await get("/products.json?limit=250") : null;
  // Refused here means we'd save a store without its catalog: retry the whole store later instead.
  if (catalog && refusedCode(catalog.status)) return result("error", true);
  const cat = catalog?.status === 200 ? parseProducts(catalog.body, now) : null;

  const record: StoreRecord = {
    domain,
    url: m.url ?? base,
    name: m.name,
    description: m.description,
    myshopifyDomain: m.myshopifyDomain,
    city: m.city,
    province: m.province,
    country: m.country,
    currency: m.currency,
    shipsToCountries: m.shipsToCountries,
    language: page?.language ?? null,
    productCount: m.productCount,
    collectionCount: m.collectionCount,
    priceMin: cat?.priceMin ?? null,
    priceMedian: cat?.priceMedian ?? null,
    priceMax: cat?.priceMax ?? null,
    productTypes: cat?.productTypes ?? [],
    vendors: cat?.vendors ?? [],
    newestProductAt: cat?.newestProductAt ?? null,
    productsAddedLast30Days: cat?.productsAddedLast30Days ?? 0,
    emails: page?.emails ?? [],
    phones: page?.phones ?? [],
    instagram: page?.socials.instagram ?? null,
    facebook: page?.socials.facebook ?? null,
    tiktok: page?.socials.tiktok ?? null,
    youtube: page?.socials.youtube ?? null,
    pinterest: page?.socials.pinterest ?? null,
    twitter: page?.socials.twitter ?? null,
    linkedin: page?.socials.linkedin ?? null,
    theme: page?.theme ?? null,
    apps: page?.apps ?? [],
    firstSeenAt: firstSeen,
    checkedAt: new Date(now).toISOString(),
  };
  return { status: "live", record, shopId: m.myshopifyDomain, refused: false, robots: fetchedRobots };
}

export interface EnrichOptions {
  budgetMs: number;
  maxStores: number;
  concurrency: number;
  /** Cap on requests per second across all stores. */
  requestsPerSecond: number;
  /** Keep waiting for newly discovered stores until the time budget ends, instead of stopping when none are due. */
  follow?: boolean;
  http?: Http;
}

export async function enrich(db: Db, o: EnrichOptions) {
  const limiter = new RateLimiter(o.requestsPerSecond);
  const http = limitedHttp(o.http ?? fetchHttp, limiter);
  const run = startRun(db, "enrich");
  const t0 = Date.now();
  const throttle = new Throttle(o.concurrency);
  const due = db.prepare(`
    SELECT domain, first_seen, fails, CASE WHEN robots_at >= ? THEN robots END AS robots FROM stores
    WHERE next_check <= ? ORDER BY status = 'new' DESC, next_check ASC LIMIT ?
  `);
  const save = db.prepare(`
    UPDATE stores SET status = ?, checked_at = ?, next_check = ?, fails = ?, shop_id = COALESCE(?, shop_id),
      record = CASE WHEN ? = 'live' THEN ? ELSE NULL END
    WHERE domain = ?
  `);
  const retryLater = db.prepare("UPDATE stores SET next_check = ? WHERE domain = ?");
  const saveRefused = db.prepare("UPDATE stores SET next_check = ?, fails = ? WHERE domain = ?");
  const saveRobots = db.prepare("UPDATE stores SET robots = ?, robots_at = ? WHERE domain = ?");
  const outcomes: Record<string, number> = {};
  let checked = 0;
  let refusedStores = 0;

  const queue: Array<{ domain: string; first_seen: string; fails: number; robots: string | null }> = [];
  const refill = () => {
    if (queue.length > 200) return;
    // Hand out a store only once per run: push its next_check an hour ahead while it is queued.
    const rows = due.all(new Date(Date.now() - ROBOTS_DAYS * DAY).toISOString(), new Date().toISOString(), 1000) as typeof queue;
    const busy = new Date(Date.now() + 3_600_000).toISOString();
    db.transaction(() => rows.forEach((r) => retryLater.run(busy, r.domain)))();
    queue.push(...rows);
  };

  const outOfBudget = () => Date.now() - t0 > o.budgetMs || checked >= o.maxStores || throttle.stopped;
  const worker = async (slot: number) => {
    for (;;) {
      if (outOfBudget()) return;
      if (Date.now() < throttle.pausedUntil || slot >= throttle.limit) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!queue.length) refill();
      const s = queue.shift();
      if (!s) {
        if (!o.follow) return;
        // Discovery is still adding stores in the background: look again in a minute.
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      const r = await checkStore(s.domain, s.first_seen, http, (st) => {
        const msg = throttle.record(st);
        // The request rate follows the throttle both ways: down when refused, back up as it recovers.
        limiter.perSecond = Math.max(1, (o.requestsPerSecond * throttle.limit) / o.concurrency);
        if (msg) log(`${msg} (${limiter.perSecond.toFixed(1)} requests/s)`);
      }, Date.now(), s.robots ?? undefined).catch((err): CheckResult => {
        // A parsing bug on one store's page must never stop the whole crawl.
        log(`${s.domain}: ${err instanceof Error ? err.message : String(err)}`);
        return { status: "error", record: null, shopId: null, refused: false };
      });
      checked++;
      if (r.robots !== undefined) saveRobots.run(r.robots, new Date().toISOString(), s.domain);
      if (r.refused) {
        refusedStores++;
        // Usually one store's own bot protection, not Shopify slowing us down:
        // retry tomorrow, but after three refusals in a row only monthly.
        const fails = s.fails + 1;
        if (fails >= 3) save.run("error", new Date().toISOString(), new Date(Date.now() + 30 * DAY).toISOString(), fails, null, "error", null, s.domain);
        else saveRefused.run(new Date(Date.now() + DAY).toISOString(), fails, s.domain);
        continue;
      }
      const fails = r.status === "error" ? s.fails + 1 : 0;
      // Unreachable three times running: check monthly instead of fortnightly.
      const days = r.status === "error" && fails >= 3 ? 30 : RECHECK[r.status];
      // Spread re-checks over a few days so the daily load stays even.
      const next = new Date(Date.now() + days * DAY + Math.random() * 2 * DAY).toISOString();
      save.run(r.status, new Date().toISOString(), next, fails, r.shopId, r.status, r.record ? JSON.stringify(r.record) : null, s.domain);
      outcomes[r.status] = (outcomes[r.status] ?? 0) + 1;
      if (checked % 1000 === 0) {
        const rate = checked / ((Date.now() - t0) / 1000);
        log(`checked ${checked.toLocaleString()} stores (${rate.toFixed(1)}/s, ${throttle.limit} at a time): ${JSON.stringify(outcomes)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: o.concurrency }, (_, i) => worker(i)));
  // Anything still marked in-flight from this run goes back in the queue.
  for (const s of queue) retryLater.run(new Date().toISOString(), s.domain);
  const stats = { checked, outcomes, refusedStores, refusals: throttle.refusals, stoppedForRefusals: throttle.stopped, secs: Math.round((Date.now() - t0) / 1000) };
  finishRun(db, run, stats);
  log(`done: ${JSON.stringify(stats)}`);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const db = openDb();
  const stats = await enrich(db, {
    budgetMs: Number(arg("hours") ?? 5) * 3_600_000,
    maxStores: Number(arg("max") ?? Infinity),
    concurrency: Number(arg("concurrency") ?? 10),
    requestsPerSecond: Number(arg("rps") ?? 8),
    follow: process.argv.includes("--follow"),
  });
  db.close();
  if (stats.stoppedForRefusals) process.exit(3);
}
