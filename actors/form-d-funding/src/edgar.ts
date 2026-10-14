/**
 * SEC EDGAR client: lists Form D filings through EDGAR full-text search (the
 * JSON API behind efts.sec.gov / sec.gov's own search page) and fetches each
 * filing's primary_doc.xml.
 *
 * SEC fair-access rules: at most 10 requests per second per caller, and a
 * User-Agent naming the caller with a contact email. We stay at 8 per second.
 * https://www.sec.gov/os/accessing-edgar-data
 */
import type { FilingRef } from "./formd.ts";

export const USER_AGENT = "CMM Research chazmichael_michaels@icloud.com";
const SEARCH = "https://efts.sec.gov/LATEST/search-index";
/** Full-text search refuses to page past 10,000 hits per query. */
const WINDOW_LIMIT = 10_000;
const PAGE = 100;

/** One search hit: enough to skip a filing before downloading it. */
export interface Hit extends FilingRef {
  /** "D" or "D/A". */
  form: string;
  /** "ExBrain, Inc.  (CIK 0002160087)" -> "ExBrain, Inc." */
  name: string;
  /** Business states as EDGAR records them, e.g. ["TX"]. */
  states: string[];
}

export interface SearchOptions {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  to: string;
  /** EDGAR location codes (US states and EDGAR country codes), filtered server-side. */
  locations?: string[];
}

/** Spaces requests evenly so the whole run stays under `perSecond`. */
export class RateLimiter {
  private next = 0;
  private perSecond: number;
  constructor(perSecond: number) {
    this.perSecond = perSecond;
  }
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + 1000 / this.perSecond;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
  /** After a 429/403: push every caller back. */
  backOff(ms: number) {
    this.next = Math.max(this.next, Date.now() + ms);
  }
}

export class EdgarClient {
  readonly limiter: RateLimiter;
  requests = 0;
  private fetchImpl: typeof fetch;
  constructor(perSecond = 8, fetchImpl: typeof fetch = fetch) {
    this.limiter = new RateLimiter(perSecond);
    this.fetchImpl = fetchImpl;
  }

  /** GET with timeout and retries. Returns null on a 404 (a filing withdrawn or not yet published). */
  async get(url: string, accept: string): Promise<string | null> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.limiter.wait();
      this.requests++;
      try {
        const res = await this.fetchImpl(url, {
          headers: { "User-Agent": USER_AGENT, Accept: accept },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) return await res.text();
        if (res.status === 404) return null;
        // 403 is how SEC answers callers that go over the rate limit.
        if (res.status === 429 || res.status === 403 || res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
          this.limiter.backOff(Math.min(30_000, 2_000 * 2 ** attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      } catch (err) {
        if (err instanceof Error && /^HTTP \d+ for/.test(err.message)) throw err;
        lastErr = err;
        this.limiter.backOff(1_000 * 2 ** attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** One page of search hits, newest first. */
  async searchPage(o: SearchOptions, offset: number): Promise<{ total: number; hits: Hit[] }> {
    const p = new URLSearchParams({ forms: "D", dateRange: "custom", startdt: o.from, enddt: o.to });
    if (o.locations?.length) p.set("locationCodes", o.locations.join(","));
    if (offset) p.set("from", String(offset));
    const body = await this.get(`${SEARCH}?${p}`, "application/json");
    if (body == null) throw new Error("EDGAR search returned 404");
    return parseSearch(body);
  }

  /**
   * Every hit in [from, to], newest first, across as many pages as needed.
   * Ranges over the 10,000-hit window are split in two and walked newest half first.
   * `onHit` may return true to stop early.
   */
  async search(o: SearchOptions, onHit: (h: Hit) => boolean | void | Promise<boolean | void>, onWarning?: (w: string) => void): Promise<boolean> {
    const first = await this.searchPage(o, 0);
    if (first.total > WINDOW_LIMIT - PAGE) {
      const days = daysBetween(o.from, o.to);
      if (days >= 1) {
        const mid = addDays(o.from, Math.floor(days / 2));
        if (await this.search({ ...o, from: addDays(mid, 1) }, onHit, onWarning)) return true;
        return this.search({ ...o, to: mid }, onHit, onWarning);
      }
      onWarning?.(`More than ${WINDOW_LIMIT} Form D filings on ${o.from}; only the first ${WINDOW_LIMIT} are reachable.`);
    }
    let page = first;
    for (let offset = 0; ; ) {
      for (const h of page.hits) if (await onHit(h)) return true;
      offset += PAGE;
      if (page.hits.length < PAGE || offset >= Math.min(page.total, WINDOW_LIMIT)) return false;
      page = await this.searchPage(o, offset);
    }
  }

  /** The filing's XML, or null when EDGAR no longer has it. */
  async filingXml(ref: FilingRef): Promise<string | null> {
    const folder = ref.accessionNumber.replace(/-/g, "");
    return this.get(`https://www.sec.gov/Archives/edgar/data/${ref.cik}/${folder}/${ref.fileName}`, "application/xml,text/xml");
  }
}

export function parseSearch(body: string): { total: number; hits: Hit[] } {
  const d = JSON.parse(body) as {
    hits?: { total?: { value?: number }; hits?: Array<{ _id: string; _source: Record<string, unknown> }> };
  };
  const hits: Hit[] = [];
  for (const h of d.hits?.hits ?? []) {
    const s = h._source;
    const [adsh, fileName = "primary_doc.xml"] = h._id.split(":");
    const ciks = (s.ciks as string[] | undefined) ?? [];
    const display = ((s.display_names as string[] | undefined) ?? [])[0] ?? "";
    if (!adsh || !ciks[0]) continue;
    hits.push({
      accessionNumber: adsh,
      cik: ciks[0].replace(/^0+/, ""),
      fileName,
      filedAt: (s.file_date as string | undefined) ?? null,
      form: (s.form as string | undefined) ?? (s.file_type as string | undefined) ?? "D",
      name: display.replace(/\s*\(CIK \d+\)\s*$/, "").trim(),
      states: (s.biz_states as string[] | undefined) ?? [],
    });
  }
  return { total: d.hits?.total?.value ?? hits.length, hits };
}

// ------------------------------------------------------------------ dates (UTC, YYYY-MM-DD)

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000));
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
