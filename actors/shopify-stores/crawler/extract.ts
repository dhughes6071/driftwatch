/**
 * Pure parsing for the enrich step: Shopify's /meta.json, the homepage and
 * contact page HTML, the first page of /products.json, and robots.txt.
 * No network here, so every rule is testable against saved pages.
 */
import type { StoreRecord } from "../src/format.ts";

// ------------------------------------------------------------------ meta.json

export interface Meta {
  name: string;
  description: string | null;
  myshopifyDomain: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  currency: string | null;
  shipsToCountries: string[];
  productCount: number | null;
  collectionCount: number | null;
  /** The store's preferred address, e.g. "https://www.allbirds.com". */
  url: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Null when the body is not a Shopify meta.json (a headless site's HTML 200, a JSON error...). */
export function parseMeta(body: string): Meta | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(body);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || typeof j.name !== "string" || !("myshopify_domain" in j || "currency" in j)) return null;
  const ships = Array.isArray(j.ships_to_countries) ? (j.ships_to_countries as unknown[]).filter((c): c is string => typeof c === "string") : [];
  return {
    name: j.name.trim(),
    description: str(j.description),
    myshopifyDomain: str(j.myshopify_domain),
    city: str(j.city),
    province: str(j.province),
    country: str(j.country)?.toUpperCase() ?? null,
    currency: str(j.currency)?.toUpperCase() ?? null,
    shipsToCountries: ships.map((c) => c.toUpperCase()),
    productCount: int(j.published_products_count),
    collectionCount: int(j.published_collections_count),
    url: str(j.url),
  };
}

// ------------------------------------------------------------------ homepage / contact page

export interface PageFacts {
  emails: string[];
  phones: string[];
  socials: Pick<StoreRecord, "instagram" | "facebook" | "tiktok" | "youtube" | "pinterest" | "twitter" | "linkedin">;
  theme: string | null;
  apps: string[];
  language: string | null;
  passwordProtected: boolean;
}

const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,24}/gi;
/** Same shape, anchored and non-global (a global regex's .test() keeps state between calls). */
const VALID_EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i;
/** Addresses that are code, images or placeholders, not a way to reach the store. */
const JUNK_EMAIL =
  /\.(png|jpe?g|webp|svg|gif|css|js|avif)$|@(\d+x|2x)|sentry|wixpress|godaddy|@(example|domain|email|yourdomain|yourstore|company|test)\.|^(your|name|you|user|email|someone|john|jane|no-?reply|do-?not-?reply|mailer-daemon|postmaster)@|@shopify\.com$|@myshopify\.com$|\\u00|u003e/i;

/** decodeURIComponent throws on a malformed "%" sequence; a store's broken link must not stop the crawl. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  // mailto: links first -- the address the store chose to show.
  for (const m of html.matchAll(/mailto:([^"'?\s<>]+)/gi)) found.add(safeDecode(m[1]).toLowerCase());
  for (const m of html.matchAll(EMAIL)) found.add(m[0].toLowerCase());
  return [...found].filter((e) => VALID_EMAIL.test(e) && !JUNK_EMAIL.test(e)).slice(0, 5);
}

export function extractPhones(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const raw = safeDecode(m[1]).replace(/\s+/g, " ").trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15 || seen.has(digits)) continue;
    seen.add(digits);
    out.push(raw);
  }
  return out.slice(0, 3);
}

const SOCIAL: Array<[keyof PageFacts["socials"], RegExp, RegExp]> = [
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?=["'?#\s<])/gi, /^(p|reel|reels|explore|stories|accounts|shopify)$/i],
  ["facebook", /https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9_.\-]{2,80})\/?(?=["'?#\s<])/gi, /^(sharer|sharer\.php|share|plugins|dialog|tr|shopify|profile\.php|groups|events|watch)$/i],
  ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/(@[A-Za-z0-9_.]{2,30})\/?(?=["'?#\s<])/gi, /^@shopify$/i],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/((?:@|c\/|channel\/|user\/)[A-Za-z0-9_.\-]{2,60})\/?(?=["'?#\s<])/gi, /^@?shopify$/i],
  ["pinterest", /https?:\/\/(?:[a-z]{2}\.|www\.)?pinterest\.[a-z.]+\/([A-Za-z0-9_]{2,40})\/?(?=["'?#\s<])/gi, /^(pin|search|shopify)$/i],
  ["twitter", /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{2,15})\/?(?=["'?#\s<])/gi, /^(intent|share|home|shopify|i)$/i],
  ["linkedin", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/((?:company|in)\/[A-Za-z0-9_\-%.]{2,80})\/?(?=["'?#\s<])/gi, /^$/],
];

export function extractSocials(html: string): PageFacts["socials"] {
  const out = { instagram: null, facebook: null, tiktok: null, youtube: null, pinterest: null, twitter: null, linkedin: null } as PageFacts["socials"];
  for (const [key, re, skip] of SOCIAL) {
    for (const m of html.matchAll(re)) {
      if (skip.test(m[1])) continue;
      out[key] = m[0].replace(/^http:/, "https:").replace(/\/$/, "");
      break;
    }
  }
  return out;
}

/** Apps worth filtering on, recognised by the scripts they load. Name -> pattern. */
export const APPS: Array<[string, RegExp]> = [
  ["Klaviyo", /klaviyo\.com/i],
  ["Omnisend", /omnisnippet|omnisend\.com/i],
  ["Mailchimp", /chimpstatic\.com|list-manage\.com/i],
  ["Privy", /privy\.com\/collect/i],
  ["Attentive", /attn\.tv|attentivemobile/i],
  ["Postscript", /postscript\.io/i],
  ["Judge.me", /judge\.me/i],
  ["Yotpo", /yotpo\.com/i],
  ["Loox", /loox\.io/i],
  ["Okendo", /okendo\.io/i],
  ["Stamped", /stamped\.io/i],
  ["ReCharge", /rechargecdn|rechargepayments|rechargeapps/i],
  ["Rebuy", /rebuyengine/i],
  ["Smile.io", /smile\.io/i],
  ["LoyaltyLion", /loyaltylion/i],
  ["Gorgias", /gorgias/i],
  ["Tidio", /tidio\.co/i],
  ["Zendesk", /zdassets\.com/i],
  ["Afterpay", /afterpay/i],
  ["Klarna", /klarna/i],
  ["PageFly", /pagefly/i],
  ["GemPages", /gempages/i],
  ["Shogun", /getshogun|shogun\.io/i],
  ["Weglot", /weglot/i],
  ["Route", /routeapp|route\.com\/sdk/i],
  ["AfterShip", /aftership/i],
  ["Hotjar", /hotjar/i],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents/i],
  ["TikTok Pixel", /analytics\.tiktok\.com/i],
  ["Google Analytics", /googletagmanager\.com\/gtag|google-analytics\.com/i],
];

