/**
 * SQLite storage. Three jobs:
 *   1. Permanent cache of computed deltas (the thing that makes margin ~95%).
 *   2. Request + payment ledger (so you can see revenue and costs).
 *   3. Rate-limit counters and daily LLM spend tracking.
 *
 * SQLite is the right call here: single file, no server, no monthly bill,
 * trivially backed up by copying one file. It will comfortably handle far more
 * traffic than we expect for a long time.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.ts";

mkdirSync(dirname(config.db.path), { recursive: true });

export const db = new Database(config.db.path);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS deltas (
  key           TEXT PRIMARY KEY,       -- ecosystem:name:from:to
  ecosystem     TEXT NOT NULL,
  name          TEXT NOT NULL,
  from_version  TEXT NOT NULL,
  to_version    TEXT NOT NULL,
  payload       TEXT NOT NULL,          -- JSON DeltaResult
  tier          TEXT NOT NULL,          -- 'evidence' | 'synthesized'
  computed_at   INTEGER NOT NULL,
  compute_cost_usd REAL NOT NULL DEFAULT 0,
  serve_count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_deltas_pkg ON deltas(ecosystem, name);

-- Every request, paid or free. This is your revenue + usage ledger.
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,
  route        TEXT NOT NULL,
  status       INTEGER NOT NULL,
  paid         INTEGER NOT NULL DEFAULT 0,
  price_usd    REAL NOT NULL DEFAULT 0,
  payer        TEXT,                    -- payer wallet address when paid
  tx_hash      TEXT,
  cache_hit    INTEGER NOT NULL DEFAULT 0,
  cost_usd     REAL NOT NULL DEFAULT 0, -- our variable cost to serve
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  client_key   TEXT                     -- hashed IP, never the raw IP
);
CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);

-- Sliding-window rate limiting, keyed on hashed client identity.
CREATE TABLE IF NOT EXISTS rate_events (
  client_key TEXT NOT NULL,
  ts         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_events(client_key, ts);

-- Daily spend tracking so the LLM can never run away with your money.
CREATE TABLE IF NOT EXISTS spend_daily (
  day       TEXT PRIMARY KEY,           -- YYYY-MM-DD UTC
  llm_usd   REAL NOT NULL DEFAULT 0,
  calls     INTEGER NOT NULL DEFAULT 0
);
`);

/**
 * Bump this whenever a change to the engine would produce a BETTER answer for
 * the same inputs -- new sources, extraction fixes, prompt changes.
 *
 * Without it, cached results computed under buggy code live forever. Measured
 * twice on 2026-08-08: pydantic was serving 2 breaking changes from a
 * pre-salvage-fix entry (the fix takes it to 25), and Django kept returning
 * "no release notes found" from a cache entry written before per-version
 * release files were supported. Both looked like the fix had failed. It had
 * not -- the cache was simply older than the code.
 *
 * The version is part of the cache key, so a bump makes old entries
 * unreachable rather than deleting them: cheap, and trivially reversible.
 */
export const ENGINE_VERSION = 3;

export function deltaKey(ecosystem: string, name: string, from: string, to: string): string {
  return `v${ENGINE_VERSION}:${ecosystem}:${name}:${from}:${to}`.toLowerCase();
}

// ---------------------------------------------------------------- cache

export function getCachedDelta(key: string): { payload: unknown; tier: string } | null {
  const row = db.prepare(`SELECT payload, tier FROM deltas WHERE key = ?`).get(key) as
    | { payload: string; tier: string }
    | undefined;
  if (!row) return null;
  db.prepare(`UPDATE deltas SET serve_count = serve_count + 1 WHERE key = ?`).run(key);
  return { payload: JSON.parse(row.payload), tier: row.tier };
}

export function putCachedDelta(args: {
  key: string;
  ecosystem: string;
  name: string;
  from: string;
  to: string;
  payload: unknown;
  tier: string;
  computeCostUsd: number;
}): void {
  db.prepare(
    `INSERT INTO deltas (key, ecosystem, name, from_version, to_version, payload, tier, computed_at, compute_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       payload = excluded.payload,
       tier = excluded.tier,
       computed_at = excluded.computed_at,
       compute_cost_usd = excluded.compute_cost_usd`,
  ).run(
    args.key,
    args.ecosystem,
    args.name,
    args.from,
    args.to,
    JSON.stringify(args.payload),
    args.tier,
    Date.now(),
    args.computeCostUsd,
  );
}

// ---------------------------------------------------------------- ledger

export function recordRequest(r: {
  route: string;
  status: number;
  paid?: boolean;
  priceUsd?: number;
  payer?: string | null;
  txHash?: string | null;
  cacheHit?: boolean;
  costUsd?: number;
  durationMs?: number;
  clientKey?: string | null;
}): void {
  db.prepare(
    `INSERT INTO requests (ts, route, status, paid, price_usd, payer, tx_hash, cache_hit, cost_usd, duration_ms, client_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    Date.now(),
    r.route,
    r.status,
    r.paid ? 1 : 0,
    r.priceUsd ?? 0,
    r.payer ?? null,
    r.txHash ?? null,
    r.cacheHit ? 1 : 0,
    r.costUsd ?? 0,
    r.durationMs ?? 0,
    r.clientKey ?? null,
  );
}

// ---------------------------------------------------------------- rate limit

/** Sliding-window counter. Returns the number of requests in the last hour. */
export function countRecent(clientKey: string, windowMs = 3_600_000): number {
  const cutoff = Date.now() - windowMs;
  db.prepare(`DELETE FROM rate_events WHERE ts < ?`).run(Date.now() - 86_400_000);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM rate_events WHERE client_key = ? AND ts >= ?`)
    .get(clientKey, cutoff) as { n: number };
  return row.n;
}

export function noteRequest(clientKey: string): void {
  db.prepare(`INSERT INTO rate_events (client_key, ts) VALUES (?, ?)`).run(clientKey, Date.now());
}

// ---------------------------------------------------------------- spend

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailySpend(): number {
  const row = db.prepare(`SELECT llm_usd FROM spend_daily WHERE day = ?`).get(today()) as
    | { llm_usd: number }
    | undefined;
  return row?.llm_usd ?? 0;
}

export function addDailySpend(usd: number): void {
  db.prepare(
    `INSERT INTO spend_daily (day, llm_usd, calls) VALUES (?, ?, 1)
     ON CONFLICT(day) DO UPDATE SET llm_usd = llm_usd + excluded.llm_usd, calls = calls + 1`,
  ).run(today(), usd);
}

// ---------------------------------------------------------------- reporting

export function revenueSummary(sinceMs: number) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*)                                   AS requests,
         SUM(paid)                                  AS paid_requests,
         COALESCE(SUM(price_usd), 0)                AS revenue_usd,
         COALESCE(SUM(cost_usd), 0)                 AS cost_usd,
         COALESCE(SUM(cache_hit), 0)                AS cache_hits,
         COUNT(DISTINCT payer)                      AS unique_payers
       FROM requests WHERE ts >= ?`,
    )
    .get(sinceMs) as Record<string, number>;
  return {
    requests: row.requests ?? 0,
    paidRequests: row.paid_requests ?? 0,
    revenueUsd: Number((row.revenue_usd ?? 0).toFixed(6)),
    costUsd: Number((row.cost_usd ?? 0).toFixed(6)),
    grossProfitUsd: Number(((row.revenue_usd ?? 0) - (row.cost_usd ?? 0)).toFixed(6)),
    cacheHits: row.cache_hits ?? 0,
    uniquePayers: row.unique_payers ?? 0,
  };
}
