import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { IndexJob, Manifest } from "../src/format.ts";

// A throwaway database and output folder; publish.ts reads both at import.
const dir = mkdtempSync(join(tmpdir(), "career-first-seen-"));
process.env.CAREER_INDEX_DB = join(dir, "index.db");
process.env.PUBLISH_LOCAL_DIR = join(dir, "out");
const { openDb, prepareTouch } = await import("../crawler/crawl.ts");
const { publish } = await import("../crawler/publish.ts");

const FIRST = "2026-09-27T06:00:00.000Z";
const TODAY = "2026-10-16T06:00:00.000Z";

const job = (firstSeenAt: string): IndexJob => ({
  id: "greenhouse:acme:1",
  ats: "greenhouse",
  company: "acme",
  companyName: "Acme",
  title: "Engineer",
  location: null,
  additionalLocations: [],
  country: null,
  remote: false,
  remoteEligible: false,
  workplaceType: null,
  department: null,
  postedAt: null,
  firstSeenAt,
  url: "https://example.com/1",
  employmentType: null,
  d: null,
});

test("re-seen roles keep the day we first saw them", async (t) => {
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openDb();
  db.prepare(
    "INSERT INTO jobs (id, ats, company, posted_at, light, description, first_seen, last_seen) VALUES (?, 'greenhouse', 'acme', NULL, ?, NULL, ?, ?)",
  ).run("greenhouse:acme:1", JSON.stringify(job(FIRST)), FIRST, FIRST);

  // The crawl rebuilds the row from today's fetch, stamped with today.
  prepareTouch(db).run(TODAY, JSON.stringify(job(TODAY)), null, "greenhouse:acme:1");
  const light = JSON.parse((db.prepare("SELECT light FROM jobs").get() as { light: string }).light) as IndexJob;
  assert.equal(light.firstSeenAt, FIRST, "touch keeps firstSeenAt");

  // A row written before the fix (light says today) still publishes first_seen.
  db.prepare("UPDATE jobs SET light = ?").run(JSON.stringify(job(TODAY)));
  db.prepare("INSERT INTO runs (started_at, finished_at) VALUES (?, ?)").run(TODAY, TODAY);
  db.close();

  await publish();
  const out = process.env.PUBLISH_LOCAL_DIR!;
  const manifest = JSON.parse(readFileSync(join(out, "MANIFEST"), "utf8")) as Manifest;
  assert.equal(manifest.shards.length, 1);
  const [published] = gunzipSync(readFileSync(join(out, manifest.shards[0].key)))
    .toString()
    .split("\n")
    .map((l) => JSON.parse(l) as IndexJob);
  assert.equal(published.firstSeenAt, FIRST, "published firstSeenAt comes from first_seen");
  assert.equal(manifest.shards[0].newestFirstSeen, FIRST);
});
