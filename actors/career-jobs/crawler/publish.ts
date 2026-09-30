/**
 * Publish the local index to Apify, where the Actor reads it.
 *
 *   node --experimental-strip-types actors/career-jobs/crawler/publish.ts
 *
 * Needs APIFY_TOKEN in the project's .env (the owner adds it; never committed).
 *
 * Order matters: new shards and description chunks are uploaded first, the
 * MANIFEST pointing at them last, and only then are the previous run's shards
 * deleted -- so a query running mid-publish always sees one complete index.
 *
 * Cost (Apify pricing, Sep 2026): ~20-30 record writes a day at $0.00005 each,
 * plus storage of ~0.5 GB at $0.001/GB-hour -- well under $1 a month.
 */
import { config as loadEnv } from "dotenv";
import { ApifyClient } from "apify-client";
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./crawl.ts";
import { extractSalary } from "../src/salary.ts";
import { salaryFields, DESC_CHUNK_SIZE, SHARD_SIZE, type IndexJob, type Manifest, type ShardRef } from "../src/format.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
loadEnv({ path: resolve(ROOT, ".env"), quiet: true });

export const STORE_NAME = "career-jobs-index";
/** Publish to a local folder instead of Apify (end-to-end tests). */
const LOCAL_DIR = process.env.PUBLISH_LOCAL_DIR;

if (import.meta.url === `file://${process.argv[1]}`) {
  await publish();
}

export async function publish() {
  const kv = await openStore();
  const db = openDb();

  const lastRun = db.prepare("SELECT started_at FROM runs WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 1").get() as
    | { started_at: string }
    | undefined;
  if (!lastRun) throw new Error("No finished crawl yet -- run crawl.ts first.");
  // Live = seen in the latest crawl or the day before (grace for a flaky host).
  const liveSince = new Date(Date.parse(lastRun.started_at) - 86_400_000).toISOString();

  // ---------------------------------------------------------- 1. new description chunks
  // Batch by batch: ~900k descriptions are several GB, far more than fits in
  // memory at once (the first full publish died exactly that way).
  const day = lastRun.started_at.slice(0, 10).replaceAll("-", "");
  let n = (db.prepare("SELECT DISTINCT chunk FROM jobs WHERE chunk LIKE ?").all(`desc-${day}-%`) as unknown[]).length;
  const nextBatch = db.prepare(
    "SELECT id, description FROM jobs WHERE chunk IS NULL AND description IS NOT NULL AND last_seen >= ? LIMIT ?",
  );
  const setChunk = db.prepare("UPDATE jobs SET chunk = ? WHERE id = ?");
  for (;;) {
    const slice = nextBatch.all(liveSince, DESC_CHUNK_SIZE) as Array<{ id: string; description: string }>;
    if (slice.length === 0) break;
    const key = `desc-${day}-${String(n++).padStart(3, "0")}`;
    const body = gzipSync(JSON.stringify(Object.fromEntries(slice.map((r) => [r.id, r.description]))));
    await kv.setRecord({ key, value: body, contentType: "application/gzip" });
    db.transaction(() => slice.forEach((r) => setChunk.run(key, r.id)))();
    if (n % 25 === 0) log(`uploaded ${key}: ${slice.length} descriptions, ${(body.length / 1e6).toFixed(1)} MB`);
  }

  // ---------------------------------------------------------- 2. shards (streamed, newest first)
  const stamp = lastRun.started_at.replace(/[-:.TZ]/g, "").slice(0, 12);
  const shards: ShardRef[] = [];
  const chunkKeys = new Set<string>();
  const companies = new Set<string>();
  const bySource: Record<string, number> = {};
  let total = 0;
  let part: IndexJob[] = [];

  const flush = async () => {
    if (!part.length) return;
    const key = `s-${stamp}-${String(shards.length).padStart(3, "0")}`;
    const body = gzipSync(part.map((j) => JSON.stringify(j)).join("\n"));
    await kv.setRecord({ key, value: body, contentType: "application/gzip" });
    const dated = part.filter((j) => j.postedAt).map((j) => j.postedAt!);
    shards.push({
      key,
      url: await kv.getRecordPublicUrl(key),
      count: part.length,
      newest: dated[0] ?? null,
      oldest: dated.at(-1) ?? null,
      undated: part.length - dated.length,
      newestFirstSeen: part.reduce((m, j) => (j.firstSeenAt > m ? j.firstSeenAt : m), ""),
    });
    log(`uploaded ${key}: ${part.length} jobs, ${(body.length / 1e6).toFixed(1)} MB`);
    part = [];
  };

  // SQL does the newest-first sort (same order as compareNewestFirst), so
  // only one shard is ever in memory.
  const rows = db
    .prepare("SELECT light, chunk, description FROM jobs WHERE last_seen >= ? ORDER BY posted_at IS NULL, posted_at DESC")
    .iterate(liveSince) as IterableIterator<{ light: string; chunk: string | null; description: string | null }>;
  let withSalary = 0;
  for (const row of rows) {
    const j: IndexJob = { ...(JSON.parse(row.light) as IndexJob), d: row.chunk };
    // Structured pay (Ashby) wins; otherwise read it from the description.
    if (j.salarySource !== "structured") Object.assign(j, salaryFields(extractSalary(row.description, j.country)));
    if (j.salaryMin != null) withSalary++;
    if (j.d) chunkKeys.add(j.d);
    companies.add(`${j.ats}:${j.company}`);
    bySource[j.ats] = (bySource[j.ats] ?? 0) + 1;
    total++;
    part.push(j);
    if (part.length >= SHARD_SIZE) await flush();
  }
  await flush();

  // ---------------------------------------------------------- 3. manifest
  const desc: Record<string, string> = {};
  for (const k of chunkKeys) desc[k] = await kv.getRecordPublicUrl(k);

  const manifest: Manifest = {
    version: 1,
    indexedAt: lastRun.started_at,
    totalJobs: total,
    companies: companies.size,
    bySource,
    shards,
    desc,
  };
  await kv.setRecord({ key: "MANIFEST", value: manifest, contentType: "application/json" });
  const manifestUrl = await kv.getRecordPublicUrl("MANIFEST");
  // The Actor reads this one fixed link (its signature is stable for a given
  // key). It unlocks the whole index, so it lives in gitignored data/ and in
  // the Actor's encrypted secrets -- never in source, since the repo is public.
  if (!LOCAL_DIR) writeFileSync(resolve(ROOT, "data/career-manifest-url.txt"), manifestUrl + "\n");
  log(`salary: ${withSalary} of ${total} jobs (${((withSalary / Math.max(total, 1)) * 100).toFixed(1)}%)`);
  log(`MANIFEST: ${total} jobs, ${manifest.companies} companies, ${shards.length} shards, ${chunkKeys.size} description chunks`);

  // ---------------------------------------------------------- 4. clean up
  const keep = new Set(["MANIFEST", ...shards.map((s) => s.key), ...chunkKeys]);
  let removed = 0;
  let exclusiveStartKey: string | undefined;
  do {
    const page = await kv.listKeys({ limit: 1000, exclusiveStartKey });
    for (const item of page.items) {
      if (!keep.has(item.key)) {
        await kv.deleteRecord(item.key);
        removed++;
      }
    }
    exclusiveStartKey = page.isTruncated ? page.nextExclusiveStartKey : undefined;
  } while (exclusiveStartKey);
  // Chunks no live job references any more will never be read again.
  db.prepare("UPDATE jobs SET chunk = NULL WHERE chunk IS NOT NULL AND chunk NOT IN (SELECT value FROM json_each(?))").run(
    JSON.stringify([...chunkKeys]),
  );
  log(`removed ${removed} old records`);
  db.close();
}

