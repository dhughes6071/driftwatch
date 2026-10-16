/**
 * Discover Shopify stores by DNS -- runs on the Mac mini, costs nothing.
 *
 *   node --experimental-strip-types actors/shopify-stores/crawler/discover.ts --tranco data/lists/top-1m.csv
 *   node --experimental-strip-types actors/shopify-stores/crawler/discover.ts --cc data/lists/cc-domain-vertices.txt.gz --hours 6
 *
 * A store on its own domain points that domain (or www.) at Shopify's
 * storefront addresses, 23.227.38.0/24. So: read a list of domains, resolve
 * each, keep the ones that land on Shopify. Measured 14 Oct 2026: 1.4% of
 * Common Crawl's 133M domains, ~520 lookups a second.
 *
 * Resumable: progress is saved every few thousand domains, and the next run
 * of the same list starts there. --hours stops cleanly inside a time budget,
 * so the 133M-domain list can be spread over several nights.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { promises as dns } from "node:dns";
import { basename } from "node:path";
import { finishRun, log, openDb, startRun, type Db } from "./db.ts";

/** Shopify's storefront range (shops.myshopify.com). */
export const isShopifyIp = (ip: string) => ip.startsWith("23.227.38.");

/** "1,google.com\r" (Tranco) or "123\tcom.example\t4" (Common Crawl, reversed) -> "google.com" / "example.com". */
export function domainFromLine(line: string, kind: "tranco" | "cc"): string | null {
  let d: string | undefined;
  if (kind === "tranco") d = line.split(",")[1];
  else {
    const rev = line.split("\t")[1];
    d = rev?.split(".").reverse().join(".");
  }
  d = d?.trim().toLowerCase().replace(/\.$/, "");
  if (!d || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || d.length > 253) return null;
  // Shopify's own hosts are not stores.
  if (/(^|\.)(shopify|myshopify|shopifycdn|shopifycloud)\.com$/.test(d)) return null;
  return d;
}

export interface DiscoverOptions {
  file: string;
  kind: "tranco" | "cc";
  /** Stop after this long (ms), saving progress. */
  budgetMs: number;
  /** Stop after this many domains in this run. */
  maxDomains: number;
  concurrency: number;
  resolve4?: (host: string) => Promise<string[]>;
}

export async function discover(db: Db, o: DiscoverOptions) {
  const source = o.kind === "tranco" ? "tranco" : `cc:${basename(o.file)}`;
  const prog = db.prepare("SELECT position, done FROM progress WHERE source = ?").get(source) as { position: number; done: number } | undefined;
  if (prog?.done && o.kind === "cc") {
    log(`${source} was already read to the end; nothing to do (delete its progress row to start over).`);
    return { source, checked: 0, found: 0, newStores: 0, position: prog.position, finished: true };
  }
  // Tranco changes daily, so a finished pass starts over; Common Crawl lists are read once.
  const start = prog && !prog.done ? prog.position : 0;
  const run = startRun(db, "discover");
  const t0 = Date.now();

  const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
  resolver.setServers(["1.1.1.1", "8.8.8.8", "9.9.9.9", "1.0.0.1"]);
  const resolve4 = o.resolve4 ?? ((h: string) => resolver.resolve4(h));
  const onShopify = async (d: string) => {
    for (const host of [d, `www.${d}`]) {
      try {
        if ((await resolve4(host)).some(isShopifyIp)) return true;
      } catch {
        // NXDOMAIN, no A record, timeout: try the other name, then move on.
      }
    }
    return false;
  };

  const now = () => new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO stores (domain, source, first_seen, dns_seen, next_check) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(domain) DO UPDATE SET dns_seen = excluded.dns_seen
  `);
  const exists = db.prepare("SELECT 1 FROM stores WHERE domain = ?");
  const saveProgress = db.prepare(`
    INSERT INTO progress (source, position, done, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET position = excluded.position, done = excluded.done, updated_at = excluded.updated_at
  `);

  const input = createReadStream(o.file);
  const lines = createInterface({ input: o.file.endsWith(".gz") ? input.pipe(createGunzip()) : input, crlfDelay: Infinity });

  let position = 0;
  let checked = 0;
  let found = 0;
  let newStores = 0;
  let finished = true;
  let batch: string[] = [];

  const flush = async () => {
    const hits: string[] = [];
    let k = 0;
    await Promise.all(
      Array.from({ length: Math.min(o.concurrency, batch.length) }, async () => {
        while (k < batch.length) {
          const d = batch[k++];
          if (await onShopify(d)) hits.push(d);
        }
      }),
    );
    checked += batch.length;
    const at = now();
    // IMMEDIATE takes the write lock up front. A default (deferred) transaction
    // reads first and then upgrades to a write, and if the enrich process wrote
    // in between, SQLite fails the upgrade at once with SQLITE_BUSY -- no
    // busy_timeout applies (crashed this way on 16 Oct 2026, 3M domains in).
    db.transaction(() => {
      for (const d of hits) {
        if (!exists.get(d)) newStores++;
        upsert.run(d, source, at, at, at);
      }
      saveProgress.run(source, position, 0, at);
    }).immediate();
    found += hits.length;
    batch = [];
  };

  for await (const line of lines) {
    position++;
    if (position <= start) continue;
    const d = domainFromLine(line, o.kind);
    if (d) batch.push(d);
    if (batch.length >= 5_000) {
      await flush();
      if (checked % 100_000 < 5_000) {
        const rate = checked / ((Date.now() - t0) / 1000);
        log(`${source}: line ${position.toLocaleString()}, checked ${checked.toLocaleString()}, Shopify ${found.toLocaleString()} (${newStores.toLocaleString()} new), ${rate.toFixed(0)}/s`);
      }
      if (Date.now() - t0 > o.budgetMs || checked >= o.maxDomains) {
        finished = false;
        break;
      }
    }
  }
  if (batch.length) await flush();
  lines.close();
  input.destroy();
  saveProgress.run(source, position, finished ? 1 : 0, now());
  const stats = { source, startedAt: start, position, checked, found, newStores, finished, secs: Math.round((Date.now() - t0) / 1000) };
  finishRun(db, run, stats);
  log(`done: ${JSON.stringify(stats)}`);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const tranco = arg("tranco");
  const cc = arg("cc");
  if (!tranco === !cc) {
    console.error("Usage: discover.ts --tranco <top-1m.csv> | --cc <domain-vertices.txt.gz> [--hours 6] [--max 1000000] [--concurrency 200]");
    process.exit(2);
  }
  const db = openDb();
  await discover(db, {
    file: (tranco ?? cc)!,
    kind: tranco ? "tranco" : "cc",
    budgetMs: Number(arg("hours") ?? 24) * 3_600_000,
    maxDomains: Number(arg("max") ?? Infinity),
    concurrency: Number(arg("concurrency") ?? 200),
  });
  db.close();
}
