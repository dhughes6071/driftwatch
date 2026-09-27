/**
 * Search the published index. Pure logic, no Apify SDK, so it is testable
 * against local files and reusable outside the Actor.
 */
import { gunzipSync } from "node:zlib";
import type { IndexJob, Manifest } from "./format.ts";

export interface Query {
  titleKeywords?: string[];
  titleExcludeKeywords?: string[];
  locationKeywords?: string[];
  companyKeywords?: string[];
  sources?: string[];
  remoteOnly?: boolean;
  postedWithinDays?: number;
  maxJobs: number;
  maxJobsPerCompany?: number;
}

export type Fetcher = (url: string) => Promise<Uint8Array>;

export const httpFetcher: Fetcher = async (url) => {
  // file:// links come from a local test publish (crawler/publish.ts PUBLISH_LOCAL_DIR).
  if (url.startsWith("file://")) {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(await readFile(new URL(url)));
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`index fetch failed: HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
};

/**
 * Location keyword test. Short keywords (state/country codes like "NY", "TX",
 * "UK") must match as whole words: as substrings, "NY" matches "Germany" and
 * "Albany", "CA" matches "Jamaica". Longer keywords match anywhere.
 */
export function locationMatcher(keywords: string[]): (text: string) => boolean {
  const tests = keywords
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .map((k) => {
      if (k.length > 3) return (t: string) => t.includes(k);
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
      return (t: string) => re.test(t);
    });
  return (text) => {
    const t = text.toLowerCase();
    return tests.some((f) => f(t));
  };
}

/** Lowercased, trimmed, empty entries dropped. */
const norm = (a?: string[]) => (a ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);

export function makeMatcher(q: Query, now = Date.now()) {
  const title = norm(q.titleKeywords);
  const exclude = norm(q.titleExcludeKeywords);
  const loc = norm(q.locationKeywords);
  const locMatch = locationMatcher(loc);
  const comp = norm(q.companyKeywords);
  const sources = new Set(norm(q.sources));
  const cutoff = q.postedWithinDays ? new Date(now - q.postedWithinDays * 86_400_000).toISOString() : null;

  return (j: IndexJob): boolean => {
    if (sources.size && !sources.has(j.ats)) return false;
    const t = j.title.toLowerCase();
    if (title.length && !title.some((k) => t.includes(k))) return false;
    if (exclude.length && exclude.some((k) => t.includes(k))) return false;
    if (q.remoteOnly && !j.remote) return false;
    if (loc.length) {
      if (!locMatch([j.location ?? "", ...j.additionalLocations, j.country ?? ""].join(" | "))) return false;
    }
    if (comp.length) {
      const c = `${j.company} ${j.companyName}`.toLowerCase();
      if (!comp.some((k) => c.includes(k))) return false;
    }
    if (cutoff) {
      // Undated roles fall back to when we first saw them: a role that
      // appeared in the last N days is new within N days by any definition.
      const when = j.postedAt ?? j.firstSeenAt;
      if (when < cutoff) return false;
    }
    return true;
  };
}

/**
 * Stream shards newest-first and collect matches. Stops reading as soon as it
 * has enough, and skips every shard entirely older than the date cutoff.
 */
export async function search(
  manifest: Manifest,
  q: Query,
  fetcher: Fetcher = httpFetcher,
  now = Date.now(),
): Promise<{ jobs: IndexJob[]; shardsRead: number }> {
  const match = makeMatcher(q, now);
  const cutoff = q.postedWithinDays ? new Date(now - q.postedWithinDays * 86_400_000).toISOString() : null;
  const perCompany = new Map<string, number>();
  const out: IndexJob[] = [];
  let shardsRead = 0;

  for (const shard of manifest.shards) {
    if (out.length >= q.maxJobs) break;
    // A shard whose newest dated job is older than the cutoff can be skipped --
    // unless it also holds undated jobs, which still qualify by firstSeenAt.
    // (Skip, not stop: the undated jobs sit in the last shards.)
    if (cutoff && shard.undated === 0 && shard.newest && shard.newest < cutoff) continue;

    const text = new TextDecoder().decode(gunzipSync(await fetcher(shard.url)));
    shardsRead++;
    for (const line of text.split("\n")) {
      if (!line) continue;
      const j = JSON.parse(line) as IndexJob;
      if (!match(j)) continue;
      const key = `${j.ats}:${j.company}`;
      if (q.maxJobsPerCompany) {
        const c = perCompany.get(key) ?? 0;
        if (c >= q.maxJobsPerCompany) continue;
        perCompany.set(key, c + 1);
      }
      out.push(j);
      if (out.length >= q.maxJobs) break;
    }
  }
  return { jobs: out, shardsRead };
}

/** Fetch descriptions for the given jobs, reading only the chunks they live in. */
export async function descriptionsFor(
  manifest: Manifest,
  jobs: IndexJob[],
  fetcher: Fetcher = httpFetcher,
): Promise<Map<string, string>> {
  const byChunk = new Map<string, string[]>();
  for (const j of jobs) {
    if (!j.d || !manifest.desc[j.d]) continue;
    byChunk.set(j.d, [...(byChunk.get(j.d) ?? []), j.id]);
  }
  const out = new Map<string, string>();
  for (const [chunk, ids] of byChunk) {
    const all = JSON.parse(new TextDecoder().decode(gunzipSync(await fetcher(manifest.desc[chunk])))) as Record<string, string>;
    for (const id of ids) if (all[id]) out.set(id, all[id]);
  }
  return out;
}
