/**
 * Seed company list for ATS discovery.
 *
 * This file is deliberately just candidate NAMES, not verified slugs. The
 * discovery script (`scripts/discover-companies.ts`) probes each candidate
 * against all four ATS APIs and records only the ones that actually resolve.
 * Guessing is cheap; a verified list is the asset.
 *
 * Measured hit rate on naive slug guessing: 83% (25/30). The slug is usually
 * just the company name lowercased with punctuation stripped, because that is
 * what a company types into its ATS signup form.
 *
 * Expand this list freely -- coverage is the whole product. Every name added
 * costs one HTTP probe per ATS, once, and either resolves or does not.
 */

/**
 * Candidate company names. Weighted toward technology, startups, and
 * scale-ups, because those are the companies that use Greenhouse, Lever,
 * Ashby, and Workable -- and whose jobs the buyers of this data want.
 */
export const SEED_COMPANIES: string[] = [
  // Payments / fintech
  "stripe", "plaid", "brex", "ramp", "affirm", "chime", "marqeta", "mercury",
  "wise", "revolut", "monzo", "checkout", "adyen", "gusto", "carta", "addepar",
  "modernTreasury", "unit", "lithic", "moov", "column", "increase", "alloy",
  "middesk", "persona", "sardine", "highnote", "finix", "dwolla", "astra",

  // Developer tools / infrastructure
  "vercel", "netlify", "render", "railway", "flyio", "supabase", "planetscale",
  "neon", "cockroachlabs", "timescale", "clickhouse", "confluent", "databricks",
  "snowflake", "dbtlabs", "fivetran", "airbyte", "hightouch", "census",
  "temporal", "hashicorp", "pulumi", "gitlab", "sourcegraph", "linear",
  "sentry", "datadog", "grafana", "honeycomb", "chronosphere", "cribl",
  "lightstep", "pagerduty", "incidentio", "rootly", "firehydrant", "blameless",
  "docker", "circleci", "buildkite", "harness", "codecov", "snyk", "socket",
  "chainguard", "tailscale", "cloudflare", "fastly", "ngrok", "warp",

  // AI / ML
  "anthropic", "openai", "cohere", "huggingface", "scaleai", "surgehq",
  "labelbox", "weightsandbiases", "cometml", "modal", "replicate", "together",
  "anyscale", "runpod", "baseten", "fireworksai", "groq", "cerebras",
  "perplexityai", "elevenlabs", "runwayml", "synthesia", "descript",
  "assemblyai", "deepgram", "pinecone", "weaviate", "chroma", "qdrant",
  "llamaindex", "langchain", "cursor", "replit", "codeium", "tabnine",

  // SaaS / productivity
  "notion", "figma", "airtable", "asana", "monday", "clickup", "miro",
  "canva", "loom", "grammarly", "calendly", "typeform", "webflow", "framer",
  "zapier", "make", "retool", "appsmith", "budibase", "coda", "slite",
  "clockwise", "superhuman", "front", "intercom", "zendesk", "gladly",

  // Commerce / marketplace
  "shopify", "faire", "whatnot", "poshmark", "depop", "etsy", "instacart",
  "doordash", "grubhub", "wolt", "deliveroo", "gopuff", "misfitsmarket",
  "thrivemarket", "imperfectfoods", "hellofresh", "blueapron",

  // Consumer / social
  "reddit", "discord", "pinterest", "snap", "spotify", "duolingo", "strava",
  "peloton", "calm", "headspace", "noom", "whoop", "oura", "eightsleep",

  // Travel / real estate / mobility
  "airbnb", "vrbo", "hopper", "kayak", "getaround", "turo", "lime", "bird",
  "zillow", "opendoor", "compass", "pacaso", "divvyhomes", "roofstock",

  // Healthcare / bio
  "oscarhealth", "devoted", "cedar", "zocdoc", "rohealth", "hims", "carbonhealth",
  "included", "spring", "lyra", "headway", "alma", "grow", "benchling",
  "recursion", "insitro", "tempus", "flatiron", "komodohealth",

  // Security
  "okta", "auth0", "duo", "crowdstrike", "sentinelone", "wiz", "orca",
  "lacework", "vanta", "drata", "secureframe", "onetrust", "bitwarden",
  "1password", "dashlane", "keeper", "abnormalsecurity", "material",

  // Data / analytics
  "amplitude", "mixpanel", "heap", "posthog", "segment", "rudderstack",
  "mparticle", "looker", "mode", "hex", "preset", "sigmacomputing",
  "thoughtspot", "omni", "metabase", "lightdash", "evidence",

  // Crypto
  "coinbase", "kraken", "gemini", "circle", "fireblocks", "anchorage",
  "alchemy", "quicknode", "chainalysis", "trmlabs", "uniswap", "opensea",

  // Enterprise / other
  "atlassian", "twilio", "sendgrid", "mailgun", "postmark", "resend",
  "customerio", "braze", "iterable", "klaviyo", "attentive", "hubspot",
  "gong", "chorus", "outreach", "salesloft", "apollo", "clari", "people",
  "lattice", "culture", "15five", "deel", "remote", "oysterhr", "rippling",
  "justworks", "trinet", "checkr", "greenhouse", "lever", "ashbyhq",
  "workable", "smartrecruiters", "jobvite", "hired", "angellist", "wellfound",
];

/**
 * Turn a company name into the slug forms an ATS is likely to use.
 * Cheap to generate, cheap to probe, and each miss costs one 404.
 */
export function slugCandidates(name: string): string[] {
  const base = name.trim().toLowerCase();
  const alnum = base.replace(/[^a-z0-9]/g, "");
  const dashed = base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return [...new Set([alnum, dashed, base])].filter((s) => s.length >= 2 && s.length <= 60);
}
