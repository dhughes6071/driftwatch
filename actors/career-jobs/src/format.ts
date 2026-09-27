/**
 * The published index format, shared by the crawler (writes it on the Mac mini)
 * and the Actor (reads it on Apify).
 *
 * WHY AN INDEX: the market leader answers "every data-engineer role in Texas
 * from the last day" in seconds because it has already collected every job.
 * Crawling 7,000+ career sites live per query would take hours. So a daily
 * crawl builds the index, and a query only reads it.
 *
 * LAYOUT, in one Apify key-value store:
 *   MANIFEST             JSON -- what's in the index and where (signed URLs)
 *   s-{run}-{nnn}        gzip JSONL of IndexJob, newest posting first, <= SHARD_SIZE each
 *   desc-{day}-{nnn}     gzip JSON { jobId: description }, written once, never rewritten
 *
 * Shards are sorted newest-first and carry their date range, so a
 * "posted in the last 7 days" query stops after the first shard or two.
 * Descriptions live apart because they are ~90% of the bytes and most
 * queries only need them for the few jobs they return.
 */

export const SHARD_SIZE = 40_000;
export const DESC_CHUNK_SIZE = 4_000;

export type Source = "greenhouse" | "ashby" | "lever" | "workday" | "oracle" | "smartrecruiters";

/** One job as stored in the index. Same field names as our other two Actors. */
export interface IndexJob {
  id: string;
  ats: Source;
  /** ATS identifier for the company ("stripe", "ms"). Stable. */
  company: string;
  /** Display name ("Stripe", "Morgan Stanley"); the id when unknown. */
  companyName: string;
  title: string;
  location: string | null;
  additionalLocations: string[];
  country: string | null;
  remote: boolean;
  remoteEligible: boolean;
  workplaceType: string | null;
  department: string | null;
  /** ISO date or datetime the company says it posted the role. */
  postedAt: string | null;
  /** When our crawler first saw the role -- a reliable "new since" signal even when postedAt is missing. */
  firstSeenAt: string;
  url: string;
  employmentType: string | null;
  /** Key of the description chunk holding this job's description, or null. */
  d: string | null;
}

export interface ShardRef {
  key: string;
  url: string;
  count: number;
  /** Newest / oldest postedAt in the shard (ISO), null when none are dated. */
  newest: string | null;
  oldest: string | null;
  /** Jobs with no postedAt; a date filter can only rule a shard out when this is 0. */
  undated: number;
}

export interface Manifest {
  version: 1;
  indexedAt: string;
  totalJobs: number;
  companies: number;
  bySource: Record<string, number>;
  shards: ShardRef[];
  /** Description chunk key -> signed URL. */
  desc: Record<string, string>;
}

/** Newest first; undated last (they cannot be ruled in or out by a date filter). */
export function compareNewestFirst(a: IndexJob, b: IndexJob): number {
  if (a.postedAt === b.postedAt) return 0;
  if (!a.postedAt) return 1;
  if (!b.postedAt) return -1;
  return a.postedAt < b.postedAt ? 1 : -1;
}
