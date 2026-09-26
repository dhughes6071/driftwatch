/**
 * Build src/sites.json -- the registry of verified Workday career sites.
 *
 *   node --experimental-strip-types scripts/discover.ts
 *
 * 1. HARVEST company hosts from the Common Crawl URL index (public, CC-licensed,
 *    built for this kind of reuse) -- the same method that took the main jobs
 *    actor from 498 to 3,584 companies.
 * 2. EXPAND each host through its own robots.txt, which lists every career
 *    site the company runs (Salesforce: 9, including Slack, Tableau, Heroku).
 * 3. VERIFY every (host, tenant, site) against the live API and keep only
 *    sites with at least one open role. A registry that mostly does not
 *    resolve would be worse than a smaller one that does.
 *
 * Existing entries the crawl does not rediscover are kept if they still verify.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { WorkdayClient, type Site } from "../src/workday.ts";

const OUT = new URL("../src/sites.json", import.meta.url);
const CRAWLS = (process.env.CC_CRAWLS ?? "CC-MAIN-2026-39,CC-MAIN-2026-34").split(",");
const UA = "workday-jobs-actor/0.1 (+public career-site listings)";

type Entry = Site & { jobCount: number };
const key = (s: Site) => `${s.host}|${s.tenant}|${s.site.toLowerCase()}`;

// ---------------------------------------------------------------- 1. harvest

const JOBS_RE = /^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com(?::\d+)?\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?([^/?#]+)/i;
const SITE_RE = /^https?:\/\/(wd\d+)\.myworkdaysite\.com(?::\d+)?\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?recruiting\/([^/?#]+)\/([^/?#]+)/i;
/**
 * Career sites that are reachable but not meant for the public: private
 * links, internal boards, confidential executive searches, referral portals.
 * robots.txt lists them anyway, so they must be excluded by name. Found 77 of
 * 4,193 on 2026-09-26 (pwc/NonPublic_Postings, gevernova/only_confidential_...).
 * A user who pastes one of these URLs themselves can still fetch it.
 */
export const NOT_PUBLIC = /internal|non-?_?public|nonwd|employee|referral|private|confidential|displaced|direct_appointment/i;

/** Path segments that are Workday's own pages, not career sites. */
const NOISE = new Set(["robots.txt", "llms.txt", "login", "wday", "favicon.ico", "sitemap.xml"]);

async function ccPages(crawl: string, pattern: string): Promise<number> {
  const url = `https://index.commoncrawl.org/${crawl}-index?url=${encodeURIComponent(pattern)}&output=json&showNumPages=true`;
  const r = await retry(() => fetchText(url, 60_000));
  return r ? (JSON.parse(r).pages as number) : 0;
}

async function harvest(): Promise<{ hosts: Map<string, string>; sites: Site[] }> {
  const hosts = new Map<string, string>(); // host -> tenant (myworkdayjobs only)
  const sites: Site[] = [];
  for (const crawl of CRAWLS) {
    for (const pattern of ["*.myworkdayjobs.com", "*.myworkdaysite.com"]) {
      const pages = await ccPages(crawl, pattern);
      for (let page = 0; page < pages; page++) {
        const url = `https://index.commoncrawl.org/${crawl}-index?url=${encodeURIComponent(pattern)}&output=json&fl=url&page=${page}`;
        // The index answers 502 under load; a few patient retries recover most pages.
        const text = await retry(() => fetchText(url, 180_000), 4, 10_000);
        if (!text) {
          console.warn(`  ${crawl} ${pattern} page ${page}: gave up`);
          continue;
        }
        for (const line of text.split("\n")) {
          let u: string;
          try {
            u = JSON.parse(line).url;
          } catch {
            continue;
          }
          let m = u.match(JOBS_RE);
          if (m) {
            const host = `${m[1]}.${m[2]}.myworkdayjobs.com`.toLowerCase();
            hosts.set(host, m[1].toLowerCase());
            if (!NOISE.has(m[3].toLowerCase())) sites.push({ host, tenant: m[1].toLowerCase(), site: decodeURIComponent(m[3]) });
            continue;
          }
          m = u.match(SITE_RE);
          if (m) sites.push({ host: `${m[1]}.myworkdaysite.com`.toLowerCase(), tenant: m[2], site: decodeURIComponent(m[3]) });
        }
      }
      console.log(`${crawl} ${pattern}: ${pages} pages -> ${hosts.size} hosts, ${sites.length} site sightings so far`);
    }
  }
  return { hosts, sites };
}

// ---------------------------------------------------------------- 2. robots.txt

async function sitesFromRobots(host: string, tenant: string): Promise<Site[]> {
  const text = await retry(() => fetchText(`https://${host}/robots.txt`, 20_000), 2);
  if (!text) return [];
  const out: Site[] = [];
  for (const m of text.matchAll(/^(?:Allow:\s*\/([^/\s]+)\/|Sitemap:\s*https?:\/\/[^/]+\/([^/\s]+)\/siteMap\.xml)/gim)) {
    const site = m[1] ?? m[2];
    if (site && !NOISE.has(site.toLowerCase())) out.push({ host, tenant, site });
  }
  return out;
}

// ---------------------------------------------------------------- 3. verify

const client = new WorkdayClient(fetch, 20_000);
async function verify(s: Site): Promise<number | null> {
  const r = await client.page(s, {}, 0);
  return r ? (r.total ?? 0) : null;
}

// ---------------------------------------------------------------- run

const existing: Entry[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
console.log(`current registry: ${existing.length} sites`);

console.log("harvesting Common Crawl...");
const { hosts, sites: sighted } = await harvest();
const tenants = new Set([...sighted.map((s) => s.tenant)]);
console.log(`harvest: ${hosts.size} myworkdayjobs hosts, ${tenants.size} tenants, ${sighted.length} sightings`);

console.log("reading robots.txt for every host...");
const fromRobots = (await pool([...hosts], ([h, t]) => sitesFromRobots(h, t), 12)).flat();
console.log(`robots.txt: ${fromRobots.length} declared sites`);

const candidates = new Map<string, Site>();
for (const s of [...existing, ...sighted, ...fromRobots]) {
  const k = key(s);
  if (!candidates.has(k)) candidates.set(k, { host: s.host, tenant: s.tenant, site: s.site });
}
console.log(`verifying ${candidates.size} distinct candidate sites against the live API...`);

const list = [...candidates.values()];
let done = 0;
const counts = await pool(
  list,
  async (s) => {
    const n = await verify(s);
    if (++done % 500 === 0) console.log(`  ${done}/${list.length}`);
    return n;
  },
  12,
);

const out: Entry[] = [];
list.forEach((s, i) => {
  const n = counts[i];
  if (n && n > 0 && !NOT_PUBLIC.test(s.site)) out.push({ ...s, jobCount: n });
});
out.sort((a, b) => b.jobCount - a.jobCount);
writeFileSync(OUT, JSON.stringify(out));

const jobs = out.reduce((a, b) => a + b.jobCount, 0);
const outTenants = new Set(out.map((s) => s.tenant)).size;
console.log(`\nwrote ${out.length} live career sites across ${outTenants} companies`);
console.log(`~${jobs.toLocaleString()} open roles (lower bound: Workday reports at most 2,000 per site)`);
console.log(`dead or empty: ${list.length - out.length}`);

// ---------------------------------------------------------------- helpers

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function retry<T>(fn: () => Promise<T>, tries = 3, waitMs = 3000): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, waitMs * (i + 1)));
    }
  }
  return null;
}

async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>, width: number): Promise<R[]> {
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
