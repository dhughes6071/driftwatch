import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import type { IndexJob, Manifest } from "../src/format.ts";
import { compareNewestFirst } from "../src/format.ts";
import { descriptionsFor, makeMatcher, search, type Fetcher } from "../src/search.ts";
import { monitorKey } from "../src/monitor.ts";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function job(p: Partial<IndexJob> & { id: string }): IndexJob {
  return {
    ats: "greenhouse",
    company: "acme",
    companyName: "Acme",
    title: "Engineer",
    location: "New York, NY",
    additionalLocations: [],
    country: null,
    remote: false,
    remoteEligible: false,
    workplaceType: null,
    department: null,
    postedAt: day(1),
    firstSeenAt: day(1),
    url: "https://example.com",
    employmentType: null,
    d: null,
    ...p,
  };
}

/** Build a manifest + fake fetcher the way publish.ts lays the index out. */
function fakeIndex(jobs: IndexJob[], shardSize: number, descs: Record<string, Record<string, string>> = {}) {
  const files = new Map<string, Uint8Array>();
  const sorted = [...jobs].sort(compareNewestFirst);
  const shards = [];
  for (let i = 0; i < sorted.length; i += shardSize) {
    const part = sorted.slice(i, i + shardSize);
    const url = `mem://s${i}`;
    files.set(url, gzipSync(part.map((j) => JSON.stringify(j)).join("\n")));
    const dated = part.filter((j) => j.postedAt).map((j) => j.postedAt!);
    const newestFirstSeen = part.reduce((m, j) => (j.firstSeenAt > m ? j.firstSeenAt : m), "");
    shards.push({ key: url, url, count: part.length, newest: dated[0] ?? null, oldest: dated.at(-1) ?? null, undated: part.length - dated.length, newestFirstSeen });
  }
  const desc: Record<string, string> = {};
  for (const [k, v] of Object.entries(descs)) {
    desc[k] = `mem://${k}`;
    files.set(desc[k], gzipSync(JSON.stringify(v)));
  }
  const reads: string[] = [];
  const fetcher: Fetcher = async (url) => {
    reads.push(url);
    const f = files.get(url);
    if (!f) throw new Error(`no ${url}`);
    return f;
  };
  const manifest: Manifest = { version: 1, indexedAt: day(0), totalJobs: jobs.length, companies: 1, bySource: {}, shards, desc };
  return { manifest, fetcher, reads };
}

test("title, exclude, location (incl. additional locations), company name and source filters", () => {
  const m = makeMatcher(
    {
      titleKeywords: ["engineer"],
      titleExcludeKeywords: ["intern"],
      locationKeywords: ["texas"],
      companyKeywords: ["morgan stanley"],
      sources: ["workday"],
      maxJobs: 10,
    },
    NOW,
  );
  const base = { ats: "workday" as const, company: "ms", companyName: "Morgan Stanley", location: "New York", additionalLocations: ["Austin, Texas"] };
  assert.equal(m(job({ id: "1", ...base })), true);
  assert.equal(m(job({ id: "2", ...base, title: "Engineering Intern" })), false, "excluded word");
  assert.equal(m(job({ id: "3", ...base, additionalLocations: [] })), false, "no Texas location");
  assert.equal(m(job({ id: "4", ...base, ats: "greenhouse" })), false, "wrong source");
  assert.equal(m(job({ id: "5", ...base, companyName: "Goldman Sachs", company: "gs" })), false, "wrong company");
});

test("postedWithinDays uses firstSeenAt for undated roles", () => {
  const m = makeMatcher({ postedWithinDays: 7, maxJobs: 10 }, NOW);
  assert.equal(m(job({ id: "a", postedAt: day(3) })), true);
  assert.equal(m(job({ id: "b", postedAt: day(30) })), false);
  assert.equal(m(job({ id: "c", postedAt: null, firstSeenAt: day(2) })), true, "new to us, undated");
  assert.equal(m(job({ id: "d", postedAt: null, firstSeenAt: day(20) })), false);
});

