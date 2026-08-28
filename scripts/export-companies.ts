/**
 * Export companies from the local SQLite probe DB into companies.json.
 *
 * This is the ORIGINAL pipeline, from when the company list was built by
 * guessing slugs from a seed list of names. It is kept because the DB tracks
 * `emptyStreak`, which is how a board that has gone quiet gets retired.
 *
 * It now REFUSES to shrink the shipped list. On 2026-08-28 the list grew from
 * 498 to 3,584 via Common Crawl discovery (see src/jobs/discover.ts), and the
 * old DB still holds only the original 498 -- so running this unguarded would
 * have silently deleted 86% of our coverage. A refresh that loses companies is
 * always a bug, never an intention.
 *
 * To ADD companies, use `npm run jobs:discover`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/jobs/companies.json");
const DB = resolve(ROOT, "data/companies.db");

if (!existsSync(DB)) {
  console.error(`No probe DB at ${DB}. Use \`npm run jobs:discover\` instead.`);
  process.exit(1);
}

const rows = JSON.parse(
  execFileSync("sqlite3", ["-json", DB,
    "SELECT ats, slug, jobCount FROM companies WHERE emptyStreak < 5 ORDER BY jobCount DESC;"],
    { encoding: "utf8" }) || "[]",
) as { ats: string; slug: string; jobCount: number }[];

const current = JSON.parse(readFileSync(OUT, "utf8")) as typeof rows;

if (rows.length < current.length) {
  console.error(
    `REFUSING to export: the DB holds ${rows.length} companies but companies.json ` +
    `ships ${current.length}. Writing would drop ${current.length - rows.length}.\n` +
    `The DB predates Common Crawl discovery. Run \`npm run jobs:discover\` to refresh.`,
  );
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(rows));
console.log(`exported ${rows.length} companies`);
