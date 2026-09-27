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
import { compareNewestFirst, DESC_CHUNK_SIZE, SHARD_SIZE, type IndexJob, type Manifest, type ShardRef } from "../src/format.ts";

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
  const day = lastRun.started_at.slice(0, 10).replaceAll("-", "");
  const existingToday = (
    db.prepare("SELECT DISTINCT chunk FROM jobs WHERE chunk LIKE ?").all(`desc-${day}-%`) as Array<{ chunk: string }>
  ).length;
  const pending = db
    .prepare("SELECT id, description FROM jobs WHERE chunk IS NULL AND description IS NOT NULL AND last_seen >= ?")
    .all(liveSince) as Array<{ id: string; description: string }>;
  const setChunk = db.prepare("UPDATE jobs SET chunk = ? WHERE id = ?");
  let n = existingToday;
  for (let i = 0; i < pending.length; i += DESC_CHUNK_SIZE) {
    const slice = pending.slice(i, i + DESC_CHUNK_SIZE);
    const key = `desc-${day}-${String(n++).padStart(3, "0")}`;
    const body = gzipSync(JSON.stringify(Object.fromEntries(slice.map((r) => [r.id, r.description]))));
    await kv.setRecord({ key, value: body, contentType: "application/gzip" });
    db.transaction(() => slice.forEach((r) => setChunk.run(key, r.id)))();
    log(`uploaded ${key}: ${slice.length} descriptions, ${(body.length / 1e6).toFixed(1)} MB`);
  }

  // ---------------------------------------------------------- 2. shards
  const rows = db.prepare("SELECT light, chunk FROM jobs WHERE last_seen >= ?").all(liveSince) as Array<{
    light: string;
    chunk: string | null;
  }>;
  const jobs: IndexJob[] = rows.map((r) => ({ ...(JSON.parse(r.light) as IndexJob), d: r.chunk }));
  jobs.sort(compareNewestFirst);

  const stamp = lastRun.started_at.replace(/[-:.TZ]/g, "").slice(0, 12);
  const shards: ShardRef[] = [];
  for (let i = 0; i < jobs.length; i += SHARD_SIZE) {
    const part = jobs.slice(i, i + SHARD_SIZE);
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
    });
    log(`uploaded ${key}: ${part.length} jobs, ${(body.length / 1e6).toFixed(1)} MB`);
  }

  // ---------------------------------------------------------- 3. manifest
  const chunkKeys = [...new Set(jobs.map((j) => j.d).filter((k): k is string => !!k))];
  const desc: Record<string, string> = {};
  for (const k of chunkKeys) desc[k] = await kv.getRecordPublicUrl(k);
  const bySource: Record<string, number> = {};
  for (const j of jobs) bySource[j.ats] = (bySource[j.ats] ?? 0) + 1;

  const manifest: Manifest = {
    version: 1,
    indexedAt: lastRun.started_at,
    totalJobs: jobs.length,
    companies: new Set(jobs.map((j) => `${j.ats}:${j.company}`)).size,
    bySource,
    shards,
    desc,
  };
  await kv.setRecord({ key: "MANIFEST", value: manifest, contentType: "application/json" });
  const manifestUrl = await kv.getRecordPublicUrl("MANIFEST");
  // The Actor reads this one fixed URL; the signature is stable for a given key.
  if (!LOCAL_DIR) writeFileSync(
    resolve(HERE, "../src/manifest-url.ts"),
    `// Written by crawler/publish.ts. Signed read-only link to the index MANIFEST.\nexport const MANIFEST_URL = ${JSON.stringify(manifestUrl)};\n`,
  );
  log(`MANIFEST: ${jobs.length} jobs, ${manifest.companies} companies, ${shards.length} shards, ${chunkKeys.length} description chunks`);

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
    JSON.stringify(chunkKeys),
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