export function parsePage(html: string, finalUrl = ""): PageFacts {
  const theme = /Shopify\.theme\s*=\s*\{[^}]*?"schema_name"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? /Shopify\.theme\s*=\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null;
  // The theme sits in a JSON string inside a script, so "/" arrives as "\/".
  const themeName = theme ? theme.replace(/\\\//g, "/").trim() : null;
  return {
    emails: extractEmails(html),
    phones: extractPhones(html),
    socials: extractSocials(html),
    theme: themeName,
    apps: APPS.filter(([, re]) => re.test(html)).map(([n]) => n),
    language: /<html[^>]*\slang=["']?([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)/i.exec(html)?.[1].toLowerCase() ?? null,
    passwordProtected: /\/password(\?|$)/.test(finalUrl) || /template-password|password-page/i.test(html.slice(0, 50_000)),
  };
}

/** Merge contact details from the homepage and contact page, homepage first. */
export function mergePages(a: PageFacts, b: PageFacts | null): PageFacts {
  if (!b) return a;
  const uniq = (x: string[]) => [...new Set(x)];
  const socials = { ...a.socials };
  for (const k of Object.keys(socials) as Array<keyof typeof socials>) socials[k] ??= b.socials[k];
  return { ...a, emails: uniq([...a.emails, ...b.emails]).slice(0, 5), phones: uniq([...a.phones, ...b.phones]).slice(0, 3), socials };
}

// ------------------------------------------------------------------ products.json (page 1)

export interface CatalogFacts {
  priceMin: number | null;
  priceMedian: number | null;
  priceMax: number | null;
  productTypes: Array<{ name: string; count: number }>;
  vendors: Array<{ name: string; count: number }>;
  newestProductAt: string | null;
  productsAddedLast30Days: number;
}

/** Shopify returns products newest-published first, so page 1 covers the latest 250. */
export function parseProducts(body: string, now = Date.now()): CatalogFacts | null {
  let products: Array<Record<string, unknown>>;
  try {
    products = (JSON.parse(body) as { products?: Array<Record<string, unknown>> }).products ?? [];
  } catch {
    return null;
  }
  if (!Array.isArray(products)) return null;
  const prices: number[] = [];
  const types = new Map<string, number>();
  const vendors = new Map<string, number>();
  let newest: string | null = null;
  let recent = 0;
  const cutoff = now - 30 * 86_400_000;
  for (const p of products) {
    // One price per product (its cheapest variant), so a 40-size shoe counts once.
    const vp = ((p.variants as Array<{ price?: string }>) ?? []).map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
    if (vp.length) prices.push(Math.min(...vp));
    const t = typeof p.product_type === "string" ? p.product_type.trim() : "";
    if (t) types.set(t, (types.get(t) ?? 0) + 1);
    const v = typeof p.vendor === "string" ? p.vendor.trim() : "";
    if (v) vendors.set(v, (vendors.get(v) ?? 0) + 1);
    const at = typeof p.published_at === "string" ? p.published_at : null;
    if (at) {
      const ts = Date.parse(at);
      if (Number.isFinite(ts)) {
        const iso = new Date(ts).toISOString();
        if (!newest || iso > newest) newest = iso;
        if (ts >= cutoff) recent++;
      }
    }
  }
  prices.sort((a, b) => a - b);
  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count }));
  return {
    priceMin: prices[0] ?? null,
    priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    priceMax: prices.at(-1) ?? null,
    productTypes: top(types),
    vendors: top(vendors),
    newestProductAt: newest,
    productsAddedLast30Days: recent,
  };
}

// ------------------------------------------------------------------ robots.txt

/**
 * Is `path` allowed for our bot? Uses the group naming our token if there is
 * one, else the "*" group. Longest matching rule wins; Allow wins ties.
 * Supports * and $ wildcards, as Google and Shopify do.
 */
export function robotsAllows(robots: string, path: string, token = "cmmresearchbot"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<[boolean, string]> }> = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "allow" || key === "disallow") cur.rules.push([key === "allow", val]);
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: [boolean, number] = [true, -1];
  for (const g of pick) {
    for (const [allow, pattern] of g.rules) {
      if (!pattern) continue; // "Disallow:" with no path allows everything
      if (!ruleMatches(pattern, path)) continue;
      const len = pattern.length;
      if (len > best[1] || (len === best[1] && allow)) best = [allow, len];
    }
  }
  return best[0];
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}
