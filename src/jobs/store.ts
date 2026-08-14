/**
 * Verified-company registry.
 *
 * The seed list is guesses; this table is the asset. Every row here is a
 * company/ATS pair we have confirmed resolves to a real job board, along with
 * how many jobs it had when we last looked.
 *
 * This is the part that compounds. A competitor can copy the code in an
 * afternoon; they cannot copy a verified list without doing the same probing,
 * and the list gets more valuable every time it is refreshed.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Ats } from "./ats.ts";

const DB_PATH = process.env.JOBS_DB_PATH ?? "./data/companies.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const jobsDb = new Database(DB_PATH);
jobsDb.pragma("journal_mode = WAL");

jobsDb.exec(`
CREATE TABLE IF NOT EXISTS companies (
  ats          TEXT NOT NULL,
  slug         TEXT NOT NULL,
  displayName  TEXT,
  jobCount     INTEGER NOT NULL DEFAULT 0,
  firstSeenAt  INTEGER NOT NULL,
  lastCheckedAt INTEGER NOT NULL,
  /* consecutive checks that returned nothing -- used to retire dead boards */
  emptyStreak  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ats, slug)
);
CREATE INDEX IF NOT EXISTS idx_companies_jobs ON companies(jobCount DESC);

/* Names we have probed and confirmed do NOT resolve, so we never waste a
   request on them twice. Just as valuable as the hits. */
CREATE TABLE IF NOT EXISTS misses (
  candidate  TEXT PRIMARY KEY,
  checkedAt  INTEGER NOT NULL
);
`);

export interface CompanyRow {
  ats: Ats;
  slug: string;
  displayName: string | null;
  jobCount: number;
  lastCheckedAt: number;
  emptyStreak: number;
}

export function recordHit(ats: Ats, slug: string, jobCount: number, displayName?: string): void {
  const now = Date.now();
  jobsDb
    .prepare(
      `INSERT INTO companies (ats, slug, displayName, jobCount, firstSeenAt, lastCheckedAt, emptyStreak)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ats, slug) DO UPDATE SET
         jobCount = excluded.jobCount,
         lastCheckedAt = excluded.lastCheckedAt,
         displayName = COALESCE(excluded.displayName, companies.displayName),
         emptyStreak = CASE WHEN excluded.jobCount > 0 THEN 0 ELSE companies.emptyStreak + 1 END`,
    )
    .run(ats, slug, displayName ?? null, jobCount, now, now, jobCount > 0 ? 0 : 1);
}

export function recordMiss(candidate: string): void {
  jobsDb
    .prepare(`INSERT OR REPLACE INTO misses (candidate, checkedAt) VALUES (?, ?)`)
    .run(candidate, Date.now());
}

export function alreadyMissed(candidate: string): boolean {
  return !!jobsDb.prepare(`SELECT 1 FROM misses WHERE candidate = ?`).get(candidate);
}

/** Companies worth fetching: seen recently, and not persistently empty. */
export function listCompanies(opts: { minJobs?: number; limit?: number } = {}): CompanyRow[] {
  return jobsDb
    .prepare(
      `SELECT ats, slug, displayName, jobCount, lastCheckedAt, emptyStreak
         FROM companies
        WHERE jobCount >= ? AND emptyStreak < 5
        ORDER BY jobCount DESC
        LIMIT ?`,
    )
    .all(opts.minJobs ?? 1, opts.limit ?? 100_000) as CompanyRow[];
}

export function stats() {
  const row = jobsDb
    .prepare(
      `SELECT COUNT(*) AS companies,
              COALESCE(SUM(jobCount), 0) AS jobs,
              COUNT(DISTINCT ats) AS systems
         FROM companies WHERE emptyStreak < 5`,
    )
    .get() as Record<string, number>;
  const missed = jobsDb.prepare(`SELECT COUNT(*) AS n FROM misses`).get() as { n: number };
  const byAts = jobsDb
    .prepare(
      `SELECT ats, COUNT(*) AS companies, COALESCE(SUM(jobCount),0) AS jobs
         FROM companies WHERE emptyStreak < 5 GROUP BY ats ORDER BY jobs DESC`,
    )
    .all() as Array<{ ats: string; companies: number; jobs: number }>;
  return { ...row, misses: missed.n, byAts };
}
