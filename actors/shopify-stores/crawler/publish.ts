/**
 * Publish the live stores to Apify, where the Actor reads them.
 *
 *   node --experimental-strip-types actors/shopify-stores/crawler/publish.ts
 *
 * Needs APIFY_TOKEN in the project's .env (never committed). With
 * PUBLISH_LOCAL_DIR set it writes to a folder instead (end-to-end tests).
 *
 * Order matters, as in the Career API publisher: new shards first, then the
 * MANIFEST pointing at them, and only then are old shards deleted -- so a
 * search running mid-publish always sees one complete index.
 */
import { config as loadEnv } from "dotenv";
import { ApifyClient } from "apify-client";
import { gzipSync } from "node:zlib";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHARD_SIZE, type Manifest, type ShardRef, type StoreRecord } from "../src/format.ts";
import { ROOT, finishRun, log, openDb, startRun, type Db } from "./db.ts";

loadEnv({ path: resolve(ROOT, ".env"), quiet: true });

export const STORE_NAME = "shopify-stores-index";
export const MANIFEST_URL_FILE = resolve(ROOT, "data/shopify-manifest-url.txt");

/** Live records, one per shop (a shop reachable on two domains is published once), newest-found first. */
export function* liveRecords(db: Db): Generator<StoreRecord> {
  const rows = db
    .prepare("SELECT domain, shop_id, record FROM stores WHERE status = 'live' AND record IS NOT NULL ORDER BY first_seen DESC, domain")
    .iterate() as IterableIterator<{ domain: string; shop_id: string | null; record: string }>;
  const shops = new Set<string>();
  for (const row of rows) {
    if (row.shop_id) {
      if (shops.has(row.shop_id)) continue;
      shops.add(row.shop_id);
    }
    yield JSON.parse(row.record) as StoreRecord;
  }
}

export async function publish(db: Db) {
  const run = startRun(db, "publish");
  const kv = await openStore();
  const stamp = run.replace(/[-:.TZ]/g, "").slice(0, 12);
  const shards: ShardRef[] = [];
  const byCountry: Record<string, number> = {};
  let total = 0;
  let part: StoreRecord[] = [];

  const flush = async () => {
    if (!part.length) return;
    const key = `s-${stamp}-${String(shards.length).padStart(3, "0")}`;
    const body = gzipSync(part.map((s) => JSON.stringify(s)).join("\n"));
    await kv.setRecord({ key, value: body, contentType: "application/gzip" });
    shards.push({ key, url: await kv.getRecordPublicUrl(key), count: part.length, newestFirstSeen: part[0].firstSeenAt, oldestFirstSeen: part.at(-1)!.firstSeenAt });
    log(`uploaded ${key}: ${part.length} stores, ${(body.length / 1e6).toFixed(1)} MB`);
    part = [];
  };

  for (const s of liveRecords(db)) {
    byCountry[s.country ?? "unknown"] = (byCountry[s.country ?? "unknown"] ?? 0) + 1;
    total++;
    part.push(s);
    if (part.length >= SHARD_SIZE) await flush();
  }
  await flush();
  if (!total) throw new Error("No live stores to publish -- run discover.ts and enrich.ts first.");

  const manifest: Manifest = { version: 1, indexedAt: run, totalStores: total, byCountry, shards };
  await kv.setRecord({ key: "MANIFEST", value: manifest, contentType: "application/json" });
  // The Actor reads this one fixed link. It unlocks the whole index, so it lives
  // in gitignored data/ and in the Actor's encrypted secrets, never in source.
  if (!process.env.PUBLISH_LOCAL_DIR) writeFileSync(MANIFEST_URL_FILE, (await kv.getRecordPublicUrl("MANIFEST")) + "\n");

  const keep = new Set(["MANIFEST", ...shards.map((s) => s.key)]);
  let removed = 0;
  for (const key of await kv.allKeys()) {
    if (!keep.has(key)) {
      await kv.deleteRecord(key);
      removed++;
    }
  }
  const stats = { totalStores: total, shards: shards.length, removed, countries: Object.keys(byCountry).length };
  finishRun(db, run, stats);
  log(`MANIFEST: ${JSON.stringify(stats)}`);
  return stats;
}

interface Store {
  setRecord(r: { key: string; value: unknown; contentType: string }): Promise<void>;
  getRecordPublicUrl(key: string): Promise<string>;
  allKeys(): Promise<string[]>;
  deleteRecord(key: string): Promise<void>;
}

async function openStore(): Promise<Store> {
  const dir = process.env.PUBLISH_LOCAL_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    return {
      async setRecord({ key, value }) {
        writeFileSync(resolve(dir, key), Buffer.isBuffer(value) ? value : JSON.stringify(value));
      },
      async getRecordPublicUrl(key) {
        return `file://${resolve(dir, key)}`;
      },
      async allKeys() {
        return readdirSync(dir);
      },
      async deleteRecord(key) {
        rmSync(resolve(dir, key));
      },
    };
  }
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set. Add it to the project's .env file.");
  const client = new ApifyClient({ token });
  const { id } = await client.keyValueStores().getOrCreate(STORE_NAME);
  const kv = client.keyValueStore(id);
  return {
    setRecord: (r) => kv.setRecord(r) as Promise<void>,
    getRecordPublicUrl: (key) => kv.getRecordPublicUrl(key),
    async allKeys() {
      const keys: string[] = [];
      let exclusiveStartKey: string | undefined;
      do {
        const page = await kv.listKeys({ limit: 1000, exclusiveStartKey });
        keys.push(...page.items.map((i) => i.key));
        exclusiveStartKey = page.isTruncated ? page.nextExclusiveStartKey : undefined;
      } while (exclusiveStartKey);
      return keys;
    },
    deleteRecord: (key) => kv.deleteRecord(key),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  await publish(db);
  db.close();
}
