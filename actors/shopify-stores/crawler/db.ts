/**
 * The crawler's local SQLite database (Mac mini only, gitignored under data/).
 *
 *   stores    one row per domain found pointing at Shopify, with its latest
 *             check and, for live stores, the StoreRecord that gets published
 *   progress  how far discovery has read through each domain list, so a
 *             multi-night run over 133M domains resumes where it stopped
 *   runs      one row per discover / enrich / publish run, with stats
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../../..");
export const DB_PATH = process.env.SHOPIFY_DB ?? resolve(ROOT, "data/shopify-stores.db");

/** Store states. Only "live" stores are published. */
export type Status =
  | "new" //         found by DNS, not checked yet
  | "live" //        meta.json answered and the storefront is open
  | "password" //    storefront behind a password page (not launched, or closed to the public)
  | "closed" //      Shopify says payment required (402) or the shop is unavailable
  | "not_shopify" // meta.json missing or not Shopify's (headless sites, parked domains)
  | "robots" //      the store's robots.txt asks us not to read these pages
  | "error"; //      unreachable (DNS gone, TLS errors, timeouts)

export function openDb(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      domain      TEXT PRIMARY KEY,
      source      TEXT NOT NULL,           -- which domain list found it: tranco, cc-...
      first_seen  TEXT NOT NULL,
      dns_seen    TEXT NOT NULL,           -- last time DNS pointed it at Shopify
      status      TEXT NOT NULL DEFAULT 'new',
      checked_at  TEXT,
      next_check  TEXT NOT NULL,
      fails       INTEGER NOT NULL DEFAULT 0,
      shop_id     TEXT,                    -- myshopify domain, to fold duplicate domains of one shop
      record      TEXT,                    -- StoreRecord JSON, live stores only
      robots      TEXT,                    -- the store's robots.txt, cached
      robots_at   TEXT                     -- when it was fetched (re-read after 30 days)
    );
    CREATE INDEX IF NOT EXISTS stores_next ON stores(next_check);
    CREATE INDEX IF NOT EXISTS stores_status ON stores(status);
    CREATE TABLE IF NOT EXISTS progress (
      source TEXT PRIMARY KEY, position INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      started_at TEXT PRIMARY KEY, kind TEXT NOT NULL, finished_at TEXT, stats TEXT
    );
  `);
  // Added 14 Oct 2026, after the first database was created.
  const cols = new Set((db.prepare("PRAGMA table_info(stores)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!cols.has("robots")) db.exec("ALTER TABLE stores ADD COLUMN robots TEXT; ALTER TABLE stores ADD COLUMN robots_at TEXT;");
  return db;
}

export type Db = ReturnType<typeof openDb>;

export function startRun(db: Db, kind: string): string {
  const at = new Date().toISOString();
  db.prepare("INSERT INTO runs (started_at, kind) VALUES (?, ?)").run(at, kind);
  return at;
}

export function finishRun(db: Db, startedAt: string, stats: unknown) {
  db.prepare("UPDATE runs SET finished_at = ?, stats = ? WHERE started_at = ?").run(new Date().toISOString(), JSON.stringify(stats), startedAt);
}

export function log(msg: string) {
  console.log(`${new Date().toISOString().slice(0, 19).replace("T", " ")} ${msg}`);
}