/**
 * The Apify store -- or, with PUBLISH_LOCAL_DIR set, a plain folder with
 * file:// links, for end-to-end tests that touch nothing remote.
 */
interface Store {
  setRecord(r: { key: string; value: unknown; contentType: string }): Promise<void>;
  getRecordPublicUrl(key: string): Promise<string>;
  listKeys(o: { limit: number; exclusiveStartKey?: string }): Promise<{
    items: Array<{ key: string }>;
    isTruncated: boolean;
    nextExclusiveStartKey?: string;
  }>;
  deleteRecord(key: string): Promise<void>;
}

async function openStore(): Promise<Store> {
  if (LOCAL_DIR) {
    const { mkdirSync, readdirSync, rmSync, writeFileSync: write } = await import("node:fs");
    mkdirSync(LOCAL_DIR, { recursive: true });
    return {
      async setRecord({ key, value }) {
        write(resolve(LOCAL_DIR, key), Buffer.isBuffer(value) ? value : JSON.stringify(value));
      },
      async getRecordPublicUrl(key) {
        return `file://${resolve(LOCAL_DIR, key)}`;
      },
      async listKeys() {
        return { items: readdirSync(LOCAL_DIR).map((key) => ({ key })), isTruncated: false };
      },
      async deleteRecord(key) {
        rmSync(resolve(LOCAL_DIR, key));
      },
    };
  }
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error("APIFY_TOKEN is not set. Add it to the project's .env file (Apify Console > Settings > API & Integrations).");
  }
  const client = new ApifyClient({ token });
  const store = await client.keyValueStores().getOrCreate(STORE_NAME);
  return client.keyValueStore(store.id) as unknown as Store;
}

function log(msg: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
}
