/**
 * "New since last run" for scheduled searches.
 *
 * Workday is scraped live, so there is no index date to compare against.
 * Instead each search remembers which postings it has already delivered, in a
 * named key-value store in the caller's own Apify account (named stores
 * persist across runs). The record key is derived from the search's filters,
 * so a schedule that keeps the same filters picks up where it left off, and
 * changing any filter starts a new history.
 *
 * Postings are remembered by career site + Workday path, which the list call
 * already returns, so delivered postings are skipped before any detail call.
 * Only delivered postings are remembered: a role cut off by maxJobs or a
 * spending limit is still new next time.
 */
import { createHash } from "node:crypto";

export const MONITOR_STORE = "workday-jobs-monitor";

/** Entries older than this are dropped; a role still open after that is delivered once more. */
export const KEEP_DAYS = 180;
/** Hard cap on remembered postings per search, oldest dropped first (keeps the record well under Apify's limits). */
export const MAX_ENTRIES = 150_000;

export interface MonitorFilters {
  careerSiteUrls: string[];
  useCuratedList: boolean;
  companyKeywords: string[];
  searchText: string;
  titleKeywords: string[];
  locationKeywords: string[];
  remoteOnly: boolean;
  postedWithinDays?: number;
}

export function monitorKey(f: MonitorFilters, name: string | undefined): string {
  const norm = (a: string[]) => [...new Set(a.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
  const canon = JSON.stringify([
    norm(f.careerSiteUrls),
    f.useCuratedList,
    norm(f.companyKeywords),
    f.searchText.trim().toLowerCase(),
    norm(f.titleKeywords),
    norm(f.locationKeywords),
    f.remoteOnly,
    f.postedWithinDays ?? null,
  ]);
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}

export interface MonitorState {
  /** posting key -> ISO time it was delivered */
  seen: Record<string, string>;
  lastRunAt: string;
  runs: number;
}

/** One posting's identity on one career site. */
export const postingKey = (tenant: string, site: string, externalPath: string) =>
  `${tenant}/${site.toLowerCase()}${externalPath}`;

export class SeenPostings {
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
