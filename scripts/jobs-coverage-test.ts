/**
 * Proves the ATS aggregator works against real, public job-board APIs.
 * Run: node --experimental-strip-types scripts/jobs-coverage-test.ts
 */
import { fetchCompany } from "../src/jobs/ats.ts";
// A spread of well-known companies, guessing the obvious slug for each ATS.
const gh = ["stripe","airbnb","figma","databricks","robinhood","dropbox","coinbase","reddit","doordash","instacart","cloudflare","asana","grammarly","gitlab","brex","chime","affirm","carta","plaid","scaleai"];
const ab = ["ramp","linear","vercel","replit","anthropic","cursor","modal","supabase","render","posthog"];
let hits=0, jobs=0; const found:string[]=[];
for (const [ats,slugs] of [["greenhouse",gh],["ashby",ab]] as const) {
  for (let i=0;i<slugs.length;i+=6) {
    const batch = slugs.slice(i,i+6);
    const res = await Promise.all(batch.map(s=>fetchCompany(ats as any, s)));
    res.forEach((r,k)=>{ if(r.length){hits++;jobs+=r.length;found.push(`${ats}/${batch[k]}(${r.length})`);} });
  }
}
console.log(`slugs tried: ${gh.length+ab.length}  |  resolved: ${hits}  |  jobs: ${jobs}`);
console.log("hit rate:", ((hits/(gh.length+ab.length))*100).toFixed(0)+"%");
console.log(found.join("  "));
