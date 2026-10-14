/**
 * The published index format, shared by the crawler (writes it on the Mac
 * mini) and the Actor (reads it on Apify).
 *
 * WHY AN INDEX: rivals look stores up live, one query at a time. We find
 * stores once (DNS: a custom domain pointing at Shopify's 23.227.38.x), check
 * each one about every two weeks, and the Actor only reads the result -- so a search
 * over a million stores answers in about a minute and costs us pennies.
 *
 * LAYOUT, in one Apify key-value store:
 *   MANIFEST        JSON -- what's in the index and where (signed URLs)
 *   s-{run}-{nnn}   gzip JSONL of StoreRecord, newest-discovered first, <= SHARD_SIZE each
 *
 * Shards are sorted by firstSeenAt (newest first) and carry their range, so
 * "stores found since my last run" stops after the first shard or two.
 */

export const SHARD_SIZE = 40_000;

/** One store as stored in the index. */
export interface StoreRecord {
  /** The store's own domain, e.g. "sphero.com" -- also its stable id. */
  domain: string;
  url: string;
  name: string;
  description: string | null;
  /** e.g. "weareallbirds.myshopify.com". */
  myshopifyDomain: string | null;
  city: string | null;
  /** State, province or region, as the store gives it. */
  province: string | null;
  /** ISO 3166 two-letter country of the business, e.g. "US". */
  country: string | null;
  /** ISO 4217, e.g. "USD". */
  currency: string | null;
  /** Countries the store ships to (ISO codes); "*" means everywhere. */
  shipsToCountries: string[];
  /** The page language from <html lang>, e.g. "en". */
  language: string | null;
  /** Published products, as Shopify reports them. Shopify stops counting at 25,001 ("25,000 or more"). */
  productCount: number | null;
  collectionCount: number | null;
  /** Prices over the store's newest products (up to 250 sampled), in its own currency. */
  priceMin: number | null;
  priceMedian: number | null;
  priceMax: number | null;
  /** Most common product types and brands among the newest products, with counts. */
  productTypes: Array<{ name: string; count: number }>;
  vendors: Array<{ name: string; count: number }>;
  /** When the store last published a product, and how many in the last 30 days (counted up to 250, so 250 means "250 or more"). */
  newestProductAt: string | null;
  productsAddedLast30Days: number;
  /** Public contact details the store shows on its own homepage or contact page. */
  emails: string[];
  phones: string[];
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  pinterest: string | null;
  twitter: string | null;
  linkedin: string | null;
  /** The theme the store is built on ("Dawn", "Warehouse"...). */
  theme: string | null;
  /** Well-known apps detected from the homepage (Klaviyo, Judge.me, ReCharge...). */
  apps: string[];
  /** When we first found the store, and last checked it. */
  firstSeenAt: string;
  checkedAt: string;
}

export interface ShardRef {
  key: string;
  url: string;
  count: number;
  /** Newest / oldest firstSeenAt in the shard (ISO). */
  newestFirstSeen: string;
  oldestFirstSeen: string;
}

export interface Manifest {
  version: 1;
  indexedAt: string;
  totalStores: number;
  byCountry: Record<string, number>;
  shards: ShardRef[];
}
