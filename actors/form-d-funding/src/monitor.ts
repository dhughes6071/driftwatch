/**
 * "New since last run" for scheduled searches.
 *
 * Each search remembers which filings it has already delivered, in a named
 * key-value store in the caller's own Apify account (named stores persist
 * across runs). The record key is derived from the search's filters, so a
 * schedule that keeps the same filters picks up where it left off, and
 * changing any filter starts a new history.
 *
 * Filings are remembered by accession number, which the search hit already
 * carries, so delivered filings are skipped before their XML is downloaded.
 * Only delivered filings are remembered: one cut off by maxResults or a
 * spending limit is still new next time.
 */
import { createHash } from "node:crypto";

export const MONITOR_STORE = "form-d-funding-monitor";

/** Entries older than this are dropped. Searches never look back further than a year. */
export const KEEP_DAYS = 400;
/** Hard cap on remembered filings per search, oldest dropped first (keeps the record well under Apify's limits). */
export const MAX_ENTRIES = 150_000;

/** The filters that define a search. Values are normalised, so order and case do not matter. */
export function monitorKey(filters: Record<string, unknown>, name: string | undefined): string {
  const canon = JSON.stringify(
    Object.keys(filters)
      .sort()
      .map((k) => [k, normalise(filters[k])]),
  );
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return [...new Set(v.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].sort();
  if (typeof v === "string") return v.trim().toLowerCase();
  return v ?? null;
}

export interface MonitorState {
  /** accession number -> ISO time it was delivered */
  seen: Record<string, string>;
  lastRunAt: string;
  runs: number;
}

export class SeenFilings {
  private seen: Map<string, string>;

  constructor(state: MonitorState | null, now = new Date()) {
    const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
    this.seen = new Map(Object.entries(state?.seen ?? {}).filter(([, at]) => at >= cutoff));
  }

  get size() {
    return this.seen.size;
  }

  has(key: string) {
    return this.seen.has(key);
  }

  add(key: string, at: string) {
    this.seen.set(key, at);
  }

  toState(prev: MonitorState | null, now = new Date()): MonitorState {
    let entries = [...this.seen.entries()];
    if (entries.length > MAX_ENTRIES) entries = entries.sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, MAX_ENTRIES);
    return { seen: Object.fromEntries(entries), lastRunAt: now.toISOString(), runs: (prev?.runs ?? 0) + 1 };
  }
}
