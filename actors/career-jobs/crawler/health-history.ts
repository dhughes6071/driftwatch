/**
 * Hospital hiring history, kept for Stage 2 (Facility Hiring Signals; see
 * docs/private/stage2-proposal.md). Hospital jobs only, to keep it small.
 *
 * Without this, a closed role is deleted 3 days after it closes and the
 * clinical tags are rebuilt every night, so "reposted roles" and "rising
 * sign-on bonuses" could never be measured. Three tables:
 *
 *   health_tags    latest clinical tags of each live hospital role (working table)
 *   health_closed  every purged hospital role: title, facility, dates, tags (no description)
 *                  about 3,000 a day at ~1 KB, so ~1 GB a year
 *   health_daily   one row per day x system x facility x role family x primary
 *                  specialty x employment: open, opened, with a bonus, median bonus
 *
 * Nothing here may stop a crawl: crawl.ts catches and logs any error.
 */
import type Database from "better-sqlite3";
import { HEALTH_SYSTEMS } from "../src/health.ts";
import { clinicalTags, type ClinicalTags } from "../src/clinical.ts";
import { LIVE_WHERE, liveParams, loadFailing, type ClosedParams } from "./company-runs.ts";

export function healthHistorySchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_tags (
      id        TEXT PRIMARY KEY,
      tags      TEXT NOT NULL,      -- ClinicalTags as JSON
      tagged_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS health_closed (
      id         TEXT NOT NULL,
      first_seen TEXT NOT NULL,     -- with id: a role that closes, comes back and closes again has two rows
      system     TEXT NOT NULL,     -- AHRQ health_sys_id
      ats        TEXT NOT NULL,
      company    TEXT NOT NULL,
      title      TEXT,
      location   TEXT,
      posted_at  TEXT,
      last_seen  TEXT NOT NULL,
      purged_at  TEXT NOT NULL,
      tags       TEXT,              -- ClinicalTags as JSON; NULL if it closed before it was ever tagged
      light      TEXT NOT NULL,     -- the full IndexJob, minus the description
      PRIMARY KEY (id, first_seen)
    );
    CREATE INDEX IF NOT EXISTS health_closed_system ON health_closed(system, last_seen);
    CREATE TABLE IF NOT EXISTS health_daily (
      day          TEXT NOT NULL,   -- YYYY-MM-DD (UTC) of the crawl
      system       TEXT NOT NULL,
      location     TEXT NOT NULL,   -- the facility as the career site names it
      role_family  TEXT NOT NULL,
      specialty    TEXT NOT NULL,   -- first specialty named, '' if none
      employment   TEXT NOT NULL,   -- '' if not stated
      open         INTEGER NOT NULL,
      opened       INTEGER NOT NULL,
      with_bonus   INTEGER NOT NULL,
      median_bonus INTEGER,         -- of roles stating an amount
      PRIMARY KEY (day, system, location, role_family, specialty, employment)
    );
  `);
}

/** Temp table hospital_sources(ats, company, system) from the registry; company is lower-case. */
function loadHospitalSources(db: Database.Database) {
  db.exec(`
    DROP TABLE IF EXISTS temp.hospital_sources;
    CREATE TEMP TABLE hospital_sources (ats TEXT NOT NULL, company TEXT NOT NULL, system TEXT NOT NULL, PRIMARY KEY (ats, company));
  `);
  const put = db.prepare("INSERT OR IGNORE INTO hospital_sources VALUES (?, ?, ?)");
  db.transaction(() => {
    for (const s of HEALTH_SYSTEMS) {
      for (const key of s.sources) {
        const i = key.indexOf(":");
        put.run(key.slice(0, i), key.slice(i + 1).toLowerCase(), s.id);
      }
    }
  })();
}

/**
 * Copy the hospital roles about to be purged into health_closed. Pass as the
 * `beforeDelete` hook of purgeClosed(), which supplies the same condition it deletes by.
 */
export function archiveClosedHospitalRoles(db: Database.Database, where: string, params: ClosedParams, now: string): number {
  healthHistorySchema(db);
  loadHospitalSources(db);
  const n = db
    .prepare(
      `INSERT OR REPLACE INTO health_closed
         (id, first_seen, system, ats, company, title, location, posted_at, last_seen, purged_at, tags, light)
       SELECT jobs.id, jobs.first_seen, h.system, jobs.ats, jobs.company,
              json_extract(jobs.light, '$.title'), json_extract(jobs.light, '$.location'),
              jobs.posted_at, jobs.last_seen, @now, t.tags, jobs.light
       FROM jobs
       JOIN hospital_sources h ON h.ats = jobs.ats AND h.company = lower(jobs.company)
       LEFT JOIN health_tags t ON t.id = jobs.id
       WHERE ${where}`,
    )
    .run({ ...params, now }).changes;
  db.exec("DROP TABLE temp.hospital_sources");
  return n;
}

interface Cell {
  system: string;
  location: string;
  role_family: string;
  specialty: string;
  employment: string;
  open: number;
  opened: number;
  with_bonus: number;
  bonuses: number[];
}

/**
 * Tag every live hospital role, save the tags (health_tags), and write the
 * day's health_daily rows. Live = what publish.ts will list (LIVE_WHERE).
 * `runAt` is the crawl's started_at. Returns how many roles were tagged.
 */
export function recordHealthDay(db: Database.Database, runAt: string): { roles: number; rows: number; failed: number } {
  healthHistorySchema(db);
  loadHospitalSources(db);
  loadFailing(db);
  const rows = db
    .prepare(
      `SELECT jobs.id, jobs.light, jobs.description, jobs.first_seen, h.system
       FROM jobs JOIN hospital_sources h ON h.ats = jobs.ats AND h.company = lower(jobs.company)
       WHERE ${LIVE_WHERE}`,
    )
    .iterate(liveParams(runAt)) as IterableIterator<{ id: string; light: string; description: string | null; first_seen: string; system: string }>;

  // Collect first: better-sqlite3 cannot write while an iterator is open on the connection.
  const tagged: Array<{ id: string; tags: string }> = [];
  const cells = new Map<string, Cell>();
  let failed = 0;
  for (const r of rows) {
    const j = JSON.parse(r.light) as { title: string; department?: string | null; employmentType?: string | null; location?: string | null };
    let tags: ClinicalTags;
    try {
      tags = clinicalTags({ title: j.title, department: j.department, employmentType: j.employmentType, description: r.description });
    } catch {
      failed++;
      continue;
    }
    tagged.push({ id: r.id, tags: JSON.stringify(tags) });
    const c = {
      system: r.system,
      location: j.location ?? "",
      role_family: tags.roleFamily,
      specialty: tags.specialties[0] ?? "",
      employment: tags.employment ?? "",
    };
    const key = Object.values(c).join("\u0000");
    const cell = cells.get(key) ?? { ...c, open: 0, opened: 0, with_bonus: 0, bonuses: [] };
    cell.open++;
    if (r.first_seen === runAt) cell.opened++;
    if (tags.signOnBonus) cell.with_bonus++;
    if (tags.signOnBonusAmount != null) cell.bonuses.push(tags.signOnBonusAmount);
    cells.set(key, cell);
  }

  const day = runAt.slice(0, 10);
  const putTags = db.prepare("INSERT OR REPLACE INTO health_tags (id, tags, tagged_at) VALUES (?, ?, ?)");
  const putDay = db.prepare(
    `INSERT INTO health_daily (day, system, location, role_family, specialty, employment, open, opened, with_bonus, median_bonus)
     VALUES (@day, @system, @location, @role_family, @specialty, @employment, @open, @opened, @with_bonus, @median_bonus)`,
  );
  db.transaction(() => {
    for (const t of tagged) putTags.run(t.id, t.tags, runAt);
    // Tags of roles no longer stored are not needed again (health_closed has its own copy).
    db.exec("DELETE FROM health_tags WHERE id NOT IN (SELECT id FROM jobs)");
    // A second run on the same day replaces the first.
    db.prepare("DELETE FROM health_daily WHERE day = ?").run(day);
    for (const c of cells.values()) {
      const { bonuses, ...rest } = c;
      putDay.run({ ...rest, day, median_bonus: median(bonuses) });
    }
  })();
  db.exec("DROP TABLE temp.hospital_sources");
  return { roles: tagged.length, rows: cells.size, failed };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
