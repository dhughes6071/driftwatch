import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { findDrops, isFullRun, notRecovered, readRuns, sourceCounts, type RunStats } from "../crawler/source-drops.ts";

const normal = (workday = 780_000, extra: Partial<RunStats> = {}): RunStats => ({
  workdayJobs: workday,
  oracleJobs: 360_000,
  srJobs: 222_000,
  atsJobs: 120_000,
  small: { bamboohr: { jobs: 27_700 }, ukg: { jobs: 116_000 }, phenom: { jobs: 300 } },
  ...extra,
});

test("17 Oct 2026: Workday at 44k of ~780k is a drop; the other sources are not", () => {
  const drops = findDrops(normal(44_090), [normal(775_827), normal(786_021), normal(799_113)]);
  assert.deepEqual(drops, [{ source: "workday", jobs: 44_090, usual: 786_021 }]);
});

test("ordinary night-to-night movement, and exactly half, do not alert", () => {
  assert.deepEqual(findDrops(normal(700_000), [normal(824_000), normal(831_000)]), []);
  assert.deepEqual(findDrops(normal(400_000), [normal(800_000)]), []);
});

test("usual is a median, so one bad night does not hide a second one", () => {
  const history = [normal(44_090), normal(775_827), normal(786_021)];
  assert.equal(findDrops(normal(50_000), history)[0]?.source, "workday");
  // ...and the night after the bad one, a normal count is fine.
  assert.deepEqual(findDrops(normal(778_650), history), []);
});

test("a source missing from the latest run counts as zero; a new or tiny source is not judged", () => {
  const latest = normal(780_000, { small: { ukg: { jobs: 116_000 }, phenom: { jobs: 10 }, icims: { jobs: 5_000 } } });
  assert.deepEqual(findDrops(latest, [normal(), normal()]), [{ source: "bamboohr", jobs: 0, usual: 27_700 }]);
});

test("no history: nothing to compare against", () => {
  assert.deepEqual(findDrops(normal(10), []), []);
});

test("catch-up (CRAWL_ONLY) and trial (CRAWL_LIMIT) runs are not full runs", () => {
  assert.equal(isFullRun({ ...normal(), only: null, limit: null }), true);
  assert.equal(isFullRun({ ...normal(), only: ["workday"], limit: null }), false);
  assert.equal(isFullRun({ ...normal(), only: null, limit: 20 }), false);
  // Recorded before `only` existed: the 17 Oct 07:00 Workday-only run had no small systems.
  assert.equal(isFullRun({ workdayJobs: 778_650, oracleJobs: 0, srJobs: 0, atsJobs: 0, small: {} }), false);
  assert.equal(isFullRun(normal()), true);
});

test("sourceCounts flattens the stats JSON", () => {
  assert.deepEqual(sourceCounts({ workdayJobs: 1, small: { ukg: { jobs: 2 } } }), {
    workday: 1, oracle: 0, smartrecruiters: 0, ats: 0, ukg: 2,
  });
});

test("readRuns skips unfinished and catch-up runs", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE runs (started_at TEXT PRIMARY KEY, finished_at TEXT, stats TEXT)");
  const put = db.prepare("INSERT INTO runs VALUES (?, ?, ?)");
  put.run("2026-10-16T08:30:00Z", "x", JSON.stringify(normal(775_827)));
  put.run("2026-10-17T08:33:00Z", "x", JSON.stringify(normal(44_090)));
  put.run("2026-10-17T11:58:00Z", "x", JSON.stringify({ workdayJobs: 778_650, small: {}, only: ["workday"], limit: null }));
  put.run("2026-10-18T08:30:00Z", null, null);
  const { latest, previous, catchUps } = readRuns(db);
  assert.equal(latest?.workdayJobs, 44_090);
  assert.deepEqual(previous.map((r) => r.workdayJobs), [775_827]);
  assert.deepEqual(catchUps.map((r) => r.workdayJobs), [778_650]);
  const drops = findDrops(latest!, previous);
  assert.equal(drops[0]?.source, "workday");
  // The Workday-only catch-up run made it good, so no alert is left.
  assert.deepEqual(notRecovered(drops, catchUps), []);
});

test("a catch-up run clears only the source it brought back", () => {
  const drops = [{ source: "workday", jobs: 44_090, usual: 786_021 }, { source: "ukg", jobs: 0, usual: 116_000 }];
  const catchUp: RunStats = { workdayJobs: 778_650, small: {}, only: ["workday"], limit: null };
  assert.deepEqual(notRecovered(drops, [catchUp]).map((d) => d.source), ["ukg"]);
  // A catch-up that also came back short clears nothing.
  assert.equal(notRecovered(drops, [{ ...catchUp, workdayJobs: 50_000 }]).length, 2);
});
