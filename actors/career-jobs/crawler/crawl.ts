/**
 * Daily crawl -- runs on the Mac mini, not on Apify, so it costs nothing.
 *
 *   node --experimental-strip-types actors/career-jobs/crawler/crawl.ts
 *
 * Walks every company in both registries, records what is open today in a
 * local SQLite database, and fetches Workday descriptions only for roles it
 * has not seen before (the expensive part: one request per job). The first
 * run backfills ~700k descriptions and takes hours; later runs only fetch
 * the day's new roles.
 *
 * Safe to interrupt: every job is written as soon as it is fetched, and a
 * re-run skips what is already stored.
 *
 * Politeness: at most WORKDAY_SITES sites at once, a few requests each --
 * spread across ~1,800 companies' own hosts, no host sees more than a trickle.
 */
import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCompany, type Ats, type Job as AtsJob } from "../../../src/jobs/ats.ts";
import { WorkdayClient, companyName as workdayName, normalize, type Site } from "../../workday-jobs/src/workday.ts";
import { salaryFields, type IndexJob, type Source } from "../src/format.ts";
import { fromStructuredPay } from "../src/salary.ts";
import * as Oracle from "../sources/oracle.ts";
import * as SmartR from "../sources/smartrecruiters.ts";
import { SMALL_SOURCES, smallJobId } from "../sources/small.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
export const DB_PATH = process.env.CAREER_INDEX_DB ?? resolve(ROOT, "data/career-index.db");

const WORKDAY_SITES = Number(process.env.WORKDAY_SITES ?? 12);
const PER_SITE = Number(process.env.PER_SITE ?? 3);
const ATS_CONCURRENCY = 8;
/** For trial runs: only the first N companies / career sites. */
const LIMIT = process.env.CRAWL_LIMIT ? Number(process.env.CRAWL_LIMIT) : Infinity;
/** Catch-up runs for newly added systems: CRAWL_ONLY=workable,jobvite. Others keep last night's rows (purge is 3 days). */
const ONLY = process.env.CRAWL_ONLY ? new Set(process.env.CRAWL_ONLY.split(",").map((s) => s.trim())) : null;
const wanted = (...systems: string[]) => !ONLY || systems.some((s) => ONLY.has(s));

// ------------------------------------------------------------------ database

export function openDb(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          TEXT PRIMARY KEY,
      ats         TEXT NOT NULL,
      company     TEXT NOT NULL,
      posted_at   TEXT,
      light       TEXT NOT NULL,   -- IndexJob as JSON (without d)
      description TEXT,
      first_seen  TEXT NOT NULL,
      last_seen   TEXT NOT NULL,
      chunk       TEXT             -- description chunk key once published
    );
    CREATE INDEX IF NOT EXISTS jobs_last_seen ON jobs(last_seen);
    CREATE INDEX IF NOT EXISTS jobs_chunk ON jobs(chunk);
    CREATE TABLE IF NOT EXISTS company_names (
      ats TEXT NOT NULL, company TEXT NOT NULL, name TEXT, fetched_at TEXT NOT NULL,
      PRIMARY KEY (ats, company)
    );
    CREATE TABLE IF NOT EXISTS runs (
      started_at TEXT PRIMARY KEY, finished_at TEXT, stats TEXT
    );
  `);
  return db;
}

/** Any parseable date -> UTC ISO, so string order is time order. */
export function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ------------------------------------------------------------------ run

if (import.meta.url === `file://${process.argv[1]}`) {
  await crawl();
}

