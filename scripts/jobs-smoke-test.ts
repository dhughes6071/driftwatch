/**
 * Proves the ATS aggregator works against real, public job-board APIs.
 * Run: node --experimental-strip-types scripts/jobs-smoke-test.ts
 */
import { fetchMany, discoverAts } from "../src/jobs/ats.ts";

const targets = [
  { ats: "greenhouse" as const, slug: "stripe" },
  { ats: "greenhouse" as const, slug: "airbnb" },
  { ats: "greenhouse" as const, slug: "figma" },
  { ats: "ashby" as const, slug: "ramp" },
  { ats: "ashby" as const, slug: "linear" },
  { ats: "lever" as const, slug: "spotify" },
  { ats: "workable" as const, slug: "gitlab" },
];

const t0 = Date.now();
const { jobs, ok, empty } = await fetchMany(targets);
console.log(`companies: ${ok} with jobs, ${empty} empty | total jobs: ${jobs.length} | ${Date.now()-t0}ms\n`);

const byCompany: Record<string, number> = {};
for (const j of jobs) byCompany[`${j.ats}/${j.companySlug}`] = (byCompany[`${j.ats}/${j.companySlug}`] ?? 0) + 1;
console.log("per company:", byCompany);

console.log(`\nremote roles: ${jobs.filter(j => j.remote).length} / ${jobs.length}`);
console.log(`with description: ${jobs.filter(j => j.description.length > 50).length}`);
console.log(`with postedAt: ${jobs.filter(j => j.postedAt).length}`);

console.log("\n--- sample normalized records ---");
for (const j of [jobs[0], jobs.find(j=>j.ats==="ashby"), jobs.find(j=>j.remote)].filter(Boolean).slice(0,3)) {
  console.log(JSON.stringify({...j!, description: j!.description.slice(0,80)+"..."}, null, 1));
}
