import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../crawler/crawl.ts";
import { CompanyRuns, LIVE_WHERE, liveParams, loadFailing, purgeClosed } from "../crawler/company-runs.ts";
import { WorkdayClient } from "../../workday-jobs/src/workday.ts";
import { fetchCompany } from "../../../src/jobs/ats.ts";

// ------------------------------------------------------------------ a tiny crawl on a temp database

type Db = ReturnType<typeof openDb>;
/** What one company's fetch returned in a run: its role ids, or "error" when the list did not load. */
type Fetched = string[] | "error" | { partOf: string[]; failedSite: true };

const at = (day: number) => new Date(Date.UTC(2026, 9, day, 8, 30)).toISOString(); // 08:30Z on <day> Oct 2026
const ids = (prefix: string, n: number, from = 0) => Array.from({ length: n }, (_, i) => `${prefix}:${from + i}`);

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "company-runs-"));
  const db = openDb(join(dir, "t.db"));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Same steps as crawl.ts: save what loaded, mark each company, write company_runs, purge. */
function crawlDay(db: Db, day: number, fetched: Record<string, Fetched>) {
  const runAt = at(day);
  db.prepare("INSERT INTO runs (started_at) VALUES (?)").run(runAt);
  const exists = db.prepare("SELECT 1 FROM jobs WHERE id = ?");
  const touch = db.prepare("UPDATE jobs SET last_seen = ? WHERE id = ?");
  const insert = db.prepare(
    "INSERT INTO jobs (id, ats, company, light, first_seen, last_seen) VALUES (?, ?, ?, '{}', ?, ?)",
  );
  const loaded = new CompanyRuns();
  for (const [key, f] of Object.entries(fetched)) {
    const [ats, company] = key.split(":");
    if (f === "error") {
      loaded.mark(ats, company, false);
      continue;
    }
    const seen = Array.isArray(f) ? f : f.partOf;
    for (const id of seen) {
      if (exists.get(id)) touch.run(runAt, id);
      else insert.run(id, ats, company, runAt, runAt);
    }
    loaded.mark(ats, company, true);
    if (!Array.isArray(f)) loaded.mark(ats, company, false); // a second career site of the same company failed
  }
  const results = loaded.finish(db, runAt);
  const purged = purgeClosed(db, new Date(Date.parse(runAt) + 2 * 3_600_000).toISOString());
  db.prepare("UPDATE runs SET finished_at = ? WHERE started_at = ?").run(runAt, runAt);
  return { results: Object.fromEntries(results.map((r) => [`${r.ats}:${r.company}`, r])), purged };
}

/** The ids publish.ts would put in the index after the run on <day>. */
function published(db: Db, day: number, company?: string) {
  loadFailing(db);
  const rows = db.prepare(`SELECT id, company FROM jobs WHERE ${LIVE_WHERE}`).all(liveParams(at(day))) as Array<{ id: string; company: string }>;
  return rows.filter((r) => !company || r.company === company).map((r) => r.id);
}

