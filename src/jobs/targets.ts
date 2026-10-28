/**
 * Turn whatever a caller put in `companies` into { ats?, slug } targets.
 *
 * The documented form is [{ "slug": "stripe", "ats": "greenhouse" }], but
 * people also send plain names (["stripe"]) or paste a job-board link. Both
 * used to return zero jobs with no explanation, and a null entry crashed the
 * run (found 3 Oct 2026). Now every reasonable form works, and anything else
 * is skipped with a reason.
 */
import type { Ats } from "./ats.ts";
import { parseCareerSiteUrl, workdaySitesNamed, type Site } from "./workday-source.ts";

const KNOWN_ATS = new Set<Ats>(["greenhouse", "lever", "ashby"]);

/** Job-board links whose first path segment is the company slug. */
const BOARD_HOSTS: Array<[RegExp, Ats]> = [
  [/(^|\.)greenhouse\.io$/, "greenhouse"], // boards.greenhouse.io, job-boards.greenhouse.io, boards-api...
  [/(^|\.)lever\.co$/, "lever"], // jobs.lever.co, api.lever.co/v0/postings/{slug}
  [/(^|\.)ashbyhq\.com$/, "ashby"], // jobs.ashbyhq.com
];

export type Target =
  | { ats?: Ats; slug: string }
  /** A Workday company: its career site(s), from a pasted link or the built-in registry. */
  | { ats: "workday"; slug: string; sites: Site[] };

/**
 * `companies` as a list, with blank and null entries dropped. A single string
 * ("stripe, ramp") is split on commas and new lines; it used to be read one
 * letter at a time and return 0 jobs. An empty row left in the Console's list
 * editor ([""]) failed the run with "No companies to fetch".
 */
export function companyList(value: unknown): unknown[] {
  const list = typeof value === "string" ? value.split(/[,\n]/) : Array.isArray(value) ? value : [];
  return list.filter((e) => e != null && !(typeof e === "string" && !e.trim()));
}

/**
 * A keyword / currency field as clean strings. A single string becomes a
 * one-item list (not split on commas: "Washington, DC" is one location), and
 * blank or null entries are dropped. A null keyword made the title / location
 * filter throw on every board, so the run returned 0 jobs with every company
 * counted as unreachable.
 */
export function textList(value: unknown): string[] {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return list
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/** One entry -> a target, or a reason it can't be used. */
export function parseCompanyEntry(entry: unknown): Target | { skip: string } {
  if (entry == null) return { skip: "empty entry" };
  let raw: string;
  let ats: Ats | "workday" | undefined;
  if (typeof entry === "string") raw = entry;
  else if (typeof entry === "object") {
    const e = entry as { slug?: unknown; ats?: unknown; name?: unknown; url?: unknown };
    const s = e.slug ?? e.url ?? e.name;
    if (typeof s !== "string") return { skip: `no "slug" in ${JSON.stringify(entry).slice(0, 80)}` };
    raw = s;
    if (typeof e.ats === "string" && e.ats.trim()) {
      const a = e.ats.trim().toLowerCase();
      if (a !== "workday" && !KNOWN_ATS.has(a as Ats)) {
        return { skip: `unknown "ats" ${JSON.stringify(e.ats)} (use greenhouse, lever, ashby or workday)` };
      }
      ats = a as Ats | "workday";
    }
  } else return { skip: `not a company: ${JSON.stringify(entry).slice(0, 80)}` };

  // A Workday career-site link (any page on the site, even a single job).
  const site = /myworkday(jobs|site)\.com/i.test(raw) ? parseCareerSiteUrl(raw) : null;
  if (site) return { ats: "workday", slug: site.tenant, sites: [site] };
  if (ats === "workday") {
    const sites = workdaySitesNamed(raw);
    if (sites.length) return { ats: "workday", slug: sites[0].tenant, sites };
    return { skip: `${JSON.stringify(raw).slice(0, 80)} is not in our Workday list: paste its career-site link (…myworkdayjobs.com/…) instead` };
  }

  const fromUrl = slugFromUrl(raw.trim());
  if (fromUrl) return { ats: ats ?? fromUrl.ats, slug: fromUrl.slug };
  // A bare name: "Stripe", "scale ai" -> "stripe", "scaleai".
  const slug = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!slug || /[/?#]/.test(slug)) return { skip: `not a company slug or job-board link: ${JSON.stringify(raw).slice(0, 80)}` };
  return ats ? { ats, slug } : { slug };
}

function slugFromUrl(s: string): { ats: Ats; slug: string } | null {
  if (!/^https?:\/\//i.test(s) && !/^[a-z0-9.-]+\.(io|co|com)\//i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const hit = BOARD_HOSTS.find(([re]) => re.test(u.hostname.toLowerCase()));
  if (!hit) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  // API links carry the slug deeper: /v1/boards/{slug}/jobs, /v0/postings/{slug}, /posting-api/job-board/{slug}.
  const i = parts.findIndex((p) => p === "boards" || p === "postings" || p === "job-board");
  const slug = (i >= 0 ? parts[i + 1] : parts[0])?.toLowerCase();
  return slug ? { ats: hit[1], slug } : null;
}
