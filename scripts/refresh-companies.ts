/**
 * Regenerate src/jobs/companies.json from Common Crawl + live ATS verification.
 *
 *   npm run jobs:discover
 *
 * Existing entries that the crawl does not rediscover are KEPT, not dropped.
 * The hand-built Lever list is the reason: Lever is almost absent from Common
 * Crawl, so a crawl-only refresh would silently delete 50 working companies.
 * Losing coverage on a refresh would be a bad trade for tidiness.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { harvest, verify, pool } from "../src/jobs/discover.ts";
import type { Ats } from "../src/jobs/ats.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/jobs/companies.json");

interface Company { ats: Ats; slug: string; jobCount: number }

const key = (c: Company) => `${c.ats}:${c.slug.toLowerCase()}`;

const existing: Company[] = JSON.parse(readFileSync(OUT, "utf8"));
console.log(`current list: ${existing.length} companies, ${existing.reduce((a, b) => a + b.jobCount, 0).toLocaleString()} jobs`);

console.log("\nharvesting candidate slugs from Common Crawl...");
const harvested = await harvest();

const found: Company[] = [];
for (const [ats, slugs] of harvested) {
  const list = [...slugs];
  console.log(`verifying ${list.length} ${ats} candidates against the live API...`);
  const counts = await pool(list, (s) => verify(ats, s));
  let live = 0;
  list.forEach((slug, i) => {
    const n = counts[i];
    if (n === null) return;
    live++;
    if (n > 0) found.push({ ats, slug, jobCount: n });
  });
  console.log(`  ${ats}: ${live} live boards, ${found.filter((f) => f.ats === ats).length} with open roles`);
}

const merged = new Map<string, Company>();
for (const c of found) merged.set(key(c), c);
let retained = 0;
for (const c of existing) if (!merged.has(key(c))) { merged.set(key(c), c); retained++; }

const out = [...merged.values()].sort((a, b) => b.jobCount - a.jobCount);
writeFileSync(OUT, JSON.stringify(out));

const jobs = out.reduce((a, b) => a + b.jobCount, 0);
const byAts: Record<string, number> = {};
for (const c of out) byAts[c.ats] = (byAts[c.ats] ?? 0) + 1;
console.log(`\nretained ${retained} existing entries the crawl did not rediscover`);
console.log(`wrote ${out.length.toLocaleString()} companies, ${jobs.toLocaleString()} jobs`);
console.log(`by ATS: ${JSON.stringify(byAts)}`);