const stored = (db: Db, company: string) =>
  (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE company = ?").get(company) as { n: number }).n;
const firstSeen = (db: Db, id: string) => (db.prepare("SELECT first_seen FROM jobs WHERE id = ?").get(id) as { first_seen: string }).first_seen;

// ------------------------------------------------------------------ the 16 Oct cases

test("SpaceX: a board that does not load keeps its roles, listed for a week, and they return with their old dates", () => {
  withDb((db) => {
    const roles = ids("greenhouse:spacex", 300);
    crawlDay(db, 1, { "greenhouse:spacex": roles });
    for (let d = 2; d <= 9; d++) {
      const { results } = crawlDay(db, d, { "greenhouse:spacex": "error" });
      assert.equal(results["greenhouse:spacex"].ok, false);
      assert.equal(results["greenhouse:spacex"].note, "error");
      assert.equal(results["greenhouse:spacex"].closed, null, "a failed load says nothing about closures");
      assert.equal(stored(db, "spacex"), 300, `day ${d}: nothing purged (the old rule deleted them after 3 days)`);
      // Listed while the last good load is at most a week old.
      assert.equal(published(db, d, "spacex").length, d <= 8 ? 300 : 0, `day ${d}`);
    }
    const { results } = crawlDay(db, 10, { "greenhouse:spacex": roles });
    assert.equal(results["greenhouse:spacex"].ok, true);
    assert.equal(results["greenhouse:spacex"].opened, 0, "back after 8 days of errors: nothing looks new");
    assert.equal(results["greenhouse:spacex"].closed, 0);
    assert.equal(firstSeen(db, roles[0]), at(1));
    assert.equal(published(db, 10, "spacex").length, 300);
  });
});

test("Anduril: a board that loads but comes back empty is an outage, not 120 closures", () => {
  withDb((db) => {
    crawlDay(db, 1, { "greenhouse:andurilindustries": ids("greenhouse:andurilindustries", 120) });
    const { results } = crawlDay(db, 2, { "greenhouse:andurilindustries": [] });
    const r = results["greenhouse:andurilindustries"];
    assert.deepEqual([r.ok, r.note, r.open, r.expected], [false, "drop", 0, 120]);
    assert.equal(published(db, 2, "andurilindustries").length, 120);
  });
});

test("Mass General Brigham: 79 of 2,035 roles is a broken load; the other 1,956 stay", () => {
  withDb((db) => {
    const roles = ids("workday:mgb", 2035);
    crawlDay(db, 1, { "workday:mgb": roles });
    for (let d = 2; d <= 5; d++) {
      const { results } = crawlDay(db, d, { "workday:mgb": roles.slice(0, 79) });
      assert.deepEqual([results["workday:mgb"].ok, results["workday:mgb"].note, results["workday:mgb"].expected], [false, "drop", 2035]);
      assert.equal(stored(db, "mgb"), 2035, `day ${d}`);
      assert.equal(published(db, d, "mgb").length, 2035, `day ${d}`);
    }
    const { results } = crawlDay(db, 6, { "workday:mgb": roles });
    assert.deepEqual([results["workday:mgb"].ok, results["workday:mgb"].opened, results["workday:mgb"].closed], [true, 0, 0]);
  });
});

test("SiFive: a site down for 5 days comes back with 0 new roles, not 121", () => {
  withDb((db) => {
    const roles = ids("workday:sifive", 121);
    crawlDay(db, 1, { "workday:sifive": roles });
    for (let d = 2; d <= 6; d++) crawlDay(db, d, { "workday:sifive": "error" });
    const { results } = crawlDay(db, 7, { "workday:sifive": roles });
    assert.equal(results["workday:sifive"].opened, 0);
    assert.equal(firstSeen(db, roles[50]), at(1));
  });
});

// ------------------------------------------------------------------ real closures still close

test("a company that loads fine: missing roles are closed once, and purged after 3 days", () => {
  withDb((db) => {
    const roles = ids("lever:acme", 10);
    crawlDay(db, 1, { "lever:acme": roles });
    let r = crawlDay(db, 2, { "lever:acme": [...roles.slice(2), "lever:acme:new"] }).results["lever:acme"];
    assert.deepEqual([r.ok, r.open, r.opened, r.closed], [true, 9, 1, 2]);
    r = crawlDay(db, 3, { "lever:acme": [...roles.slice(2), "lever:acme:new"] }).results["lever:acme"];
    assert.equal(r.closed, 0, "a role is counted closed once, not every day it stays missing");
    assert.equal(stored(db, "acme"), 11);
    crawlDay(db, 4, { "lever:acme": [...roles.slice(2), "lever:acme:new"] });
    assert.equal(stored(db, "acme"), 9, "unseen for 3 runs at a company that loaded: purged");
  });
});

test("a role already closed at the last good load is not brought back by a later failure", () => {
  withDb((db) => {
    const roles = ids("ashby:acme", 10);
    crawlDay(db, 1, { "ashby:acme": roles });
    crawlDay(db, 2, { "ashby:acme": roles.slice(1) }); // roles[0] closed
    crawlDay(db, 3, { "ashby:acme": "error" });
    const live = published(db, 3, "acme");
    assert.equal(live.length, 9);
    assert.ok(!live.includes(roles[0]));
    crawlDay(db, 4, { "ashby:acme": "error" });
    crawlDay(db, 5, { "ashby:acme": "error" });
    assert.equal(stored(db, "acme"), 9, "roles[0] is purged even though the company is failing now");
  });
});

test("small companies are not guarded: 40 roles down to 10 is believed", () => {
  withDb((db) => {
    crawlDay(db, 1, { "ashby:tiny": ids("ashby:tiny", 40) });
    const r = crawlDay(db, 2, { "ashby:tiny": ids("ashby:tiny", 10) }).results["ashby:tiny"];
    assert.deepEqual([r.ok, r.note, r.closed], [true, null, 30]);
  });
});

test("a drop that lasts 7 runs is believed, and its roles are then closed", () => {
  withDb((db) => {
    const roles = ids("workday:shrink", 200);
    crawlDay(db, 1, { "workday:shrink": roles });
    for (let d = 2; d <= 7; d++) assert.equal(crawlDay(db, d, { "workday:shrink": roles.slice(0, 60) }).results["workday:shrink"].note, "drop");
    const r = crawlDay(db, 8, { "workday:shrink": roles.slice(0, 60) }).results["workday:shrink"];
    assert.deepEqual([r.ok, r.note, r.closed], [true, "drop accepted", 140]);
    assert.equal(stored(db, "shrink"), 60, "the 140 unseen for a week are purged");
    const next = crawlDay(db, 9, { "workday:shrink": roles.slice(0, 60) }).results["workday:shrink"];
    assert.deepEqual([next.ok, next.note, next.expected], [true, null, 60]);
  });
});

test("one company, two career sites: it only counts as loaded if both loaded", () => {
  withDb((db) => {
    crawlDay(db, 1, { "workday:twosite": ids("workday:twosite", 30) });
    const r = crawlDay(db, 2, { "workday:twosite": { partOf: ids("workday:twosite", 20), failedSite: true } }).results["workday:twosite"];
    assert.equal(r.ok, false);
    assert.equal(published(db, 2, "twosite").length, 30);
  });
});

test("a company failing for over 30 days is finally purged", () => {
  withDb((db) => {
    crawlDay(db, 1, { "greenhouse:gone": ids("greenhouse:gone", 5) });
    crawlDay(db, 30, { "greenhouse:gone": "error" });
    assert.equal(stored(db, "gone"), 5);
    crawlDay(db, 32, { "greenhouse:gone": "error" });
    assert.equal(stored(db, "gone"), 0);
  });
});

test("first run after the change: no history yet, the guard compares with what is stored", () => {
  withDb((db) => {
    // Roles stored by the old crawler (no company_runs rows yet).
    const insert = db.prepare("INSERT INTO jobs (id, ats, company, light, first_seen, last_seen) VALUES (?, 'workday', 'mgb', '{}', ?, ?)");
    for (const id of ids("workday:mgb", 2035)) insert.run(id, at(1), at(15));
    db.prepare("INSERT INTO runs (started_at, finished_at) VALUES (?, ?)").run(at(15), at(15));
    const r = crawlDay(db, 16, { "workday:mgb": ids("workday:mgb", 79) }).results["workday:mgb"];
    assert.deepEqual([r.ok, r.note, r.expected], [false, "drop", 2035]);
  });
});

// ------------------------------------------------------------------ the fetchers report failures

test("Greenhouse/Ashby/Lever: strict fetch throws when the list does not load; default still returns []", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
  try {
    assert.deepEqual(await fetchCompany("greenhouse", "spacex"), []);
    await assert.rejects(fetchCompany("greenhouse", "spacex", undefined, true), /did not load/);
    await assert.rejects(fetchCompany("ashby", "acme", undefined, true), /did not load/);
    await assert.rejects(fetchCompany("lever", "acme", undefined, true), /did not load/);
  } finally {
    globalThis.fetch = real;
  }
});

test("Workday: a list page that fails is reported, so the site does not count as loaded", async () => {
  const posting = (i: number) => ({ title: `Role ${i}`, externalPath: `/job/${i}`, locationsText: "Boston", postedOn: "Posted Today" });
  const fake = (async (_url: string, init: RequestInit) => {
    const { offset } = JSON.parse(String(init.body)) as { offset: number };
    if (offset === 20) return new Response("", { status: 404 }); // page 2 of 3 does not load
    return Response.json({ total: 50, facets: [], jobPostings: Array.from({ length: 20 }, (_, i) => posting(offset + i)).slice(0, 50 - offset) });
  }) as unknown as typeof fetch;
  let failed = 0;
  let seen = 0;
  await new WorkdayClient(fake, 30_000, { ratePerSecond: Infinity }).collect(
    { host: "mgb.wd1.myworkdayjobs.com", tenant: "mgb", site: "MGBExternal" },
    { onPosting: () => void seen++, onPageFailed: () => void failed++ },
  );
  assert.equal(failed, 1);
  assert.equal(seen, 30);
});
