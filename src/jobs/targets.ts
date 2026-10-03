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

const KNOWN_ATS = new Set<Ats>(["greenhouse", "lever", "ashby"]);

/** Job-board links whose first path segment is the company slug. */
const BOARD_HOSTS: Array<[RegExp, Ats]> = [
  [/(^|\.)greenhouse\.io$/, "greenhouse"], // boards.greenhouse.io, job-boards.greenhouse.io, boards-api...
  [/(^|\.)lever\.co$/, "lever"], // jobs.lever.co, api.lever.co/v0/postings/{slug}
  [/(^|\.)ashbyhq\.com$/, "ashby"], // jobs.ashbyhq.com
];

export interface Target {
  ats?: Ats;
  slug: string;
}

/** One entry -> a target, or a reason it can't be used. */
export function parseCompanyEntry(entry: unknown): Target | { skip: string } {
  if (entry == null) return { skip: "empty entry" };
  let raw: string;
  let ats: Ats | undefined;
  if (typeof entry === "string") raw = entry;
  else if (typeof entry === "object") {
    const e = entry as { slug?: unknown; ats?: unknown; name?: unknown; url?: unknown };
    const s = e.slug ?? e.url ?? e.name;
    if (typeof s !== "string") return { skip: `no "slug" in ${JSON.stringify(entry).slice(0, 80)}` };
    raw = s;
    if (typeof e.ats === "string" && e.ats.trim()) {
      const a = e.ats.trim().toLowerCase() as Ats;
      if (!KNOWN_ATS.has(a)) return { skip: `unknown "ats" ${JSON.stringify(e.ats)} (use greenhouse, lever or ashby)` };
      ats = a;
    }
  } else return { skip: `not a company: ${JSON.stringify(entry).slice(0, 80)}` };

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
