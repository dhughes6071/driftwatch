import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../crawler/crawl.ts";
import { CompanyRuns, purgeClosed } from "../crawler/company-runs.ts";
import { archiveClosedHospitalRoles, median, recordHealthDay } from "../crawler/health-history.ts";
import { healthSystemFor } from "../src/health.ts";

type Db = ReturnType<typeof openDb>;
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 9, 30)).toISOString(); // 09:30Z on <day> Nov 2026
const TRINITY = healthSystemFor("workday", "trinityhealth")!.id;

interface Role {
  id: string;
  company: string;
  title: string;
  location: string;
  description?: string;
}
const rn = (n: number, extra: Partial<Role> = {}): Role => ({
  id: `workday:trinityhealth:${n}`,
  company: "TrinityHealth", // mixed case on purpose: the registry key is lower-case
  title: "Registered Nurse RN ICU",
  location: "Saint Alphonsus Medical Center - Nampa, Idaho",
  description: "Full time. $10,000 sign-on bonus for experienced nurses.",
  ...extra,
});
const tech = (n: number): Role => ({ id: `greenhouse:acme:${n}`, company: "acme", title: "Software Engineer", location: "Remote" });

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "health-history-"));
  const db = openDb(join(dir, "t.db"));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The end of crawl.ts: save roles, write company_runs, archive + purge, record the day. */
function crawlDay(db: Db, day: number, roles: Role[]) {
  const runAt = at(day);
  db.prepare("INSERT INTO runs (started_at) VALUES (?)").run(runAt);
  const exists = db.prepare("SELECT 1 FROM jobs WHERE id = ?");
  const touch = db.prepare("UPDATE jobs SET last_seen = ? WHERE id = ?");
  const insert = db.prepare("INSERT INTO jobs (id, ats, company, light, description, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const loaded = new CompanyRuns();
  for (const r of roles) {
    const ats = r.id.split(":")[0];
    const light = JSON.stringify({ id: r.id, ats, company: r.company, title: r.title, location: r.location, employmentType: null });
    if (exists.get(r.id)) touch.run(runAt, r.id);
    else insert.run(r.id, ats, r.company, light, r.description ?? null, runAt, runAt);
    loaded.mark(ats, r.company, true);
  }
  loaded.mark("workday", "TrinityHealth", true); // the site loaded, even on a day with no roles
  loaded.finish(db, runAt);
  const now = new Date(Date.parse(runAt) + 2 * 3_600_000).toISOString();
  let archived = 0;
  const purged = purgeClosed(db, now, (where, params) => (archived = archiveClosedHospitalRoles(db, where, params, now)));
  const recorded = recordHealthDay(db, runAt);
  db.prepare("UPDATE runs SET finished_at = ? WHERE started_at = ?").run(runAt, runAt);
  return { archived, purged, recorded };
}

const daily = (db: Db, day: number) =>
  db.prepare("SELECT * FROM health_daily WHERE day = ? ORDER BY location, role_family").all(at(day).slice(0, 10)) as Array<Record<string, unknown>>;

test("hospital roles are tagged and counted per facility each day; other companies are ignored", () => {
  withDb((db) => {
    const r = crawlDay(db, 1, [rn(1), rn(2), rn(3, { location: "Saint Joseph Mercy - Ann Arbor, MI", description: "Per diem." }), tech(1)]);
    assert.deepEqual(r.recorded, { roles: 3, rows: 2, failed: 0 });
    const rows = daily(db, 1);
    assert.equal(rows.length, 2);
    const nampa = rows.find((x) => String(x.location).includes("Nampa"))!;
    assert.deepEqual(
      [nampa.system, nampa.role_family, nampa.specialty, nampa.open, nampa.opened, nampa.with_bonus, nampa.median_bonus],
      [TRINITY, "Registered nurse", "ICU", 2, 2, 2, 10000],
    );
    const tagged = (db.prepare("SELECT COUNT(*) AS n FROM health_tags").get() as { n: number }).n;
    assert.equal(tagged, 3, "only hospital roles are tagged");

    crawlDay(db, 2, [rn(1), rn(2), rn(4), tech(1)]);
    const nampa2 = daily(db, 2).find((x) => String(x.location).includes("Nampa"))!;
    assert.deepEqual([nampa2.open, nampa2.opened], [3, 1], "day 2: three open, one new");
  });
});

test("a closed hospital role is kept in health_closed with its tags when it is purged; others are just deleted", () => {
  withDb((db) => {
    crawlDay(db, 1, [rn(1), rn(2), tech(1), tech(2)]);
    // rn(2) and tech(2) close on day 2; purged once unseen for 3 days.
    let r = crawlDay(db, 2, [rn(1), tech(1)]);
    assert.equal(r.archived, 0);
    for (let d = 3; d <= 4; d++) r = crawlDay(db, d, [rn(1), tech(1)]);
    assert.deepEqual([r.archived, r.purged], [1, 2]);

    const closed = db.prepare("SELECT * FROM health_closed").all() as Array<Record<string, string>>;
    assert.equal(closed.length, 1);
    assert.equal(closed[0].id, rn(2).id);
    assert.equal(closed[0].system, TRINITY);
    assert.equal(closed[0].title, "Registered Nurse RN ICU");
    assert.equal(closed[0].first_seen, at(1));
    assert.equal(closed[0].last_seen, at(1));
    assert.equal(JSON.parse(closed[0].tags).signOnBonusAmount, 10000);
    // Its working tags row is gone with the job.
    assert.equal(db.prepare("SELECT 1 FROM health_tags WHERE id = ?").get(rn(2).id), undefined);
  });
});

test("a role that closes, comes back and closes again keeps both stints", () => {
  withDb((db) => {
    crawlDay(db, 1, [rn(1), rn(9)]);
    for (let d = 2; d <= 4; d++) crawlDay(db, d, [rn(1)]); // rn(9) purged on day 4
    crawlDay(db, 5, [rn(1), rn(9)]); // reposted under the same id
    for (let d = 6; d <= 8; d++) crawlDay(db, d, [rn(1)]);
    const stints = db.prepare("SELECT first_seen FROM health_closed WHERE id = ? ORDER BY first_seen").all(rn(9).id) as Array<{ first_seen: string }>;
    assert.deepEqual(stints.map((s) => s.first_seen), [at(1), at(5)]);
  });
});

test("a second run on the same day replaces that day's counts", () => {
  withDb((db) => {
    crawlDay(db, 1, [rn(1), rn(2)]);
    recordHealthDay(db, at(1));
    assert.equal(daily(db, 1).reduce((n, x) => n + Number(x.open), 0), 2);
  });
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([5000]), 5000);
  assert.equal(median([20000, 5000, 10000]), 10000);
  assert.equal(median([5000, 10000]), 7500);
});