export async function crawl() {
  const db = openDb();
  const startedAt = new Date().toISOString();
  db.prepare("INSERT INTO runs (started_at) VALUES (?)").run(startedAt);

  const exists = db.prepare("SELECT 1 FROM jobs WHERE id = ?");
  const touch = db.prepare("UPDATE jobs SET last_seen = ?, light = ?, posted_at = ? WHERE id = ?");
  const getLight = db.prepare("SELECT light FROM jobs WHERE id = ?");
  const insert = db.prepare(
    `INSERT INTO jobs (id, ats, company, posted_at, light, description, first_seen, last_seen)
     VALUES (@id, @ats, @company, @posted_at, @light, @description, @now, @now)`,
  );
  const stats = {
    atsCompanies: 0, atsJobs: 0, workdaySites: 0, workdayJobs: 0,
    oracleSites: 0, oracleJobs: 0, srCompanies: 0, srJobs: 0,
    newJobs: 0, detailFetches: 0, errors: 0,
  };
  const touchOnly = db.prepare("UPDATE jobs SET last_seen = ? WHERE id = ?");

  const getDesc = db.prepare("SELECT description FROM jobs WHERE id = ?");
  const setDesc = db.prepare("UPDATE jobs SET description = ?, chunk = NULL WHERE id = ?");
  /**
   * Greenhouse/Ashby/Lever return the full description in every list call, so
   * keep it current -- the 8,000-char cap (was 4,000) recovers pay ranges that
   * sat past the old cut. A changed description is re-chunked at publish.
   */
  const refreshDescription = (id: string, description: string | null) => {
    if (!description) return;
    const prev = getDesc.get(id) as { description: string | null } | undefined;
    if (prev && prev.description !== description) setDesc.run(description, id);
  };

  const save = (job: IndexJob, description: string | null) => {
    const light = JSON.stringify(job);
    if (exists.get(job.id)) {
      touch.run(startedAt, light, job.postedAt, job.id);
    } else {
      insert.run({ id: job.id, ats: job.ats, company: job.company, posted_at: job.postedAt, light, description, now: startedAt });
      stats.newJobs++;
    }
  };

  // ---------------------------------------------------------- Greenhouse / Ashby / Lever
  const companies = (JSON.parse(readFileSync(resolve(ROOT, "src/jobs/companies.json"), "utf8")) as Array<{ ats: Ats; slug: string }>)
    .filter((c) => wanted(c.ats))
    .slice(0, LIMIT);
  const names = await greenhouseNames(db, companies);
  log(`ATS: ${companies.length} companies`);
  await pool(companies, ATS_CONCURRENCY, async ({ ats, slug }) => {
    try {
      const jobs = await fetchCompany(ats, slug);
      stats.atsCompanies++;
      for (const j of jobs) {
        stats.atsJobs++;
        save(fromAtsJob(j, names.get(`${ats}:${slug}`) ?? slug, startedAt), j.description || null);
        refreshDescription(j.id, j.description || null);
      }
    } catch {
      stats.errors++;
    }
    if (stats.atsCompanies % 500 === 0) log(`  ATS ${stats.atsCompanies}/${companies.length}, ${stats.atsJobs} jobs`);
  });

  // ---------------------------------------------------------- Workday
  const sites = JSON.parse(
    readFileSync(resolve(ROOT, "actors/workday-jobs/src/sites.json"), "utf8"),
  ) as Array<Site & { jobCount: number }>;
  if (!wanted("workday")) sites.length = 0;
  // Trial runs take the smallest sites (the list is sorted biggest first).
  if (Number.isFinite(LIMIT)) sites.splice(0, Math.max(0, sites.length - LIMIT));
  log(`Workday: ${sites.length} career sites`);
  const client = new WorkdayClient(fetch, 30_000);

  await pool(sites, WORKDAY_SITES, async (s) => {
    const site: Site = { host: s.host, tenant: s.tenant, site: s.site };
    try {
      const fresh: Array<{ id: string; posting: Parameters<typeof normalize>[1]; category: string | null }> = [];
      await client.collect(site, {
        concurrency: PER_SITE,
        onPosting: (posting, category) => {
          stats.workdayJobs++;
          const id = `workday:${site.tenant}:${posting.externalPath}`;
          const prev = getLight.get(id) as { light: string } | undefined;
          if (prev) {
            // Seen before: refresh from the list row, keep the stored description.
            const job = JSON.parse(prev.light) as IndexJob;
            job.title = posting.title.trim();
            touch.run(startedAt, JSON.stringify(job), job.postedAt, id);
          } else {
            fresh.push({ id, posting, category });
          }
        },
      });
      // New roles: one detail call each for description, exact date and all locations.
      await pool(fresh, PER_SITE, async ({ id, posting, category }) => {
        const d = await client.detail(site, posting.externalPath);
        stats.detailFetches++;
        const w = normalize(site, posting, category, d);
        save(
          {
            id,
            ats: "workday",
            company: site.tenant,
            companyName: workdayName(site.tenant),
            title: w.title,
            location: w.location,
            additionalLocations: w.additionalLocations,
            country: w.country,
            remote: w.remote,
            remoteEligible: w.remoteEligible,
            workplaceType: w.workplaceType,
            department: w.department,
            postedAt: isoOrNull(w.postedAt),
            firstSeenAt: startedAt,
            url: w.url,
            employmentType: w.employmentType,
            d: null,
          },
          w.description || null,
        );
      });
      stats.workdaySites++;
    } catch {
      stats.errors++;
    }
    if (stats.workdaySites % 200 === 0) {
      log(`  Workday ${stats.workdaySites}/${sites.length} sites, ${stats.workdayJobs} jobs, ${stats.newJobs} new`);
    }
  });

  // ---------------------------------------------------------- Oracle Recruiting Cloud
  // Same shape as Workday: list everything, fetch a detail only for new roles.
  const oracleSites = wanted("oracle") ? readRegistry<Oracle.OracleSite>("actors/career-jobs/sources/oracle-sites.json") : [];
  log(`Oracle: ${oracleSites.length} career sites`);
  await pool(oracleSites, 6, async (site) => {
    // One bad site or posting must never stop the run (a null title did, 27 Sep).
    try {
      const postings = await Oracle.listAll(site);
      if (!postings) return void stats.errors++;
      stats.oracleSites++;
      const fresh = postings.filter((p) => {
        stats.oracleJobs++;
        const id = Oracle.jobId(site, p);
        if (exists.get(id)) return void touchOnly.run(startedAt, id), false;
        return true;
      });
      await pool(fresh, PER_SITE, async (p) => {
        if (!p.Title?.trim()) return;
        try {
          const d = await Oracle.detail(site, p.Id);
          stats.detailFetches++;
          const { job, description } = Oracle.toIndexJob(site, p, d, startedAt);
          save(job, description);
        } catch {
          stats.errors++;
        }
      });
    } catch {
      stats.errors++;
    }
  });

  // ---------------------------------------------------------- SmartRecruiters
  const srCompanies = wanted("smartrecruiters") ? readRegistry<{ id: string }>("actors/career-jobs/sources/smartrecruiters.json") : [];
  log(`SmartRecruiters: ${srCompanies.length} companies`);
  await pool(srCompanies, 6, async ({ id: company }) => {
    try {
      const postings = await SmartR.listAll(company);
      if (!postings) return void stats.errors++;
      stats.srCompanies++;
      const fresh = postings.filter((p) => {
        stats.srJobs++;
        const id = SmartR.jobId(company, p);
        if (exists.get(id)) return void touchOnly.run(startedAt, id), false;
        return true;
      });
      await pool(fresh, PER_SITE, async (p) => {
        if (!p.name?.trim()) return;
        try {
          const d = await SmartR.detail(company, p.id);
          stats.detailFetches++;
          const { job, description } = SmartR.toIndexJob(company, p, d, startedAt);
          save(job, description);
        } catch {
          stats.errors++;
        }
      });
    } catch {
      stats.errors++;
    }
  });

  // ---------------------------------------------------------- small-company systems
  // BambooHR, Breezy, Personio, Rippling, Teamtailor, Recruitee: one loop, one
  // registry each. `build` (which may fetch a detail) runs only for new roles.
  const small: Record<string, { companies: number; jobs: number }> = {};
  for (const src of SMALL_SOURCES) {
    if (!wanted(src.ats)) continue;
    const companies = readRegistry<{ id: string; name: string }>(`actors/career-jobs/sources/${src.ats}.json`);
    if (!companies.length) continue;
    small[src.ats] = { companies: 0, jobs: 0 };
    log(`${src.ats}: ${companies.length} companies`);
    await pool(companies, 8, async ({ id: co, name }) => {
      try {
        const rows = await src.list(co);
        if (!rows) return void stats.errors++;
        small[src.ats].companies++;
        const fresh = rows.filter((p) => {
          small[src.ats].jobs++;
          const id = smallJobId(src, co, p);
          if (exists.get(id)) return void touchOnly.run(startedAt, id), false;
          return true;
        });
        await pool(fresh, PER_SITE, async (p) => {
          try {
            const built = await src.build(co, name, p, startedAt);
            stats.detailFetches++;
            if (built) save(built.job, built.description);
          } catch {
            stats.errors++;
          }
        });
      } catch {
        stats.errors++;
      }
    });
  }

  // Roles gone for 3+ days are closed. (A day or two of grace absorbs a site
  // that was briefly unreachable, so a flaky host does not empty and refill.)
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const purged = db.prepare("DELETE FROM jobs WHERE last_seen < ?").run(cutoff).changes;

  db.prepare("UPDATE runs SET finished_at = ?, stats = ? WHERE started_at = ?").run(
    new Date().toISOString(),
    JSON.stringify({ ...stats, small, purged }),
    startedAt,
  );
  log(`Done: ${JSON.stringify({ ...stats, small, purged })}`);
  db.close();
}

