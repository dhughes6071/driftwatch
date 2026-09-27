/** Shared HTTP for the extra sources: JSON with retries on 429/5xx, null on a definitive miss. */

const UA = "career-jobs-index/0.1 (+public career-site listings)";

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { accept: "application/json", "user-agent": UA, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        return null;
      }
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    return null;
  }
  return null;
}

/** HTML fragment -> plain text (same rules as the Workday actor), capped. */
export function toText(html: string | null | undefined, max = 8_000): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, max);
}

export const REMOTE_RE = /\bremote\b|\bwork from home\b|\bwfh\b|\bvirtual\b|\banywhere\b/i;

export function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