test("search returns newest first, stops at maxJobs, and skips shards older than the cutoff", async () => {
  const jobs = Array.from({ length: 100 }, (_, i) => job({ id: `j${i}`, postedAt: day(i) }));
  const { manifest, fetcher, reads } = fakeIndex(jobs, 10);
  const r = await search(manifest, { postedWithinDays: 15, maxJobs: 1000 }, fetcher, NOW);
  assert.deepEqual(r.jobs.map((j) => j.id).slice(0, 3), ["j0", "j1", "j2"]);
  assert.equal(r.jobs.length, 16, "days 0 through 15 inclusive");
  assert.ok(reads.length <= 3, `read ${reads.length} shards for 15 days of jobs; the rest are older`);

  const few = await search(manifest, { maxJobs: 5 }, fetcher, NOW);
  assert.equal(few.shardsRead, 1, "stops reading once it has enough");
});

test("undated jobs in an otherwise old shard are not skipped", async () => {
  const jobs = [job({ id: "old", postedAt: day(60) }), job({ id: "undated-new", postedAt: null, firstSeenAt: day(1) })];
  const { manifest, fetcher } = fakeIndex(jobs, 10);
  const r = await search(manifest, { postedWithinDays: 7, maxJobs: 10 }, fetcher, NOW);
  assert.deepEqual(r.jobs.map((j) => j.id), ["undated-new"]);
});

test("maxJobsPerCompany caps each company", async () => {
  const jobs = [
    ...Array.from({ length: 5 }, (_, i) => job({ id: `a${i}`, company: "a" })),
    ...Array.from({ length: 5 }, (_, i) => job({ id: `b${i}`, company: "b" })),
  ];
  const { manifest, fetcher } = fakeIndex(jobs, 100);
  const r = await search(manifest, { maxJobs: 100, maxJobsPerCompany: 2 }, fetcher, NOW);
  assert.equal(r.jobs.length, 4);
});

test("descriptions are fetched only from the chunks the results live in", async () => {
  const jobs = [job({ id: "x", d: "desc-1" }), job({ id: "y", d: "desc-2" }), job({ id: "z", d: null })];
  const { manifest, fetcher, reads } = fakeIndex(jobs, 10, { "desc-1": { x: "About X" }, "desc-2": { y: "About Y" } });
  const got = await descriptionsFor(manifest, [jobs[0], jobs[2]], fetcher);
  assert.equal(got.get("x"), "About X");
  assert.equal(got.has("z"), false);
  assert.ok(!reads.includes("mem://desc-2"), "unneeded chunk not downloaded");
});

test("short location codes match whole words only (NY must not match Germany)", async () => {
  const { locationMatcher } = await import("../src/search.ts");
  const ny = locationMatcher(["NY"]);
  assert.equal(ny("New York, NY"), true);
  assert.equal(ny("US-NY-New York"), true);
  assert.equal(ny("Munich, Germany"), false);
  assert.equal(ny("Albany, Oregon"), false);
  assert.equal(locationMatcher(["CA"])("Kingston, Jamaica"), false);
  assert.equal(locationMatcher(["CA"])("San Jose, CA"), true);
  assert.equal(locationMatcher(["york"])("New York City"), true, "longer keywords still match anywhere");
  assert.equal(locationMatcher(["u.s."])("Remote, U.S."), true, "regex characters are escaped");
});

test("reader accepts gzip or already-decoded bytes", async () => {
  const { unzipText } = await import("../src/search.ts");
  assert.equal(unzipText(gzipSync("hello")), "hello");
  assert.equal(unzipText(new TextEncoder().encode("hello")), "hello");
});

test("salary filters", () => {
  const withPay = job({ id: "p", salaryAnnualMin: 90000, salaryAnnualMax: 120000, salaryCurrency: "USD", salaryMin: 90000, salaryMax: 120000 });
  const gbp = job({ id: "g", salaryAnnualMin: 50000, salaryAnnualMax: 60000, salaryCurrency: "GBP", salaryMin: 50000, salaryMax: 60000 });
  const noPay = job({ id: "n" });
  const only = makeMatcher({ onlyWithSalary: true, maxJobs: 10 }, NOW);
  assert.deepEqual([withPay, gbp, noPay].filter(only).map((j) => j.id), ["p", "g"]);
  const min = makeMatcher({ minAnnualSalary: 100000, maxJobs: 10 }, NOW);
  assert.deepEqual([withPay, gbp, noPay].filter(min).map((j) => j.id), ["p"], "top of range reaches 100k");
  const cur = makeMatcher({ salaryCurrencies: ["gbp"], maxJobs: 10 }, NOW);
  assert.deepEqual([withPay, gbp, noPay].filter(cur).map((j) => j.id), ["g"]);
});

