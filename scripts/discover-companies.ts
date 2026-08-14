/**
 * Build the verified company registry.
 *
 * Probes every seed candidate against all four ATS APIs and records which
 * resolve. Misses are recorded too, so re-running never re-probes a known dead
 * candidate -- the second run is far cheaper than the first.
 *
 * Run:  npm run jobs:discover
 *       npm run jobs:discover -- --names acme,globex   (add specific companies)
 *
 * POLITENESS: these public endpoints are a courtesy from the ATS vendors. We
 * cap concurrency and never retry aggressively. Getting a source closed would
 * cost far more than a slow crawl.
 */
import { fetchCompany, VERIFIED_ATS, type Ats } from "../src/jobs/ats.ts";
import { SEED_COMPANIES, slugCandidates } from "../src/jobs/seed.ts";
import { SEED_COMPANIES_EXTENDED } from "../src/jobs/seed-extended.ts";
import { recordHit, recordMiss, alreadyMissed, stats } from "../src/jobs/store.ts";

const ATS_ORDER: Ats[] = VERIFIED_ATS;
const CONCURRENCY = 5;

function parseArgs(): string[] {
  const i = process.argv.indexOf("--names");
  if (i === -1) return [...new Set([...SEED_COMPANIES, ...SEED_COMPANIES_EXTENDED])];
  return (process.argv[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function probeCandidate(candidate: string): Promise<{ hit: boolean; detail?: string }> {
  // A slug is almost always unique to one ATS, so stop at the first hit.
  for (const ats of ATS_ORDER) {
    const jobs = await fetchCompany(ats, candidate);
    if (jobs.length > 0) {
      recordHit(ats, candidate, jobs.length);
      return { hit: true, detail: `${ats}/${candidate} (${jobs.length} jobs)` };
    }
  }
  recordMiss(candidate);
  return { hit: false };
}

async function main() {
  const names = parseArgs();
  const candidates = [...new Set(names.flatMap(slugCandidates))].filter((c) => !alreadyMissed(c));

  console.log(`seed names: ${names.length}`);
  console.log(`slug candidates to probe: ${candidates.length} (known misses skipped)\n`);

  const started = Date.now();
  let hits = 0;
  let done = 0;

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(probeCandidate));

    for (const r of results) {
      done++;
      if (r.hit) {
        hits++;
        console.log(`  HIT  ${r.detail}`);
      }
    }
    if (done % 50 === 0 || i + CONCURRENCY >= candidates.length) {
      const pct = ((done / candidates.length) * 100).toFixed(0);
      console.log(`  ...${done}/${candidates.length} probed (${pct}%), ${hits} hits`);
    }
  }

  const s = stats();
  console.log(`\n${"=".repeat(58)}`);
  console.log(`probed ${candidates.length} candidates in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`\nVERIFIED REGISTRY`);
  console.log(`  companies : ${s.companies.toLocaleString()}`);
  console.log(`  open jobs : ${s.jobs.toLocaleString()}`);
  console.log(`  known dead candidates cached: ${s.misses.toLocaleString()}`);
  console.log(`\n  by ATS:`);
  for (const r of s.byAts) {
    console.log(`    ${r.ats.padEnd(11)} ${String(r.companies).padStart(4)} companies  ${r.jobs.toLocaleString().padStart(8)} jobs`);
  }
  console.log("=".repeat(58));
}

main().catch((err) => {
  console.error("discovery failed:", err);
  process.exit(1);
});
