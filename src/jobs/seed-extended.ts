/**
 * Extended seed list.
 *
 * Candidate company NAMES only -- `scripts/discover-companies.ts` probes each
 * against Greenhouse, Ashby, and Lever and keeps only the ones that resolve.
 * A name that misses costs one 404 and is cached in the `misses` table so it
 * is never probed again.
 *
 * Weighted toward venture-backed technology companies, because those are who
 * use these three ATSs. Household-name enterprises mostly run Workday or
 * SuccessFactors, which do not expose a public JSON job board -- adding them
 * would burn requests for nothing.
 *
 * Coverage is the product. Adding names here is the single highest-value
 * ongoing change to this codebase.
 */

export const SEED_COMPANIES_EXTENDED: string[] = [
  // ---------------------------------------------------------------- fintech
  "stripe", "adyen", "checkout", "rapyd", "airwallex", "nium", "thunes",
  "currencycloud", "payoneer", "remitly", "zepz", "worldremit", "taptap",
  "flywire", "melio", "bill", "tipalti", "routable", "settle", "resolve",
  "pipe", "capchase", "clearco", "wayflyer", "uncapped", "arc", "levelpath",
  "ledgy", "pave", "figure", "blend", "roostify", "better", "valon", "sagesure",
  "kin", "hippo", "lemonade", "root", "clearcover", "nextinsurance", "coalition",
  "atbay", "corvus", "boost", "vouch", "newfront", "sana", "gravie", "bright",
  "sidecarhealth", "policygenius", "ethos", "ladder", "bestow", "haven",
  "wealthfront", "betterment", "stash", "acorns", "public", "webull", "etoro",
  "tradingview", "alpaca", "drivewealth", "apex", "altruist", "vise", "farther",
  "facet", "origin", "monarchmoney", "copilot", "rocketmoney", "truebill",
  "brigit", "dave", "earnin", "moneylion", "varo", "current", "greenlight",
  "step", "copper", "till", "modak", "zeta", "thoughtmachine", "10x",
  "mambu", "solarisbank", "railsr", "griffin", "clearbank", "starling",
  "atom", "tandem", "zopa", "oaknorth", "allica", "shawbrook",

  // ---------------------------------------------------------------- devtools / infra
  "vercel", "netlify", "cloudflare", "fastly", "bunny", "fly", "railway",
  "render", "koyeb", "porter", "northflank", "qovery", "platformsh",
  "digitalocean", "linode", "vultr", "scaleway", "hetzner", "equinix",
  "oxide", "sidero", "talos", "rancher", "civo", "loft", "spectro",
  "kubecost", "komodor", "devtron", "argo", "codefresh", "harness", "spinnaker",
  "jenkins", "drone", "buildkite", "earthly", "depot", "namespace", "blacksmith",
  "warpbuild", "nx", "turborepo", "moonrepo", "bazel", "gradle", "jetbrains",
  "sourcegraph", "codesee", "swimm", "mintlify", "readme", "stoplight",
  "postman", "insomnia", "hoppscotch", "bruno", "speakeasy", "stainless",
  "fern", "liblab", "apideck", "merge", "nango", "paragon", "prismatic",
  "workato", "tray", "pipedream", "trigger", "inngest", "hatchet", "restate",
  "temporal", "orkes", "conductor", "camunda", "n8n", "windmill", "kestra",
  "dagster", "prefect", "astronomer", "airflow", "flyte", "union", "metaflow",

  // ---------------------------------------------------------------- data
  "snowflake", "databricks", "clickhouse", "starrocks", "firebolt", "singlestore",
  "materialize", "risingwave", "timescale", "influxdata", "questdb", "victoriametrics",
  "cockroachlabs", "yugabyte", "planetscale", "neon", "supabase", "nhost",
  "xata", "turso", "tigris", "surrealdb", "edgedb", "dgraph", "neo4j",
  "arangodb", "couchbase", "scylladb", "redpanda", "confluent", "warpstream",
  "streamnative", "decodable", "quix", "bytewax", "estuary", "upsolver",
  "dbtlabs", "sdf", "sqlmesh", "tobiko", "datafold", "montecarlodata",
  "bigeye", "anomalo", "soda", "greatexpectations", "elementary", "metaplane",
  "atlan", "collibra", "alation", "castordoc", "selectstar", "secoda",
  "fivetran", "airbyte", "stitch", "hevo", "portable", "meltano", "matillion",
  "hightouch", "census", "polytomic", "grouparoo", "rudderstack", "segment",
  "mparticle", "tealium", "amplitude", "mixpanel", "heap", "posthog", "june",
  "statsig", "eppo", "growthbook", "optimizely", "launchdarkly", "split",
  "flagsmith", "unleash", "configcat", "hex", "deepnote", "mode", "count",
  "omni", "sigmacomputing", "thoughtspot", "lightdash", "evidence", "preset",
  "metabase", "holistics", "gooddata", "zing", "explo", "cube",

  // ---------------------------------------------------------------- AI / ML
  "anthropic", "openai", "cohere", "ai21", "aleph", "mistral", "huggingface",
  "stability", "midjourney", "runwayml", "pika", "luma", "synthesia", "heygen",
  "descript", "elevenlabs", "resemble", "playht", "cartesia", "suno", "udio",
  "assemblyai", "deepgram", "speechmatics", "rev", "gladia", "fireworksai",
  "together", "anyscale", "modal", "replicate", "baseten", "banana", "beam",
  "runpod", "lambdalabs", "coreweave", "crusoe", "voltagepark", "sfcompute",
  "groq", "cerebras", "sambanova", "tenstorrent", "etched", "positron",
  "scaleai", "surgehq", "labelbox", "snorkel", "cleanlab", "encord", "v7",
  "roboflow", "voxel51", "lightly", "activeloop", "weightsandbiases", "cometml",
  "neptune", "arize", "whylabs", "fiddler", "truera", "galileo", "braintrust",
  "langfuse", "langsmith", "humanloop", "vellum", "promptlayer", "helicone",
  "portkey", "openrouter", "requesty", "martian", "notdiamond", "unify",
  "pinecone", "weaviate", "qdrant", "milvus", "zilliz", "chroma", "lancedb",
  "marqo", "vespa", "turbopuffer", "llamaindex", "langchain", "haystack",
  "crewai", "autogen", "dust", "sierra", "decagon", "parloa", "cresta",
  "observeai", "level", "regie", "jasper", "copyai", "writer", "typeface",
  "tome", "gamma", "beautiful", "cursor", "codeium", "tabnine", "sourcery",
  "cognition", "magic", "poolside", "augment", "supermaven", "zed", "warp",

  // ---------------------------------------------------------------- security
  "wiz", "orca", "lacework", "sysdig", "aquasec", "snyk", "socket", "endor",
  "semgrep", "chainguard", "sigstore", "phylum", "stepsecurity", "ox",
  "cycode", "legitsecurity", "arnica", "jit", "nullify", "corgea",
  "crowdstrike", "sentinelone", "huntress", "arcticwolf", "expel", "redcanary",
  "dragos", "claroty", "armis", "nozomi", "abnormalsecurity", "material",
  "sublime", "valimail", "proofpoint", "mimecast", "vanta", "drata",
  "secureframe", "sprinto", "thoropass", "scrut", "onetrust", "transcend",
  "ketch", "osano", "didomi", "okta", "auth0", "workos", "stytch", "clerk",
  "descope", "frontegg", "propelauth", "kinde", "supertokens", "ory",
  "keycloak", "beyondidentity", "hypr", "yubico", "1password", "bitwarden",
  "dashlane", "keeper", "delinea", "cyberark", "britive", "entro", "astrix",
  "teleport", "strongdm", "tailscale", "twingate", "netbird", "zscaler",
  "netskope", "cato", "perimeter81", "cloudflare", "censys", "shodan",
  "runzero", "axonius", "jupiterone", "panther", "matano", "hunters",

  // ---------------------------------------------------------------- SaaS / productivity
  "notion", "coda", "airtable", "smartsheet", "monday", "asana", "clickup",
  "wrike", "basecamp", "height", "shortcut", "linear", "productboard",
  "aha", "roadmunk", "dovetail", "maze", "userinterviews", "sprig",
  "fullstory", "hotjar", "contentsquare", "quantummetric", "glassbox",
  "logrocket", "smartlook", "mouseflow", "figma", "sketch", "framer",
  "webflow", "wix", "squarespace", "duda", "unbounce", "instapage",
  "canva", "picsart", "photoroom", "removebg", "kittl", "recraft",
  "loom", "vimeo", "wistia", "mux", "cloudinary", "imgix", "uploadcare",
  "filestack", "transloadit", "bannerbear", "placid", "abyssale",
  "miro", "mural", "figjam", "whimsical", "excalidraw", "tldraw", "eraser",
  "lucid", "creately", "gliffy", "grammarly", "wordtune", "quillbot",
  "calendly", "cal", "savvycal", "chilipiper", "reclaim", "clockwise",
  "motion", "sunsama", "amie", "vimcal", "superhuman", "shortwave",
  "hey", "missive", "front", "intercom", "zendesk", "gladly", "kustomer",
  "gorgias", "helpscout", "freshworks", "crisp", "chatwoot", "plain",
  "pylon", "unthread", "typeform", "tally", "fillout", "formstack", "jotform",
  "surveymonkey", "qualtrics", "alchemer", "docusign", "dropboxsign",
  "pandadoc", "proposify", "qwilr", "juro", "ironclad", "lexion", "spellbook",
  "harvey", "evenup", "eve", "clio", "smokeball", "filevine",

  // ---------------------------------------------------------------- commerce
  "shopify", "bigcommerce", "commercetools", "vtex", "swell", "medusa",
  "saleor", "shopware", "spryker", "fabric", "nacelle", "shogun",
  "faire", "ankorstore", "abound", "mable", "creoate", "whatnot",
  "poshmark", "depop", "vinted", "grailed", "stockx", "goat", "rebag",
  "thredup", "therealreal", "vestiaire", "mercari", "offerup", "wallapop",
  "instacart", "shipt", "gopuff", "getir", "gorillas", "flink", "zapp",
  "doordash", "ubereats", "grubhub", "wolt", "deliveroo", "justeat",
  "toast", "square", "lightspeed", "revel", "shift4", "clover", "slicelife",
  "olo", "chowly", "otter", "deliverect", "flipdish", "tattle",
  "recharge", "bold", "yotpo", "okendo", "stamped", "loox", "junip",
  "klaviyo", "attentive", "postscript", "emotive", "wunderkind",
  "gorgias", "rebuy", "nosto", "dynamicyield", "bloomreach", "constructor",
  "algolia", "typesense", "meilisearch", "elastic", "coveo", "lucidworks",
  "narvar", "aftership", "shippo", "easypost", "shipbob", "shipmonk",
  "stord", "flexport", "project44", "fourkites", "shipium", "parcellab",

  // ---------------------------------------------------------------- health / bio
  "benchling", "dotmatics", "scispot", "labguru", "genemod", "riffyn",
  "recursion", "insitro", "generate", "isomorphic", "cradle", "chai",
  "tempus", "foundationmedicine", "guardanthealth", "grail", "freenome",
  "exactsciences", "natera", "invitae", "color", "23andme", "helix",
  "veeva", "iqvia", "medidata", "florencehc", "reify", "paradigm",
  "science37", "curebase", "lightship", "thread", "medable", "castoredc",
  "komodohealth", "truveta", "verana", "aetion", "flatiron", "ontada",
  "zocdoc", "healthgrades", "sesame", "carbonhealth", "forwardhealth",
  "onemedical", "parsleyhealth", "hims", "roman", "curology", "nurx",
  "maven", "carrot", "progyny", "kindbody", "tia", "midi", "evernow",
  "spring", "lyra", "headway", "alma", "grow", "talkspace", "betterhelp",
  "calm", "headspace", "wysa", "woebot", "bighealth", "sleepio",
  "hinge", "swordhealth", "kaia", "omada", "virtahealth", "vida", "noom",
  "levels", "signos", "nutrisense", "whoop", "oura", "eightsleep", "eight",

  // ---------------------------------------------------------------- climate / energy
  "watershed", "persefoni", "sweep", "plana", "greenly", "normative",
  "sinai", "emitwise", "carbonchain", "climatiq", "cozero", "coolset",
  "patch", "cloverly", "climeworks", "charmindustrial", "heirloom",
  "running", "twelve", "lanzatech", "solugen", "sila", "redwoodmaterials",
  "li", "form", "ess", "malta", "antora", "rondo", "electrichydrogen",
  "octopus", "arcadia", "davidenergy", "voltus", "leap", "gridpoint",
  "camus", "utilidata", "sense", "span", "lunar", "enode", "wattbuy",
  "aurorasolar", "enact", "omnidian", "palmetto", "energysage", "solarapp",

  // ---------------------------------------------------------------- HR / recruiting
  "rippling", "deel", "remote", "oysterhr", "velocityglobal", "globalization",
  "papayaglobal", "multiplier", "skuad", "playroll", "atlashxm",
  "gusto", "justworks", "trinet", "paylocity", "paycom", "namely",
  "hibob", "personio", "factorial", "humaans", "charliehr", "sesamehr",
  "lattice", "culture", "15five", "leapsome", "peakon", "workhuman",
  "bonusly", "nectar", "assembly", "kudos", "guusto", "awardco",
  "greenhouse", "lever", "ashbyhq", "workable", "smartrecruiters", "teamtailor",
  "pinpoint", "recruitee", "jobvite", "icims", "jazzhr", "breezyhr",
  "gem", "sourcewhale", "hiretual", "seekout", "juicebox", "consider",
  "metaview", "brighthire", "hireflix", "willo", "spark", "karat",
  "codesignal", "hackerrank", "coderpad", "codility", "woven", "otta",
  "welcometothejungle", "himalayas", "remotive", "workatastartup",

  // ---------------------------------------------------------------- media / consumer
  "spotify", "soundcloud", "bandcamp", "audius", "patreon", "substack",
  "ghost", "beehiiv", "convertkit", "kit", "buttondown", "curated",
  "medium", "hashnode", "devto", "mirror", "paragraph", "lens",
  "discord", "slack", "twist", "spike", "quill", "zulip", "matrix",
  "element", "signal", "telegram", "wire", "threema", "session",
  "duolingo", "babbel", "busuu", "memrise", "lingoda", "preply",
  "italki", "cambly", "outschool", "brilliant", "coursera", "udemy",
  "masterclass", "skillshare", "codecademy", "datacamp", "educative",
  "pluralsight", "oreilly", "frontendmasters", "scrimba", "boot",
  "strava", "peloton", "tonal", "tempo", "hydrow", "ergatta", "future",
  "ladder", "caliber", "fitbod", "trainheroic", "whoop", "athletic",

  // ---------------------------------------------------------------- travel / property
  "airbnb", "vrbo", "vacasa", "sonder", "placemakr", "landing", "blueground",
  "kasa", "mint", "hopper", "kayak", "skyscanner", "omio", "trainline",
  "getyourguide", "klook", "viator", "tiqets", "headout", "fever",
  "mews", "cloudbeds", "apaleo", "sihot", "lighthouse", "duetto",
  "sertifi", "canary", "akia", "whistle", "alice", "hotelchamp",
  "opendoor", "offerpad", "orchard", "homeward", "flyhomes", "ribbon",
  "divvyhomes", "landis", "pacaso", "arrived", "fundrise", "roofstock",
  "doorloop", "buildium", "appfolio", "yardi", "entrata", "realpage",
  "latchable", "smartrent", "brivo", "openpath", "kastle", "verkada",

  // ---------------------------------------------------------------- logistics / mobility
  "flexport", "convoy", "transfix", "loadsmart", "uber", "lyft", "bolt",
  "grab", "gojek", "careem", "didi", "cabify", "freenow", "via",
  "turo", "getaround", "zipcar", "kyte", "lime", "bird", "tier", "voi",
  "dott", "cowboy", "vanmoof", "rad", "specialized", "zoox", "waymo",
  "cruise", "aurora", "kodiak", "gatik", "nuro", "serve", "starship",
  "zipline", "wing", "matternet", "skydio", "shield", "anduril", "saronic",
];
