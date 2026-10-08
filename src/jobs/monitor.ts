/**
 * "New since last run" for scheduled searches (same design as the Workday
 * actor's monitor.ts).
 *
 * Each search remembers the job ids it has delivered, in a named key-value
 * store in the caller's own Apify account (named stores persist across runs).
 * The record key comes from the search's filters, so a schedule with the same
 * filters picks up where it left off, and changing any filter starts a new
 * history. Only delivered jobs are remembered: a job cut off by maxJobs or a
 * spending limit is still new next time.
 */
import { createHash } from "node:crypto";

export const MONITOR_STORE = "company-career-site-jobs-monitor";

/** Entries older than this are dropped; a role still open after that is delivered once more. */
export const KEEP_DAYS = 180;
/** Hard cap on remembered jobs per search, oldest dropped first. */
export const MAX_ENTRIES = 150_000;

export interface MonitorFilters {
  /** Normalised targets ("ats:slug" or "*:slug"), or empty with the curated list. */
  companies: string[];
  useCuratedList: boolean;
  titleKeywords: string[];
  locationKeywords: string[];
  remoteOnly: boolean;
  postedWithinDays?: number;
  onlyWithSalary?: boolean;
  minAnnualSalary?: number;
  salaryCurrencies?: string[];
}

export function monitorKey(f: MonitorFilters, name: string | undefined): string {
  const norm = (a: string[]) => [...new Set(a.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
  const canon = JSON.stringify([
    norm(f.companies),
    f.companies.length ? false : f.useCuratedList,
    norm(f.titleKeywords),
    norm(f.locationKeywords),
    f.remoteOnly,
    f.postedWithinDays ?? null,
    ...(f.onlyWithSalary || f.minAnnualSalary || f.salaryCurrencies?.length
      ? [["pay", !!f.onlyWithSalary, f.minAnnualSalary ?? null, norm(f.salaryCurrencies ?? [])]]
      : []),
  ]);
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}

export interface MonitorState {
  /** job id -> ISO time it was delivered */
  seen: Record<string, string>;
  lastRunAt: string;
  runs: number;
}

export class SeenJobs {
  private seen: Map<string, string>;

  constructor(state: MonitorState | null, now = new Date()) {
    const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
    this.seen = new Map(Object.entries(state?.seen ?? {}).filter(([, at]) => at >= cutoff));
  }

  get size() {
    return this.seen.size;
  }

  has(id: string) {
    return this.seen.has(id);
  }

  add(id: string, at: string) {
    this.seen.set(id, at);
  }

  toState(prev: MonitorState | null, now = new Date()): MonitorState {
    let entries = [...this.seen.entries()];
    if (entries.length > MAX_ENTRIES) entries = entries.sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, MAX_ENTRIES);
    return { seen: Object.fromEntries(entries), lastRunAt: now.toISOString(), runs: (prev?.runs ?? 0) + 1 };
  }
}
