/**
 * Did each company's career site load today? The answer decides what a
 * missing role means.
 *
 * Before this, a site that failed to load looked exactly like a company that
 * had closed every role: its roles were purged after 3 days and, when the
 * site came back, re-inserted as brand new (16 Oct 2026: 143 companies,
 * 27,465 roles -- SpaceX and Anduril whole boards, Mass General Brigham 1,956
 * of 2,035 roles, SiFive back with 121 "new" roles posted months earlier).
 *
 * Now every run writes one company_runs row per company:
 *
 *   ok       1 = the whole list loaded, so a role missing from it is closed
 *   open     roles seen this run
 *   opened   of those, first seen this run
 *   closed   roles open at the company's last good load, missing now (NULL when not ok)
 *   expected roles believed open before this run (what the outage guard compares to)
 *   note     'error' (did not load), 'drop' (loaded, but under half of expected),
 *            'drop accepted' (the same drop for DROP_ACCEPT_RUNS runs: believed)
 *
 * and a company whose latest row is not ok keeps its roles as they were at
 * its last good load: not purged (for up to KEEP_STORED_DAYS) and still
 * published (for up to KEEP_PUBLISHED_DAYS). The daily rows are also the
 * history a net hiring-growth measure needs (research/hiring-growth-proposal.md).
 */
import type Database from "better-sqlite3";

/** Roles of a company that loaded fine are closed once unseen this long. */
export const PURGE_DAYS = 3;
/** A company that keeps failing: its unseen roles stay in the index this long... */
export const KEEP_PUBLISHED_DAYS = 7;
/** ...and in the database this long, so a site back within a month keeps its roles' first-seen dates. */
export const KEEP_STORED_DAYS = 30;
/** Outage guard: a load with under half the expected roles is a failure, when at least this many were expected. */
export const DROP_MIN = 50;
/** A drop seen on this many runs in a row is believed (the company really did close the roles). */
export const DROP_ACCEPT_RUNS = 7;

const DAY = 86_400_000;
const daysBefore = (iso: string, days: number) => new Date(Date.parse(iso) - days * DAY).toISOString();

