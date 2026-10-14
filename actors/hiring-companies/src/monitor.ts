import { createHash } from "node:crypto";

/**
 * "New since last run" memory lives in a named key-value store in the caller's
 * own Apify account (named stores persist across runs), one record per search.
 * The record key is derived from the filters, so a scheduled search that keeps
 * the same filters picks up where it left off; changing filters starts afresh.
 */
export const MONITOR_STORE = "hiring-companies-monitor";

export function monitorKey(filters: Record<string, unknown>, name: string | undefined): string {
  const norm = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].sort() : (v ?? null);
  const canon = JSON.stringify(Object.keys(filters).sort().map((k) => [k, norm(filters[k])]));
  const label = (name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${label || "search"}-${createHash("sha256").update(canon + "|" + label).digest("hex").slice(0, 16)}`;
}

export interface MonitorState {
  /** The index build this search last read; roles first seen after it are new. */
  seenThrough: string;
  lastRunAt: string;
  runs: number;
}
