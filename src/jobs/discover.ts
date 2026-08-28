/**
 * Company discovery for the jobs actor.
 *
 * THE PROBLEM: the ATS job-board APIs are public and documented, but there is
 * no index of which companies use them. Every endpoint needs a slug you must
 * already know. Guessing slugs from a hand-written list of company names --
 * the original approach -- topped out at 498 companies, because you can only
 * guess names you already thought of.
 *
 * THE FIX: harvest real slugs from the Common Crawl URL index. Common Crawl
 * is a public, CC-licensed archive of the web published specifically for this
 * kind of reuse; querying its index is its intended purpose, not scraping. Any
 * company whose job board has ever been linked from a crawled page appears
 * there, so the list is drawn from reality rather than from memory.
 *
 * Every harvested slug is then VERIFIED against the ATS's own public API
 * before it ships. A slug that 404s, serves HTML, or has no open roles is
 * dropped -- shipping a company list that mostly does not resolve would be
 * worse than shipping a smaller one that does.
 *
 * Measured 2026-08-28: 4,228 candidates -> 3,552 live boards -> 3,350 with at
 * least one open role. Combined with the retained hand-built entries that is
 * 3,584 companies and ~125,000 jobs, against 498 and 27,408 before.
 *
 * Lever is deliberately absent here. jobs.lever.co is barely represented in
 * Common Crawl (62 rows, one usable slug), and a wildcard on lever.co returns
 * Lever's own marketing pages. The hand-built Lever entries are kept instead.
 */
import { log } from "../lib/log.ts";
import type { Ats } from "./ats.ts";

const CRAWL = process.env.CC_CRAWL ?? "CC-MAIN-2026-34";
const CC_INDEX = (pattern: string, page: number) =>
  `http://index.commoncrawl.org/${CRAWL}-index?url=${encodeURIComponent(pattern)}&output=json&page=${page}`;

const UA = "driftwatch-jobs/0.1 (+https://github.com/dhughes6071/driftwatch)";

/** URL patterns that expose a company slug, per ATS. */
const PATTERNS: { ats: Ats; pattern: string; extract: RegExp }[] = [
  { ats: "greenhouse", pattern: "boards.greenhouse.io/*",     extract: /boards\.greenhouse\.io\/([^/?#]+)/ },
  { ats: "greenhouse", pattern: "job-boards.greenhouse.io/*", extract: /job-boards\.greenhouse\.io\/([^/?#]+)/ },
  { ats: "ashby",      pattern: "jobs.ashbyhq.com/*",         extract: /jobs\.ashbyhq\.com\/([^/?#]+)/ },
];

/**
 * Path segments that are part of the ATS's own site rather than a company.
 * Without this the crawl yields "embed", "blog" and similar, which then burn
 * a verification request each to prove they are not companies.
 */
const NOISE = new Set([
  "embed", "blog", "about", "pricing", "careers", "jobs", "search", "login",
  "api", "docs", "www", "assets", "static", "images", "privacy", "terms",
  "legal", "home", "index",
]);

function plausibleSlug(s: string): boolean {
  return s.length > 1 && s.length < 64 && !NOISE.has(s) && !/^\d+$/.test(s);
}

/** Harvest candidate slugs for one ATS from the Common Crawl index. */
export async function harvest(maxPages = 6): Promise<Map<Ats, Set<string>>> {
  const out = new Map<Ats, Set<string>>();
  for (const { ats, pattern, extract } of PATTERNS) {
    if (!out.has(ats)) out.set(ats, new Set());
    const bucket = out.get(ats)!;
    for (let page = 0; page < maxPages; page++) {
      let text: string;
      try {
        const res = await fetch(CC_INDEX(pattern, page), {
          signal: AbortSignal.timeout(90_000),
          headers: { "user-agent": UA },
        });
        // A 400 means we ran past the last page for this pattern -- expected.
        if (!res.ok) break;
        text = await res.text();
      } catch (err) {
        log.warn("common crawl page failed", { pattern, page, err: String(err) });
        break;
      }
      if (!text.trim()) break;
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const url: string = JSON.parse(line).url ?? "";
          const m = url.match(extract);
          if (!m) continue;
          const slug = decodeURIComponent(m[1]).toLowerCase();
          if (plausibleSlug(slug)) bucket.add(slug);
        } catch {
          // One malformed index line must not abort the harvest.
        }
      }
    }
    log.info("harvested", { pattern, distinct: bucket.size });
  }
  return out;
}

const VERIFY_URL: Record<string, (s: string) => string> = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`,
  lever: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`,
};

/**
 * Ask the ATS whether this board exists and how many roles it has open.
 * Returns null when the board does not resolve at all.
 */
export async function verify(ats: Ats, slug: string): Promise<number | null> {
  const url = VERIFY_URL[ats];
  if (!url) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url(slug), {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: "application/json", "user-agent": UA },
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) return null;
      // Several of these ATSs answer an unknown slug with an HTML page rather
      // than a 404, so the content type is load-bearing, not a formality.
      if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
      const body = (await res.json()) as { jobs?: unknown[] };
      return Array.isArray(body.jobs) ? body.jobs.length : 0;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

/** Run `fn` over `items` with bounded concurrency. */
export async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>, width = 14): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}