test("new since last run: only jobs first seen after the last index, and shards with nothing new are skipped", async () => {
  // 20 jobs seen in an older crawl, 3 new ones first seen today (one posted long ago, one undated).
  const old = Array.from({ length: 20 }, (_, i) => job({ id: `o${i}`, postedAt: day(2 + i), firstSeenAt: day(30) }));
  const fresh = [
    job({ id: "n1", postedAt: day(0), firstSeenAt: day(0) }),
    job({ id: "n2", postedAt: day(60), firstSeenAt: day(0) }),
    job({ id: "n3", postedAt: null, firstSeenAt: day(0) }),
  ];
  const { manifest, fetcher, reads } = fakeIndex([...old, ...fresh], 5);
  const r = await search(manifest, { maxJobs: 100, seenAfter: day(1) }, fetcher, NOW);
  assert.deepEqual(r.jobs.map((j) => j.id).sort(), ["n1", "n2", "n3"]);
  assert.ok(reads.length < manifest.shards.length, `read ${reads.length} of ${manifest.shards.length}`);
  // Nothing new since the latest index: no shard needs reading.
  const none = await search(manifest, { maxJobs: 100, seenAfter: day(0) }, fetcher, NOW);
  assert.equal(none.jobs.length, 0);
  assert.equal(none.shardsRead, 0);
});

test("monitor key: same filters, same key; limits and order ignored; name or filter change starts afresh", () => {
  const a = monitorKey({ titleKeywords: ["nurse"], locationKeywords: ["Ohio"], maxJobs: 100 }, undefined);
  assert.equal(a, monitorKey({ locationKeywords: ["Ohio"], titleKeywords: ["nurse"], maxJobs: 5, seenAfter: "x" }, undefined));
  assert.notEqual(a, monitorKey({ titleKeywords: ["nurse"], locationKeywords: ["Texas"], maxJobs: 100 }, undefined));
  assert.notEqual(a, monitorKey({ titleKeywords: ["nurse"], locationKeywords: ["Ohio"], maxJobs: 100 }, "Team A"));
  assert.match(monitorKey({ maxJobs: 1 }, "Ohio Nurses!"), /^ohio-nurses-[0-9a-f]{16}$/);
});

test("search stops at the deadline and says so", async () => {
  const jobs = Array.from({ length: 30 }, (_, i) => job({ id: `j${i}`, postedAt: day(i) }));
  const { manifest, fetcher } = fakeIndex(jobs, 5);
  const r = await search(manifest, { maxJobs: 100 }, fetcher, NOW, Date.now() - 1);
  assert.equal(r.timeLimited, true);
  assert.equal(r.shardsRead, 0);
  const all = await search(manifest, { maxJobs: 100 }, fetcher, NOW);
  assert.equal(all.timeLimited, false);
  assert.equal(all.jobs.length, 30);
});

test("short title keywords match whole words only (RN must not match External or Vernon)", () => {
  const m = makeMatcher({ titleKeywords: ["nurse", "RN"], maxJobs: 10 }, NOW);
  assert.equal(m(job({ id: "a", title: "RN - Med Surg" })), true);
  assert.equal(m(job({ id: "b", title: "Registered Nurse (RN)" })), true);
  assert.equal(m(job({ id: "c", title: "Copywriter - External Comms" })), false);
  assert.equal(m(job({ id: "d", title: "Practice Manager - Vernon Hills" })), false);
  const x = makeMatcher({ titleExcludeKeywords: ["VP"], maxJobs: 10 }, NOW);
  assert.equal(x(job({ id: "e", title: "VP of Sales" })), false);
  assert.equal(x(job({ id: "f", title: "MVP Product Engineer" })), true);
});