// ------------------------------------------------------------------ helpers

/** A registry file, or [] if it has not been built yet. Trial runs take the smallest entries. */
function readRegistry<T>(rel: string): T[] {
  const path = resolve(ROOT, rel);
  let rows: T[] = [];
  try {
    rows = JSON.parse(readFileSync(path, "utf8")) as T[];
  } catch {
    return [];
  }
  return Number.isFinite(LIMIT) ? rows.slice(-LIMIT) : rows;
}

function fromAtsJob(j: AtsJob, companyName: string, now: string): IndexJob {
  return {
    id: j.id,
    ats: j.ats as Source,
    company: j.companySlug,
    companyName,
    title: j.title,
    location: j.location,
    additionalLocations: [],
    country: null,
    remote: j.remote,
    remoteEligible: j.remoteEligible,
    workplaceType: null,
    department: j.department,
    postedAt: isoOrNull(j.postedAt),
    firstSeenAt: now,
    url: j.url,
    employmentType: j.employmentType,
    d: null,
    // Ashby publishes pay as data; everything else is read from the text at publish.
    ...salaryFields(fromStructuredPay(j.compensation)),
  };
}

/**
 * Greenhouse publishes each board's display name ("Stripe") at
 * /v1/boards/{slug}. Ashby and Lever publish none, so those keep the slug.
 * Fetched once and cached; refreshed after 30 days.
 */
