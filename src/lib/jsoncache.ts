/**
 * Dependency-free cache and spend store, used when SQLite is unavailable.
 *
 * WHY THIS EXISTS: `better-sqlite3` is a native module that compiles on
 * install. On this machine it built from source with no prebuilt binary --
 * exactly the fragility that gives community MCP servers their reported
 * 30-50% install failure rate. Shipping that in an npm package whose entire
 * pitch is "this does not break" would be self-defeating.
 *
 * So the published MCP server falls back to this: two small JSON files, no
 * native code, no build step. Slower than SQLite and not safe for concurrent
 * writers, which is fine -- an MCP server is a single local process serving
 * one editor.
 *
 * The HTTP API still gets real SQLite, where the ledger and rate limiting
 * genuinely need it.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

interface CacheFile {
  deltas: Record<string, { payload: unknown; tier: string; computedAt: number; serveCount: number }>;
  spend: Record<string, { usd: number; calls: number }>;
}

const EMPTY: CacheFile = { deltas: {}, spend: {} };

export class JsonCache {
  private path: string;
  private data: CacheFile;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(basePath: string) {
    // Sit beside whatever path the SQLite DB would have used.
    this.path = join(dirname(basePath), "driftwatch-cache.json");
    mkdirSync(dirname(this.path), { recursive: true });
    this.data = this.load();
  }

  private load(): CacheFile {
    if (!existsSync(this.path)) return structuredClone(EMPTY);
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<CacheFile>;
      return { deltas: parsed.deltas ?? {}, spend: parsed.spend ?? {} };
    } catch {
      // A corrupt cache is not worth crashing over -- it is a cache.
      return structuredClone(EMPTY);
    }
  }

  /**
   * Write via a temp file and rename. A half-written cache that fails to parse
   * costs real money: every entry would silently recompute against the LLM.
   */
  private flush(): void {
    if (!this.dirty) return;
    const tmp = `${this.path}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.path);
      this.dirty = false;
    } catch {
      // Disk problems should degrade to "no cache", never take down the server.
    }
  }

  /** Batch writes -- an editor session can produce a burst of lookups. */
  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 250);
    this.flushTimer.unref?.();
  }

  getDelta(key: string): { payload: unknown; tier: string } | null {
    const row = this.data.deltas[key];
    if (!row) return null;
    row.serveCount++;
    this.scheduleFlush();
    return { payload: row.payload, tier: row.tier };
  }

  putDelta(key: string, payload: unknown, tier: string): void {
    this.data.deltas[key] = { payload, tier, computedAt: Date.now(), serveCount: 0 };
    this.scheduleFlush();
  }

  getSpend(day: string): number {
    return this.data.spend[day]?.usd ?? 0;
  }

  addSpend(day: string, usd: number): void {
    const cur = this.data.spend[day] ?? { usd: 0, calls: 0 };
    this.data.spend[day] = { usd: cur.usd + usd, calls: cur.calls + 1 };
    this.scheduleFlush();
  }

  /** Flush synchronously — call before exit so nothing is lost. */
  close(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flush();
  }
}
