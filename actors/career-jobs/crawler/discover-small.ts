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
import { SMALL_SOURCES, parseTeamtailor, ukgParts, workableNames, type SmallSource } from "../sources/small.ts";
import { pool } from "./crawl.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const registryPath = (ats: string) => resolve(HERE, `../sources/${ats}.json`);

const NOT_REAL = /\b(trial|demo|sandbox|test|testing|staging|example|dummy)\b/i;
/** Copies of a real board kept for review or migration ("actionet-review" beside "actionet"). */
const NOT_REAL_SLUG = /[-_](review|preview|old|copy|internal|uat|qa)$/i;
const NOISE_SLUGS = new Set(["www", "api", "app", "help", "support", "careers", "jobs", "career", "status", "blog", "docs", "static", "cdn"]);

/** "Personio SE & Co. KG" -> "Personio". */
export function cleanLegalName(n: string): string {
  return n
    .replace(/\s*(?:,\s*)?\b(GmbH\s*&\s*Co\.?\s*KG|SE\s*&\s*Co\.?\s*KG|GmbH|AG|SE|KG|Ltd\.?|Limited|Inc\.?|LLC|B\.V\.|BV|S\.L\.U?\.?|S\.A\.S?\.?|S\.r\.l\.|Sp\. z o\.o\.|Oy|AB|ApS|A\/S)\s*$/i, "")
    .trim();
}

