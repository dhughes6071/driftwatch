/**
 * Search the published store index. Pure logic, no Apify SDK, so it is
 * testable against local files.
 */
import { gunzipSync } from "node:zlib";
import type { Manifest, StoreRecord } from "./format.ts";

export interface Query {
  /** Any of these in the name, description, domain, product types or brands. */
  keywords?: string[];
  excludeKeywords?: string[];
  /** ISO country codes of the business, e.g. ["US", "GB"]. */
  countries?: string[];
  /** City or state/province contains one of these. */
  locationKeywords?: string[];
  currencies?: string[];
  /** Ships to at least one of these countries (or everywhere). */
  shipsTo?: string[];
  languages?: string[];
  minProducts?: number;
  maxProducts?: number;
  minMedianPrice?: number;
  maxMedianPrice?: number;
  /** Published a product in the last N days. */
  activeWithinDays?: number;
  minProductsAddedLast30Days?: number;
  requireEmail?: boolean;
  requirePhone?: boolean;
  /** Has a profile on each of these networks, e.g. ["instagram", "tiktok"]. */
  requireSocials?: string[];
  /** Uses at least one of these apps, e.g. ["Klaviyo"]. */
  apps?: string[];
  /** Theme name contains one of these, e.g. ["Dawn"]. */
  themes?: string[];
  /** Found by us in the last N days. */
  foundWithinDays?: number;
  /** Only stores first seen after this time (ISO): "new since last run". */
  seenAfter?: string;
  sortBy?: SortBy;
  maxResults: number;
}

