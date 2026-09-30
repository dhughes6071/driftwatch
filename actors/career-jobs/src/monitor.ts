import { createHash } from "node:crypto";
import type { Query } from "./search.ts";

/**
 * "New since last run" memory lives in a named key-value store in the caller's
 * own Apify account (named stores persist across runs), one record per search.
 * The record key is derived from the filters, so a scheduled search that keeps
 * the same filters picks up where it left off; changing filters starts afresh.
 */
export const MONITOR_STORE = "career-site-jobs-monitor";

export function monitorKey(q: Query, name: string | undefined): string {
  const { maxJobs: _m, maxJobsPerCompany: _c, seenAfter: _s, ...filters } = q;
  const canon = JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}

export interface MonitorState {
  /** The index build this search last read; jobs first seen after it are new. */
  seenThrough: string;
  lastRunAt: string;
  runs: number;
}
