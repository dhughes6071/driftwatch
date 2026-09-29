/**
 * Verify small-company hiring-system candidates and write one registry per
 * system: sources/{ats}.json = [{ id, name, jobCount }].
 *
 *   node --experimental-strip-types actors/career-jobs/crawler/discover-small.ts candidates.json
 *
 * candidates.json: { bamboohr: ["co", ...], breezy: [...], personio: [...], ... }
 * harvested from the Common Crawl URL index. Only companies with at least one
 * open role are kept; trial/demo/test accounts are dropped (Breezy's own
 * "breezy" board is a trial account full of placeholder jobs).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SMALL_SOURCES, parseTeamtailor, ukgParts, type SmallSource } from "../sources/small.ts";
import { pool } from "./crawl.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const registryPath = (ats: string) => resolve(HERE, `../sources/${ats}.json`);

const NOT_REAL = /\b(trial|demo|sandbox|test|testing|staging|example|dummy)\b/i;
const NOISE_SLUGS = new Set(["www", "api", "app", "help", "support", "careers", "jobs", "career", "status", "blog", "docs", "static", "cdn"]);

/** "Personio SE & Co. KG" -> "Personio". */
export function cleanLegalName(n: string): string {
  return n
    .replace(/\s*(?:,\s*)?\b(GmbH\s*&\s*Co\.?\s*KG|SE\s*&\s*Co\.?\s*KG|GmbH|AG|SE|KG|Ltd\.?|Limited|Inc\.?|LLC|B\.V\.|BV|S\.L\.U?\.?|S\.A\.S?\.?|S\.r\.l\.|Sp\. z o\.o\.|Oy|AB|ApS|A\/S)\s*$/i, "")
    .trim();
}

async function nameFor(ats: string, co: string, rows: unknown[]): Promise<string> {
  const first = rows[0] as Record<string, unknown>;
  try {
    switch (ats) {
      case "breezy":
        return String((first.company as { name?: string })?.name ?? co).trim();
      case "recruitee":
        return String(first.company_name ?? co).trim();
      case "personio":
        return first.subcompany ? cleanLegalName(String(first.subcompany)) : co;
      case "teamtailor": {
        const r = await fetch(`https://${co}.teamtailor.com/jobs.rss`, { signal: AbortSignal.timeout(20_000) });
        return (r.ok && parseTeamtailor(await r.text()).company) || co;
      }
      case "rippling": {
        const r = await fetch(`https://ats.rippling.com/api/v2/board/${co}/jobs/${(first as { id: string }).id}`, {
          signal: AbortSignal.timeout(20_000),
        });
        return (r.ok && ((await r.json()) as { companyName?: string }).companyName?.trim()) || co;
      }
      case "ukg": {
        const { host, tenant, board } = ukgParts(co);
        const r = await fetch(`https://${host}/${tenant}/JobBoard/${board}/`, {
          headers: { "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(20_000),
        });
        // UKG publishes no name field; the board's logo alt text ("AAM Brand") is the best clue.
        const alt = r.ok ? (await r.text()).match(/alt="([^"]+)"/)?.[1] : null;
        const n = alt?.replace(/\b(brand|logo|image|img|header|banner)\b/gi, "").replace(/\s+/g, " ").trim();
        return n && n.length > 1 ? n : tenant;
      }
      case "bamboohr": {
        const r = await fetch(`https://${co}.bamboohr.com/careers`, { signal: AbortSignal.timeout(20_000) });
        const m = r.ok ? (await r.text()).match(/og:site_name" content="([^"]+)"/) : null;
        return m ? cleanLegalName(m[1].replace(/&amp;/g, "&").trim()) : co;
      }
    }
  } catch {
    // fall through to the slug
  }
  return co;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cand = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, string[]>;
  for (const src of SMALL_SOURCES as SmallSource<unknown>[]) {
    const slugs = [...new Map((cand[src.ats] ?? []).map((c) => [c.toLowerCase(), c])).values()].filter(
      (c) => !NOISE_SLUGS.has(c.toLowerCase()),
    );
    const out: Array<{ id: string; name: string; jobCount: number }> = [];
    let done = 0;
    await pool(slugs, 10, async (cand) => {
      try {
        // UKG candidates are "tenant|board"; find which host serves them.
        let co = cand;
        let rows = src.ats === "ukg" ? null : await src.list(co);
        if (src.ats === "ukg") {
          for (const host of ["recruiting.ultipro.com", "recruiting2.ultipro.com"]) {
            co = `${host}|${cand}`;
            rows = await src.list(co);
            if (rows?.length) break;
          }
        }
        if (rows && rows.length > 0) {
          const name = await nameFor(src.ats, co, rows);
          if (!NOT_REAL.test(name) && !NOT_REAL.test(co)) out.push({ id: co, name, jobCount: rows.length });
        }
      } catch {
        // unreachable candidate
      }
      if (++done % 500 === 0) console.log(`  ${src.ats} ${done}/${slugs.length}, ${out.length} live`);
    });
    out.sort((a, b) => b.jobCount - a.jobCount);
    writeFileSync(registryPath(src.ats), JSON.stringify(out));
    console.log(`${src.ats}: ${out.length} live companies of ${slugs.length} candidates, ${out.reduce((a, c) => a + c.jobCount, 0).toLocaleString()} roles`);
  }
}
