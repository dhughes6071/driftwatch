/**
 * Central configuration. Everything is read from the environment with safe
 * defaults, so the service runs locally with zero setup and zero cost.
 *
 * SECURITY: no secret is ever hardcoded here. Private keys are never read by
 * this process at all -- see docs/SECURITY.md. We only ever hold a *receiving*
 * address, which is public information.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

/*
 * Load .env from the PROJECT ROOT, not the current working directory.
 *
 * `import "dotenv/config"` resolves .env relative to process.cwd(). That is
 * fine when you run `npm start` from the project, but an MCP client launches
 * the server from whatever directory it happens to be in -- so the API key and
 * every other setting silently vanished. Anchoring to this file's location
 * makes the config work no matter who starts the process.
 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: resolve(PROJECT_ROOT, ".env"), quiet: true });

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined) return dflt;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function num(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export type Network = "base-sepolia" | "base";

const NETWORKS: Record<Network, { caip2: string; label: string; testnet: boolean }> = {
  "base-sepolia": { caip2: "eip155:84532", label: "Base Sepolia (testnet)", testnet: true },
  base: { caip2: "eip155:8453", label: "Base (mainnet)", testnet: false },
};

const network = (process.env.X402_NETWORK ?? "base-sepolia") as Network;
if (!NETWORKS[network]) {
  throw new Error(`X402_NETWORK must be one of: ${Object.keys(NETWORKS).join(", ")}`);
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: num(process.env.PORT, 4021),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${num(process.env.PORT, 4021)}`,

  db: {
    /*
     * Default to the user's home directory, NOT the project root.
     *
     * When installed from npm the package lives inside node_modules, and a
     * project-relative default would write the cache there -- lost on every
     * reinstall, and re-paying for every delta the LLM had already computed.
     * `~/.driftwatch/` survives upgrades and is shared across editors.
     *
     * The HTTP API sets DB_PATH explicitly in .env, so it is unaffected.
     */
    path: process.env.DB_PATH
      ? resolve(PROJECT_ROOT, process.env.DB_PATH)
      : resolve(homedir(), ".driftwatch", "driftwatch.db"),
  },

  x402: {
    /** Master switch. When false the API is entirely free -- useful for local dev. */
    enabled: bool(process.env.X402_ENABLED, false),
    network,
    caip2: NETWORKS[network].caip2,
    networkLabel: NETWORKS[network].label,
    isTestnet: NETWORKS[network].testnet,
    /**
     * PUBLIC receiving address. This is not a secret. We never hold the private
     * key for it in this process.
     */
    payTo: process.env.X402_PAY_TO ?? "",
    /** Testnet facilitator is free and requires no account. */
    facilitatorUrl:
      process.env.X402_FACILITATOR_URL ??
      (NETWORKS[network].testnet
        ? "https://x402.org/facilitator"
        : "https://api.cdp.coinbase.com/platform/v2/x402"),
    /** List on the x402 Bazaar so agents can discover us. Free. */
    discoverable: bool(process.env.X402_DISCOVERABLE, true),
    prices: {
      delta: process.env.PRICE_DELTA ?? "$0.05",
      manifest: process.env.PRICE_MANIFEST ?? "$0.15",
    },
  },

  /**
   * Optional LLM synthesis. WITHOUT a key the service still works and returns
   * deterministic evidence (release notes, semver analysis, advisories).
   * WITH a key it additionally returns synthesized migration steps.
   * This is the only component that can cost money -- see costs below.
   */
  llm: {
    enabled: bool(process.env.LLM_ENABLED, false),
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    /**
     * Default is the strongest model. Answer quality IS the product here, and
     * results are cached permanently -- we pay per version-pair exactly once,
     * ever. See docs/COSTS.md before switching to a cheaper model.
     */
    model: process.env.LLM_MODEL ?? "claude-opus-5",
    /** Hard ceiling on LLM spend per UTC day, in USD. Enforced in engine/synth.ts. */
    maxDailySpendUsd: num(process.env.LLM_MAX_DAILY_SPEND_USD, 1.0),
    maxOutputTokens: num(process.env.LLM_MAX_OUTPUT_TOKENS, 2000),
  },

  limits: {
    /** Free-tier requests per IP per hour. */
    freePerHour: num(process.env.FREE_RATE_PER_HOUR, 60),
    /** Absolute ceiling on requests per IP per hour, paid or not. Abuse brake. */
    hardPerHour: num(process.env.HARD_RATE_PER_HOUR, 600),
    /** Max packages accepted in one manifest analysis. */
    maxManifestPackages: num(process.env.MAX_MANIFEST_PACKAGES, 50),
    /** Max bytes of request body. */
    maxBodyBytes: num(process.env.MAX_BODY_BYTES, 256 * 1024),
    /** Upstream fetch timeout, ms. */
    upstreamTimeoutMs: num(process.env.UPSTREAM_TIMEOUT_MS, 10_000),
  },

  ops: {
    logLevel: process.env.LOG_LEVEL ?? "info",
    /** Emergency kill switch. When true every paid route returns 503. */
    shutdown: bool(process.env.EMERGENCY_SHUTDOWN, false),
  },
} as const;

/**
 * Startup validation. Fails loudly rather than silently misbehaving, and
 * refuses configurations that could lose money.
 */
export function validateConfig(): string[] {
  const problems: string[] = [];

  if (config.x402.enabled) {
    if (!config.x402.payTo) {
      problems.push("X402_ENABLED=true but X402_PAY_TO is empty -- payments would be unclaimable.");
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(config.x402.payTo)) {
      problems.push(`X402_PAY_TO is not a valid EVM address: ${config.x402.payTo}`);
    }
  }

  // Guardrail: mainnet must be a deliberate, explicit act.
  if (!config.x402.isTestnet && process.env.I_UNDERSTAND_THIS_IS_REAL_MONEY !== "yes") {
    problems.push(
      "Refusing to run on mainnet without I_UNDERSTAND_THIS_IS_REAL_MONEY=yes. " +
        "Mainnet means real USDC. Read docs/BEGINNER_GUIDE.md first.",
    );
  }

  if (config.llm.enabled && !config.llm.apiKey) {
    problems.push("LLM_ENABLED=true but ANTHROPIC_API_KEY is empty.");
  }

  return problems;
}