/** Decode the entities names arrive with ("Ollie&#x27;s", "Lawn \\u0026 Pest"). */
export function decodeName(n: string): string {
  return n
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hand-assigned names for large UKG tenants with no usable logo or board name
 * (identified 28 Sep 2026 from a sample posting). Applied after discovery.
 */
export const UKG_NAMES: Record<string, string> = {
  BUC1007BUCC: "Buc-ee's", CON1029CHEC: "Conrad Hotels", ULT1005UCH: "Ultra Clean Holdings", RUN1001RUNN: "Running Warehouse",
  SIG1005SIGM: "Sigma Funeral Services", BOI1001BOIS: "Boise Cascade", LAS1004LAMC: "LaSalle Corrections", ROS1002RHN: "Rosecrance",
  HEL1006HELI: "Helix Electric", pre1019prsd: "Presidio", PRI1017PRIMA: "Primanti Bros.", JAN1000JANI: "Janicki Industries",
  PEO1000PEOP: "PeopleCare", JUS1001JUSTM: "Justrite Safety Group", DUN1002DUNN: "Dunn-Edwards", VAL1016VALTI: "ValidaTek",
  WDL1000: "Allstate Peterbilt Group", ALL1029AECR: "ALL Crane & Equipment Rental", PAR1035PPTL: "Curvature", ROY1010ROYO: "Royal Oak Enterprises",
};

/** Board labels that are not company names (seen across 2,448 UKG boards, 28 Sep). */
export const GENERIC_BOARD =
  /^(default|all|current|current opportunities|careers?|career opportunities|career site|opportunities|jobs|job board|job opportunities|job openings|current openings|all openings|all jobs|search jobs|external|external careers|internal|corporate|stores?|retail|hourly|salaried|field|english|spanish|apply|join (?:us|our team)|en|us|usa|board|postings?)$/i;

/**
 * UKG publishes no company-name field. Best clue first: the logo's alt text
 * (but not the "Chrome/Firefox logo" images of the unsupported-browser notice,
 * which named two companies "Firefox" on 28 Sep), then the board's own name
 * minus generic words, else null.
 */
export function ukgNameFromPage(html: string, board: string): string | null {
  const alts = [...html.matchAll(/alt="([^"]+)"/g)].map((m) => m[1]);
  const logo = alts.find((a) => !/\b(chrome|firefox|internet explorer|safari|edge|opera)\b/i.test(a));
  const fromLogo = logo?.replace(/\b(brand|logo|image|img|header|banner)\b/gi, "").replace(/\s+/g, " ").trim();
  if (fromLogo && fromLogo.length > 1 && !GENERIC_BOARD.test(fromLogo) && tidy(fromLogo).length > 1) return tidy(fromLogo);
  const m = html.match(new RegExp(`"Id":"${board}","BrandId":"[^"]*","Name":"([^"]*)"`));
  const boardName = m
    ? decodeName(m[1])
        .replace(/\b(career opportunities|job opportunities|opportunities|careers?|jobs)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  if (boardName.length > 1 && !GENERIC_BOARD.test(m![1]) && !GENERIC_BOARD.test(boardName) && tidy(boardName).length > 1) return tidy(boardName);
  return null;
}

/** "Big 5 Sporting Goods Opt 1" -> "Big 5 Sporting Goods". */
const tidy = (n: string) => cleanLegalName(stripBoardWords(decodeName(n).replace(/\s+opt(?:ion)?\s*\d+$/i, "").trim()));

/**
 * Phrases from a board's internal label, not the company's name: "Default CKE",
 * "MidFirst Bank - Default", "Delta Sonic Job Board", "SCF New Branding 2018",
 * "Main Template" (about 80 of 2,448 UKG boards, found 7 Oct 2026). Only whole
 * phrases go -- "Eugene Water and Electric Board" keeps its "Board". A label
 * that is nothing but such phrases comes back empty (or generic), so the caller
 * falls back to another board's name.
 */
export function stripBoardWords(n: string): string {
  if (/template/i.test(n)) return "";
  const out = n
    .replace(/\((?:all-[^)]*|default)\)/gi, "")
    .replace(/^recruiting\s*-\s*/i, "")
    .replace(/\s*-?\s*\b(?:main\s+|external\s+)?job\s+board\b.*$/i, "")
    .replace(/\b(?:new\s+)?(?:re)?branding(?:\s+\d{4})?\b/gi, "")
    .replace(/\bdefault\b/gi, "")
    .replace(/^\s*external\s+|\s+external\s*$/gi, "")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return out.replace(/^\((.+)\)$/, "$1");
}

/**
 * One company, several UKG boards: give every board of a tenant the best
 * name found on any of them; tenant code only when none has a real name.
 */
export function shareUkgNames(reg: Array<{ id: string; name: string }>): void {
  const best = new Map<string, string>();
  for (const c of reg) {
    const tenant = c.id.split("|").at(-2)!;
    if (c.name !== tenant && !GENERIC_BOARD.test(c.name) && !best.has(tenant)) best.set(tenant, c.name);
  }
  for (const c of reg) {
    const tenant = c.id.split("|").at(-2)!;
    if (UKG_NAMES[tenant]) c.name = UKG_NAMES[tenant];
    else if (c.name === tenant || GENERIC_BOARD.test(c.name)) c.name = best.get(tenant) ?? tenant;
  }
}

/** Jobvite pages carry the name only in the title: "Abcam Careers" -> "Abcam". */
export function jobviteNameFromPage(html: string): string | null {
  const t = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const n = t && decodeName(t)
    .replace(/\s*[|:–-]\s*(jobvite|careers?|jobs).*$/i, "")
    .replace(/\b(career opportunities|job opportunities|careers? (?:site|page)|careers?|jobs|job openings|openings)\b/gi, "")
    .replace(/[\s|:–-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return n && n.length > 1 && !GENERIC_BOARD.test(n) ? n : null;
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
        return (r.ok && ukgNameFromPage(await r.text(), board)) || tenant;
      }
      case "workable": {
        return workableNames.get(co) ?? co;
      }
      case "jobvite": {
        const r = await fetch(`https://jobs.jobvite.com/${co}/jobs`, { headers: { "user-agent": "career-jobs-index/0.1 (+public career-site listings)" }, signal: AbortSignal.timeout(20_000) });
        return (r.ok && jobviteNameFromPage(await r.text())) || co;
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
    // Only systems named in the candidates file; the others keep their registries.
    if (!cand[src.ats]) continue;
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
          const name = cleanLegalName(decodeName(await nameFor(src.ats, co, rows)));
          if (!NOT_REAL.test(name) && !NOT_REAL.test(co) && !NOT_REAL_SLUG.test(co)) out.push({ id: co, name, jobCount: rows.length });
        }
      } catch {
        // unreachable candidate
      }
      if (++done % 500 === 0) console.log(`  ${src.ats} ${done}/${slugs.length}, ${out.length} live`);
    });
    out.sort((a, b) => b.jobCount - a.jobCount);
    if (src.ats === "ukg") shareUkgNames(out);
    writeFileSync(registryPath(src.ats), JSON.stringify(out));
    console.log(`${src.ats}: ${out.length} live companies of ${slugs.length} candidates, ${out.reduce((a, c) => a + c.jobCount, 0).toLocaleString()} roles`);
  }
}