export function companyRunsSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_runs (
      ats      TEXT NOT NULL,
      company  TEXT NOT NULL,
      day      TEXT NOT NULL,      -- YYYY-MM-DD (UTC) of the run; a second run that day replaces the row
      run_at   TEXT NOT NULL,      -- runs.started_at
      ok       INTEGER NOT NULL,
      open     INTEGER NOT NULL,
      opened   INTEGER NOT NULL,
      closed   INTEGER,
      expected INTEGER NOT NULL,
      note     TEXT,
      PRIMARY KEY (ats, company, day)
    );
    -- Per-company counts without reading the 11 GB of descriptions.
    CREATE INDEX IF NOT EXISTS jobs_company ON jobs(ats, company, last_seen, first_seen);
  `);
}

/**
 * Companies whose latest company_runs row is not ok, with `since` = the
 * start of their last good load ('' if they never had one), in temp table
 * `failing`. Their roles seen since then are kept.
 */
export function loadFailing(db: Database.Database) {
  db.exec(`
    DROP TABLE IF EXISTS temp.failing;
    CREATE TEMP TABLE failing (ats TEXT NOT NULL, company TEXT NOT NULL, since TEXT NOT NULL, PRIMARY KEY (ats, company));
    INSERT INTO failing
      SELECT l.ats, l.company,
             COALESCE((SELECT MAX(run_at) FROM company_runs g WHERE g.ats = l.ats AND g.company = l.company AND g.ok = 1), '')
      FROM (SELECT ats, company, ok, MAX(day) FROM company_runs GROUP BY ats, company) l
      WHERE l.ok = 0;
  `);
  return (db.prepare("SELECT COUNT(*) AS n FROM failing").get() as { n: number }).n;
}

/**
 * SQL condition (on `jobs`) for "in the published index", with named
 * parameters from liveParams(). Live = seen in the latest run or the day
 * before -- or, for a company that is failing, seen at or after its last good
 * load and within KEEP_PUBLISHED_DAYS. Call loadFailing() first.
 */
export const LIVE_WHERE = `jobs.last_seen >= @weekAgo AND (
  jobs.last_seen >= @liveSince OR EXISTS (
    SELECT 1 FROM failing f WHERE f.ats = jobs.ats AND f.company = jobs.company AND jobs.last_seen >= MAX(f.since, @weekAgo)))`;

export function liveParams(lastRunAt: string) {
  return { liveSince: daysBefore(lastRunAt, 1), weekAgo: daysBefore(lastRunAt, KEEP_PUBLISHED_DAYS) };
}

/**
 * Delete closed roles: unseen for PURGE_DAYS, unless their company is failing
 * (then they are kept while seen since its last good load, up to KEEP_STORED_DAYS).
 */
export function purgeClosed(db: Database.Database, now: string) {
  loadFailing(db);
  return db
    .prepare(
      `DELETE FROM jobs WHERE last_seen < @cutoff AND NOT EXISTS (
         SELECT 1 FROM failing f WHERE f.ats = jobs.ats AND f.company = jobs.company AND jobs.last_seen >= MAX(f.since, @hard))`,
    )
    .run({ cutoff: daysBefore(now, PURGE_DAYS), hard: daysBefore(now, KEEP_STORED_DAYS) }).changes;
}

export interface CompanyResult {
  ats: string;
  company: string;
  ok: boolean;
  open: number;
  opened: number;
  closed: number | null;
  expected: number;
  note: string | null;
}

/**
 * Collects, during a crawl, whether each company loaded; then writes the day's
 * company_runs rows. One company can span several career sites (665 Workday
 * tenants have more than one): it is ok only if all of them loaded.
 */
export class CompanyRuns {
  private readonly loaded = new Map<string, { ats: string; company: string; ok: boolean }>();

  /** Record one fetch for a company. `company` must be the jobs.company value its roles are stored under. */
  mark(ats: string, company: string, ok: boolean) {
    const key = `${ats}\u0000${company}`;
    const prev = this.loaded.get(key);
    this.loaded.set(key, { ats, company, ok: (prev?.ok ?? true) && ok });
  }

  get size() {
    return this.loaded.size;
  }

  /**
   * Count each company's roles, apply the outage guard, and write the rows.
   * `runAt` is the crawl's started_at (every role seen in it has last_seen = runAt).
   */
  finish(db: Database.Database, runAt: string): CompanyResult[] {
    const day = runAt.slice(0, 10);
    const prevRun =
      (db.prepare("SELECT MAX(started_at) AS t FROM runs WHERE finished_at IS NOT NULL AND started_at < ?").get(runAt) as {
        t: string | null;
      }).t ?? "";

    // Last good load before this run, per company.
    db.exec(`
      DROP TABLE IF EXISTS temp.last_ok;
      CREATE TEMP TABLE last_ok (ats TEXT NOT NULL, company TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (ats, company));
    `);
    db.prepare("INSERT INTO last_ok SELECT ats, company, MAX(run_at) FROM company_runs WHERE ok = 1 AND run_at < ? GROUP BY ats, company").run(
      runAt,
    );

    // expected: roles open at the last good load and anything seen since (before
    //   today); with no history yet, every role still stored for the company.
    // closed: of those, the ones not seen today. With no history, "seen in the
    //   previous run but not today".
    const counts = db
      .prepare(
        `SELECT jobs.ats, jobs.company,
                SUM(last_seen = @runAt) AS open,
                SUM(first_seen = @runAt) AS opened,
                SUM(first_seen < @runAt AND last_seen >= COALESCE(o.at, '')) AS expected,
                SUM(last_seen < @runAt AND last_seen >= COALESCE(o.at, @prevRun)) AS closed
         FROM jobs LEFT JOIN last_ok o ON o.ats = jobs.ats AND o.company = jobs.company
         GROUP BY jobs.ats, jobs.company`,
      )
      .all({ runAt, prevRun }) as Array<{ ats: string; company: string; open: number; opened: number; expected: number; closed: number }>;
    const byKey = new Map(counts.map((c) => [`${c.ats}\u0000${c.company}`, c]));

    const recent = db.prepare("SELECT note FROM company_runs WHERE ats = ? AND company = ? AND day < ? ORDER BY day DESC LIMIT ?");
    const put = db.prepare(
      `INSERT OR REPLACE INTO company_runs (ats, company, day, run_at, ok, open, opened, closed, expected, note)
       VALUES (@ats, @company, @day, @runAt, @ok, @open, @opened, @closed, @expected, @note)`,
    );

    const out: CompanyResult[] = [];
    db.transaction(() => {
      for (const [key, l] of this.loaded) {
        const c = byKey.get(key) ?? { open: 0, opened: 0, expected: 0, closed: 0 };
        let ok = l.ok;
        let note: string | null = ok ? null : "error";
        if (ok && c.expected >= DROP_MIN && c.open < c.expected / 2) {
          // Outage guard: real companies rarely close half their roles overnight; broken paging does it often.
          const prior = recent.all(l.ats, l.company, day, DROP_ACCEPT_RUNS - 1) as Array<{ note: string | null }>;
          const longDrop = prior.length === DROP_ACCEPT_RUNS - 1 && prior.every((p) => p.note === "drop");
          ok = longDrop;
          note = longDrop ? "drop accepted" : "drop";
        }
        const r: CompanyResult = {
          ats: l.ats,
          company: l.company,
          ok,
          open: c.open,
          opened: c.opened,
          closed: ok ? c.closed : null,
          expected: c.expected,
          note,
        };
        put.run({ ...r, ok: ok ? 1 : 0, day, runAt });
        out.push(r);
      }
    })();
    db.exec("DROP TABLE temp.last_ok");
    return out;
  }
}
