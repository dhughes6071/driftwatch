/**
 * Structured JSON logging to stdout. No log service, no monthly bill.
 * Redirect to a file and rotate with logrotate if you want history.
 *
 * PRIVACY: never log raw IPs, request bodies, or anything that could contain
 * a secret. clientKey() below hashes the IP before it is ever stored.
 */
import { createHash } from "node:crypto";
import { config } from "./config.ts";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[(config.ops.logLevel as Level) in LEVELS ? (config.ops.logLevel as Level) : "info"];

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};

/**
 * One-way hash of a client IP, salted per install. We use this for rate
 * limiting without ever storing the IP itself.
 */
const SALT = process.env.CLIENT_HASH_SALT ?? "driftwatch-local-dev-salt";
export function clientKey(ip: string | undefined): string {
  return createHash("sha256").update(SALT).update(ip ?? "unknown").digest("hex").slice(0, 16);
}