export type SortBy = "newestFound" | "mostProducts" | "mostAddedLast30Days" | "newestProduct";

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
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`index fetch failed: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
};

/** Gunzip if the bytes are gzip, else pass through (an HTTP layer may have decoded them already). */
export function unzipText(bytes: Uint8Array): string {
  const gz = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return new TextDecoder().decode(gz ? gunzipSync(bytes) : bytes);
}

const norm = (a?: string[]) => (a ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Short keywords (3 letters or fewer, like "tea" or "dog") match whole words only; longer ones anywhere. */
export function wordMatcher(keywords: string[]): (text: string) => boolean {
  const tests = norm(keywords).map((k) => {
    if (k.length > 3) return (t: string) => t.includes(k);
    const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
    return (t: string) => re.test(t);
  });
  return (text) => tests.some((f) => f(text));
}

const searchable = (s: StoreRecord) =>
  [s.name, s.description ?? "", s.domain, ...s.productTypes.map((t) => t.name), ...s.vendors.map((v) => v.name)].join(" | ").toLowerCase();

export function makeMatcher(q: Query, now = Date.now()) {
  const kw = norm(q.keywords);
  const kwMatch = wordMatcher(kw);
  const ex = norm(q.excludeKeywords);
  const exMatch = wordMatcher(ex);
  const countries = new Set(norm(q.countries).map((c) => c.toUpperCase()));
  const loc = norm(q.locationKeywords);
  const locMatch = wordMatcher(loc);
  const currencies = new Set(norm(q.currencies).map((c) => c.toUpperCase()));
  const shipsTo = new Set(norm(q.shipsTo).map((c) => c.toUpperCase()));
  const langs = norm(q.languages);
  const socials = norm(q.requireSocials) as Array<keyof StoreRecord>;
  const apps = new Set(norm(q.apps));
  const themes = norm(q.themes);
  const activeCut = q.activeWithinDays ? new Date(now - q.activeWithinDays * 86_400_000).toISOString() : null;
  const foundCut = q.foundWithinDays ? new Date(now - q.foundWithinDays * 86_400_000).toISOString() : null;

  return (s: StoreRecord): boolean => {
    if (q.seenAfter && !(s.firstSeenAt > q.seenAfter)) return false;
    if (foundCut && s.firstSeenAt < foundCut) return false;
    if (countries.size && !countries.has(s.country ?? "")) return false;
    if (currencies.size && !currencies.has(s.currency ?? "")) return false;
    if (shipsTo.size && !s.shipsToCountries.some((c) => c === "*" || shipsTo.has(c))) return false;
    if (langs.length && !langs.some((l) => (s.language ?? "").startsWith(l))) return false;
    if (q.minProducts != null && (s.productCount ?? 0) < q.minProducts) return false;
    if (q.maxProducts != null && (s.productCount ?? 0) > q.maxProducts) return false;
    if (q.minMedianPrice != null && (s.priceMedian == null || s.priceMedian < q.minMedianPrice)) return false;
    if (q.maxMedianPrice != null && (s.priceMedian == null || s.priceMedian > q.maxMedianPrice)) return false;
    if (activeCut && !(s.newestProductAt && s.newestProductAt >= activeCut)) return false;
    if (q.minProductsAddedLast30Days && s.productsAddedLast30Days < q.minProductsAddedLast30Days) return false;
    if (q.requireEmail && !s.emails.length) return false;
    if (q.requirePhone && !s.phones.length) return false;
    if (socials.length && !socials.every((k) => s[k])) return false;
    if (apps.size && !s.apps.some((a) => apps.has(a.toLowerCase()))) return false;
    if (themes.length && !themes.some((t) => (s.theme ?? "").toLowerCase().includes(t))) return false;
    if (loc.length && !locMatch(`${s.city ?? ""} | ${s.province ?? ""}`.toLowerCase())) return false;
    if (kw.length || ex.length) {
      const text = searchable(s);
      if (kw.length && !kwMatch(text)) return false;
      if (ex.length && exMatch(text)) return false;
    }
    return true;
  };
}

const sortKey: Record<SortBy, (s: StoreRecord) => number | string> = {
  newestFound: (s) => s.firstSeenAt,
  mostProducts: (s) => s.productCount ?? 0,
  mostAddedLast30Days: (s) => s.productsAddedLast30Days,
  newestProduct: (s) => s.newestProductAt ?? "",
};

/**
 * Stream shards (newest-found first) and collect matches. For the default
 * sort it stops as soon as it has enough; other sorts read everything but
 * only ever hold the top results in memory.
 */
export async function search(
  manifest: Manifest,
  q: Query,
  fetcher: Fetcher = httpFetcher,
  now = Date.now(),
  deadline = Infinity,
): Promise<{ stores: StoreRecord[]; matched: number; shardsRead: number; timeLimited: boolean }> {
  const match = makeMatcher(q, now);
  const sortBy = q.sortBy ?? "newestFound";
  const key = sortKey[sortBy];
  const byKey = (a: StoreRecord, b: StoreRecord) => {
    const x = key(a);
    const y = key(b);
    return x === y ? a.domain.localeCompare(b.domain) : x < y ? 1 : -1;
  };
  let out: StoreRecord[] = [];
  let matched = 0;
  let shardsRead = 0;
  let timeLimited = false;
  const early = sortBy === "newestFound";

  for (const shard of manifest.shards) {
    if (early && out.length >= q.maxResults) break;
    if (Date.now() > deadline) {
      timeLimited = true;
      break;
    }
    // Shards are newest-found first: once one is older than the cutoff, so are the rest.
    if (q.seenAfter && shard.newestFirstSeen <= q.seenAfter) break;
    const text = unzipText(await fetcher(shard.url));
    shardsRead++;
    for (const line of text.split("\n")) {
      if (!line) continue;
      const s = JSON.parse(line) as StoreRecord;
      if (!match(s)) continue;
      matched++;
      if (early) {
        if (out.length < q.maxResults) out.push(s);
        continue;
      }
      out.push(s);
      if (out.length >= q.maxResults * 2 + 1000) out = out.sort(byKey).slice(0, q.maxResults);
    }
  }
  out.sort(byKey);
  return { stores: out.slice(0, q.maxResults), matched, shardsRead, timeLimited };
}
