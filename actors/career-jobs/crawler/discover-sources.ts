/**
 * Verify Oracle and SmartRecruiters candidates and write the registries the
 * daily crawl reads:
 *   sources/oracle-sites.json          [{ host, site, name?, jobCount }]
 *   sources/smartrecruiters.json       [{ id, name, jobCount }]
 *
 *   node --experimental-strip-types actors/career-jobs/crawler/discover-sources.ts candidates.json
 *
 * candidates.json: { oracle: ["host|site", ...], smartrecruiters: ["CompanyId", ...] }
 * harvested from the Common Crawl URL index (see NEXT_ACTOR_RESEARCH.md round 3).
 * Only sources with at least one open role are kept. Existing Oracle display
 * names are preserved (they are assigned by hand).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as O from "../sources/oracle.ts";
import * as S from "../sources/smartrecruiters.ts";
import { pool } from "./crawl.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ORACLE_FILE = resolve(HERE, "../sources/oracle-sites.json");
export const SR_FILE = resolve(HERE, "../sources/smartrecruiters.json");

if (import.meta.url === `file://${process.argv[1]}`) {
  const cand = JSON.parse(readFileSync(process.argv[2], "utf8")) as { oracle: string[]; smartrecruiters: string[] };

  // ------------------------------------------------------------ Oracle
  const prev = new Map<string, string | undefined>(
    (existsSync(ORACLE_FILE) ? (JSON.parse(readFileSync(ORACLE_FILE, "utf8")) as Array<O.OracleSite>) : []).map((s) => [
      `${s.host}|${s.site}`.toLowerCase(),
      s.name,
    ]),
  );
  const oracle = [...new Set(cand.oracle.map((c) => c.toLowerCase()))];
  const oracleSites: Array<O.OracleSite & { jobCount: number }> = [];
  const siteIds = new Map<string, string>(); // keep the site id's original case
  for (const c of cand.oracle) siteIds.set(c.toLowerCase(), c.split("|")[1]);
  let done = 0;
  await pool(oracle, 10, async (key) => {
    const [host] = key.split("|");
    const site = siteIds.get(key)!;
    const r = await O.listPage({ host, site }, 0, 1);
    if (r && r.total > 0) oracleSites.push({ host, site, name: prev.get(key), jobCount: r.total });
    if (++done % 200 === 0) console.log(`oracle ${done}/${oracle.length}, ${oracleSites.length} live`);
  });
  oracleSites.sort((a, b) => b.jobCount - a.jobCount);
  // Drop non-production environments (dev/test/UAT pods carry test postings),
  // hosts found to hold test data, and aliases: several sites on one host with
  // the identical job count are the same job list published twice.
  const NONPROD = /-(dev|test|tst|stg|stage|staging|uat|sit|qa|pre|preprod|demo|sandbox|trn|train)\d*$/i;
  const TEST_DATA_HOSTS = new Set(["eubt.fa.oraclecloud.com"]); // gibberish postings, 27 Sep 2026
  const seenCount = new Set<string>();
  const kept = oracleSites.filter((s) => {
    if (NONPROD.test(s.host.split(".")[0]) || TEST_DATA_HOSTS.has(s.host)) return false;
    const k = `${s.host}|${s.jobCount}`;
    if (seenCount.has(k)) return false;
    seenCount.add(k);
    return true;
  });
  oracleSites.splice(0, oracleSites.length, ...kept);
  writeFileSync(ORACLE_FILE, JSON.stringify(oracleSites, null, 0));
  console.log(`Oracle: ${oracleSites.length} live sites, ${oracleSites.reduce((a, s) => a + s.jobCount, 0).toLocaleString()} roles`);

  // ------------------------------------------------------------ SmartRecruiters
  const ids = [...new Map(cand.smartrecruiters.map((c) => [c.toLowerCase(), c])).values()].filter(
    (c) => !/^(jobs|job|company|companies|api|embed|search|oneclick-ui|widget)$/i.test(c),
  );
  const sr: Array<{ id: string; name: string; jobCount: number }> = [];
  done = 0;
  await pool(ids, 10, async (id) => {
    const r = await S.listPage(id, 0, 1);
    if (r && r.total > 0) sr.push({ id, name: r.rows[0]?.company?.name?.trim() || id, jobCount: r.total });
    if (++done % 200 === 0) console.log(`smartrecruiters ${done}/${ids.length}, ${sr.length} live`);
  });
  sr.sort((a, b) => b.jobCount - a.jobCount);
  writeFileSync(SR_FILE, JSON.stringify(sr, null, 0));
  console.log(`SmartRecruiters: ${sr.length} live companies, ${sr.reduce((a, s) => a + s.jobCount, 0).toLocaleString()} roles`);
}
