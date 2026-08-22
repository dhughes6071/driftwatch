/**
 * Shared upstream HTTP helper: timeout, bounded retry, polite user-agent.
 *
 * Every upstream we use is a free, public, documented API. We identify
 * ourselves honestly and back off on 429 rather than hammering anyone.
 */
import { config } from "../lib/config.ts";
import { log } from "../lib/log.ts";

const UA = "driftwatch/0.1 (+https://github.com/driftwatch; dependency migration intelligence)";

export class UpstreamError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.url = url;
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: { headers?: Record<string, string>; retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), config.limits.upstreamTimeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { "user-agent": UA, accept: "application/json", ...opts.headers },
      });

      if (res.status === 429 || res.status >= 500) {
        // Retryable. Exponential backoff with a small jitter.
        if (attempt < retries) {
          const wait = 2 ** attempt * 500 + Math.random() * 250;
          log.debug("upstream retry", { url, status: res.status, attempt, wait });
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }

      if (!res.ok) throw new UpstreamError(`HTTP ${res.status}`, res.status, url);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status < 500 && err.status !== 429) throw err;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
  }

  log.warn("upstream failed", { url, err: String(lastErr) });
  throw lastErr instanceof Error ? lastErr : new Error(`upstream failed: ${url}`);
}

/** GitHub calls work unauthenticated at 60 req/hour; a token raises it to 5000. */
export function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? { authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }
    : { "x-github-api-version": "2022-11-28" };
}