async function greenhouseNames(db: Database.Database, companies: Array<{ ats: Ats; slug: string }>) {
  const stale = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const cached = new Map<string, string>();
  for (const r of db.prepare("SELECT ats, company, name FROM company_names WHERE fetched_at > ?").all(stale) as Array<{
    ats: string;
    company: string;
    name: string | null;
  }>) {
    if (r.name) cached.set(`${r.ats}:${r.company}`, r.name);
    else cached.set(`${r.ats}:${r.company}`, r.company);
  }
  const todo = companies.filter((c) => c.ats === "greenhouse" && !cached.has(`greenhouse:${c.slug}`));
  if (todo.length) log(`Fetching ${todo.length} Greenhouse board names (cached afterwards)`);
  const put = db.prepare("INSERT OR REPLACE INTO company_names (ats, company, name, fetched_at) VALUES (?, ?, ?, ?)");
  await pool(todo, ATS_CONCURRENCY, async ({ slug }) => {
    let name: string | null = null;
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (r.ok) name = ((await r.json()) as { name?: string }).name?.trim() || null;
    } catch {
      // keep the slug
    }
    put.run("greenhouse", slug, name, new Date().toISOString());
    cached.set(`greenhouse:${slug}`, name ?? slug);
  });
  return cached;
}

export async function pool<T>(items: T[], width: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

function log(msg: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
}
