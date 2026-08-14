/**
 * HTTP API + x402 payment layer.
 *
 * Route map:
 *   GET  /health                 free  -- liveness
 *   GET  /                       free  -- service description for humans and agents
 *   GET  /openapi.json           free  -- machine-readable API spec
 *   GET  /.well-known/x402       free  -- payment discovery metadata
 *   GET  /llms.txt               free  -- agent-readable summary
 *   GET  /v1/check               free  -- package existence / trust (loss leader)
 *   GET  /v1/delta               PAID  -- the product
 *   POST /v1/manifest            PAID  -- whole-manifest analysis
 *   GET  /admin/stats            local -- revenue and cost ledger
 *
 * SECURITY: this process never holds a private key. It holds a receiving
 * ADDRESS only. Settlement is performed by the facilitator. See docs/SECURITY.md.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

import { config, validateConfig } from "../lib/config.ts";
import { log, clientKey } from "../lib/log.ts";
import { countRecent, noteRequest, recordRequest, revenueSummary } from "../lib/db.ts";
import { computeDelta, BadRequestError, NotFoundError } from "../engine/delta.ts";
import { checkPackage } from "../engine/pkgcheck.ts";
import type { Ecosystem } from "../sources/registry.ts";
import { buildOpenApi } from "./openapi.ts";

const problems = validateConfig();
if (problems.length) {
  for (const p of problems) log.error("config error", { problem: p });
  process.exit(1);
}

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: config.limits.maxBodyBytes }));

// ------------------------------------------------------------------ guards

/** Emergency kill switch. Flip EMERGENCY_SHUTDOWN=true and restart. */
app.use((req, res, next) => {
  if (config.ops.shutdown && req.path.startsWith("/v1/")) {
    res.status(503).json({ error: "service_paused", message: "Temporarily paused by the operator." });
    return;
  }
  next();
});

/**
 * Rate limiting. Two tiers: a free-tier ceiling, and an absolute hard ceiling
 * that applies even to paying callers. The hard ceiling is an abuse brake --
 * a paying client should never be able to run our upstream quotas dry.
 */
app.use((req, res, next) => {
  if (!req.path.startsWith("/v1/")) return next();

  const key = clientKey(req.ip);
  const recent = countRecent(key);

  if (recent >= config.limits.hardPerHour) {
    res.status(429).json({
      error: "rate_limited",
      message: `Hard limit of ${config.limits.hardPerHour} requests/hour reached.`,
      retryAfterSeconds: 3600,
    });
    return;
  }
  if (!config.x402.enabled && recent >= config.limits.freePerHour) {
    res.status(429).json({
      error: "rate_limited",
      message: `Free tier allows ${config.limits.freePerHour} requests/hour.`,
      retryAfterSeconds: 3600,
    });
    return;
  }

  noteRequest(key);
  (req as Request & { clientKey?: string }).clientKey = key;
  next();
});

// ------------------------------------------------------------------ x402

const PRICE_DELTA = config.x402.prices.delta;
const PRICE_MANIFEST = config.x402.prices.manifest;

if (config.x402.enabled) {
  const facilitator = new HTTPFacilitatorClient({ url: config.x402.facilitatorUrl });
  const server = new x402ResourceServer(facilitator).register(config.x402.caip2, new ExactEvmScheme());

  const discovery = config.x402.discoverable;

  app.use(
    paymentMiddleware(
      {
        "GET /v1/delta": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE_DELTA,
              network: config.x402.caip2,
              payTo: config.x402.payTo,
            },
          ],
          description:
            "Dependency migration intelligence: given a package and two versions, returns cited breaking changes, renamed/removed symbols, required code edits, and security advisories. Saves a coding agent the failed build-fix loop.",
          mimeType: "application/json",
          ...(discovery
            ? {
                extensions: {
                  ...declareDiscoveryExtension({
                    input: { ecosystem: "npm", name: "react", from: "18.2.0", to: "19.0.0" },
                    inputSchema: {
                      properties: {
                        ecosystem: { type: "string", enum: ["npm", "pypi"], description: "Package registry" },
                        name: { type: "string", description: "Package name" },
                        from: { type: "string", description: "Current version" },
                        to: { type: "string", description: "Target version" },
                      },
                      required: ["ecosystem", "name", "from", "to"],
                    },
                  }),
                },
              }
            : {}),
        },
        "POST /v1/manifest": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE_MANIFEST,
              network: config.x402.caip2,
              payTo: config.x402.payTo,
            },
          ],
          description:
            "Analyze an entire dependency manifest at once. Returns per-package breaking changes and advisories for a batch of upgrades.",
          mimeType: "application/json",
        },
      },
      server,
    ),
  );

  log.info("x402 enabled", {
    network: config.x402.networkLabel,
    facilitator: config.x402.facilitatorUrl,
    payTo: config.x402.payTo,
    discoverable: discovery,
    prices: { delta: PRICE_DELTA, manifest: PRICE_MANIFEST },
  });
} else {
  log.warn("x402 DISABLED -- all endpoints are free (local development mode)");
}

// ------------------------------------------------------------------ free routes

app.get("/health", (_req, res) => {
  res.json({
    status: config.ops.shutdown ? "paused" : "ok",
    version: "0.1.0",
    x402: config.x402.enabled ? config.x402.networkLabel : "disabled",
    llm: config.llm.enabled ? config.llm.model : "disabled (deterministic tier only)",
    time: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "driftwatch",
    tagline: "This library went from version A to B. What broke, and what edits does my code need?",
    why: "A coding agent that guesses at a changed API burns roughly 6 failed build-fix iterations. One call replaces that.",
    endpoints: {
      "GET /v1/check": { price: "free", params: ["ecosystem", "name"] },
      "GET /v1/delta": { price: PRICE_DELTA, params: ["ecosystem", "name", "from", "to"] },
      "POST /v1/manifest": { price: PRICE_MANIFEST, body: "{ ecosystem, packages: [{name, from, to}] }" },
    },
    ecosystems: ["npm", "pypi"],
    payment: config.x402.enabled
      ? { protocol: "x402", network: config.x402.networkLabel, asset: "USDC" }
      : { protocol: "none", note: "development mode -- free" },
    openapi: `${config.publicUrl}/openapi.json`,
    docs: `${config.publicUrl}/llms.txt`,
  });
});

app.get("/openapi.json", (_req, res) => res.json(buildOpenApi()));

app.get("/.well-known/x402", (_req, res) => {
  res.json({
    x402Version: 2,
    enabled: config.x402.enabled,
    network: config.x402.caip2,
    networkLabel: config.x402.networkLabel,
    asset: "USDC",
    payTo: config.x402.payTo || null,
    facilitator: config.x402.facilitatorUrl,
    resources: [
      { path: "/v1/delta", method: "GET", price: PRICE_DELTA },
      { path: "/v1/manifest", method: "POST", price: PRICE_MANIFEST },
    ],
  });
});

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# driftwatch

Dependency migration intelligence for coding agents.

## What it answers
"Library X moved from version A to version B -- what broke, and what edits does my code need?"

Returns structured, cited breaking changes: removed and renamed symbols, concrete
before/after code fragments, and security advisories the upgrade resolves. Every
claim links to a primary source (release note, advisory, or registry record).

## Why call it
An agent that guesses at an API changed after its training cutoff typically burns
~6 failed build-fix iterations before converging. One call replaces that loop.

## Endpoints
GET  ${config.publicUrl}/v1/check?ecosystem=npm&name=<pkg>            free
     Does this package exist? Is it deprecated, advisory-flagged, or a
     likely hallucination/typosquat? Call before any install.

GET  ${config.publicUrl}/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0   ${PRICE_DELTA}
     The migration answer.

POST ${config.publicUrl}/v1/manifest                                  ${PRICE_MANIFEST}
     Body: { "ecosystem": "npm", "packages": [{"name":"react","from":"18.2.0","to":"19.0.0"}] }

## Ecosystems
npm, pypi

## Payment
${config.x402.enabled ? `x402 (HTTP 402) on ${config.x402.networkLabel}, settled in USDC. No account required.` : "Free (development mode)."}

## Data sources
npm registry, PyPI, GitHub Releases, OSV.dev. All public. No licensed data is
resold. Output is facts plus short citations, never wholesale documentation.

## Machine-readable spec
${config.publicUrl}/openapi.json
`);
});

// ------------------------------------------------------------------ v1 routes

const ECOSYSTEMS: Ecosystem[] = ["npm", "pypi"];

app.get("/v1/check", async (req, res, next) => {
  const started = Date.now();
  try {
    const ecosystem = parseEcosystem(req.query.ecosystem);
    const name = parseName(req.query.name);
    const result = await checkPackage(ecosystem, name);
    res.json(result);
    recordRequest({
      route: "/v1/check",
      status: 200,
      durationMs: Date.now() - started,
      clientKey: (req as Request & { clientKey?: string }).clientKey,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/v1/delta", async (req, res, next) => {
  const started = Date.now();
  try {
    const ecosystem = parseEcosystem(req.query.ecosystem);
    const name = parseName(req.query.name);
    const from = parseVersion(req.query.from, "from");
    const to = parseVersion(req.query.to, "to");

    const result = await computeDelta({ ecosystem, name, from, to });
    res.json(result);

    recordRequest({
      route: "/v1/delta",
      status: 200,
      paid: config.x402.enabled,
      priceUsd: config.x402.enabled ? priceToUsd(PRICE_DELTA) : 0,
      payer: paymentPayer(req),
      cacheHit: result.meta.cacheHit,
      costUsd: result.meta.computeCostUsd,
      durationMs: Date.now() - started,
      clientKey: (req as Request & { clientKey?: string }).clientKey,
    });
  } catch (err) {
    next(err);
  }
});

app.post("/v1/manifest", async (req, res, next) => {
  const started = Date.now();
  try {
    const body = req.body as { ecosystem?: unknown; packages?: unknown };
    const ecosystem = parseEcosystem(body.ecosystem);

    if (!Array.isArray(body.packages) || body.packages.length === 0) {
      throw new BadRequestError("`packages` must be a non-empty array.");
    }
    if (body.packages.length > config.limits.maxManifestPackages) {
      throw new BadRequestError(
        `At most ${config.limits.maxManifestPackages} packages per request; got ${body.packages.length}.`,
      );
    }

    const entries = body.packages.map((p: unknown, i: number) => {
      const o = p as { name?: unknown; from?: unknown; to?: unknown };
      if (typeof o?.name !== "string" || typeof o?.from !== "string" || typeof o?.to !== "string") {
        throw new BadRequestError(`packages[${i}] needs string name, from, and to.`);
      }
      return { name: o.name, from: o.from, to: o.to };
    });

    // Bounded concurrency: be a polite upstream citizen.
    const results = [];
    for (let i = 0; i < entries.length; i += 4) {
      const batch = entries.slice(i, i + 4);
      results.push(
        ...(await Promise.all(
          batch.map(async (e) => {
            try {
              return await computeDelta({ ecosystem, name: e.name, from: e.from, to: e.to });
            } catch (err) {
              return {
                ecosystem,
                package: e.name,
                from: e.from,
                to: e.to,
                error: err instanceof NotFoundError ? "not_found" : "failed",
                message: String(err instanceof Error ? err.message : err),
              };
            }
          }),
        )),
      );
    }

    const cost = results.reduce(
      (sum, r) => sum + ("meta" in r ? (r as { meta: { computeCostUsd: number } }).meta.computeCostUsd : 0),
      0,
    );

    res.json({ schemaVersion: 1, ecosystem, count: results.length, results });

    recordRequest({
      route: "/v1/manifest",
      status: 200,
      paid: config.x402.enabled,
      priceUsd: config.x402.enabled ? priceToUsd(PRICE_MANIFEST) : 0,
      payer: paymentPayer(req),
      costUsd: cost,
      durationMs: Date.now() - started,
      clientKey: (req as Request & { clientKey?: string }).clientKey,
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ admin

/**
 * Revenue and cost ledger. Bound to localhost only -- never expose this.
 * If you need it remotely, tunnel over SSH rather than opening a port.
 */
app.get("/admin/stats", (req, res) => {
  const ip = req.ip ?? "";
  if (!/^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(ip)) {
    res.status(403).json({ error: "forbidden", message: "Admin endpoints are localhost-only." });
    return;
  }
  const day = 86_400_000;
  res.json({
    last24h: revenueSummary(Date.now() - day),
    last7d: revenueSummary(Date.now() - 7 * day),
    last30d: revenueSummary(Date.now() - 30 * day),
    allTime: revenueSummary(0),
  });
});

// ------------------------------------------------------------------ errors

app.use((_req, res) => {
  res.status(404).json({ error: "not_found", message: "No such endpoint. See GET / for the route list." });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: "bad_request", message: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    // A genuinely useful answer: the package does not exist.
    res.status(404).json({
      error: "package_not_found",
      message: err.message,
      hint: "Verify the name with GET /v1/check before installing -- it may be a hallucinated or typosquatted package.",
    });
    return;
  }
  log.error("unhandled error", { err: String(err) });
  res.status(500).json({ error: "internal_error", message: "Something went wrong on our side." });
});

// ------------------------------------------------------------------ helpers

function parseEcosystem(v: unknown): Ecosystem {
  const s = String(v ?? "").toLowerCase();
  if (!ECOSYSTEMS.includes(s as Ecosystem)) {
    throw new BadRequestError(`\`ecosystem\` must be one of: ${ECOSYSTEMS.join(", ")}`);
  }
  return s as Ecosystem;
}

function parseName(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) throw new BadRequestError("`name` is required.");
  if (s.length > 214) throw new BadRequestError("`name` is too long.");

  // Registry-legal characters only. Blocks header injection and control chars.
  // `/` has to stay permitted for npm scoped packages (@scope/name).
  if (!/^[@a-zA-Z0-9._\/-]+$/.test(s)) throw new BadRequestError("`name` contains invalid characters.");

  // Since `/` and `.` are allowed above, reject traversal shapes explicitly.
  // URL-encoding already neutralises these downstream, but rejecting at the
  // boundary is clearer and does not rely on an encoder staying correct.
  if (s.includes("..") || s.startsWith("/") || s.startsWith(".")) {
    throw new BadRequestError("`name` is not a valid package name.");
  }
  // At most one `/`, and only for a leading @scope.
  const slashes = (s.match(/\//g) ?? []).length;
  if (slashes > 1 || (slashes === 1 && !s.startsWith("@"))) {
    throw new BadRequestError("`name` is not a valid package name.");
  }
  return s;
}

function parseVersion(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!s) throw new BadRequestError(`\`${field}\` is required.`);
  if (s.length > 64) throw new BadRequestError(`\`${field}\` is too long.`);
  if (!/^[0-9A-Za-z.+_-]+$/.test(s)) throw new BadRequestError(`\`${field}\` is not a valid version string.`);
  return s;
}

/** "$0.05" -> 0.05 */
function priceToUsd(price: string): number {
  const n = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** The facilitator records the payer; surface it for the ledger when present. */
function paymentPayer(req: Request): string | null {
  const p = (req as Request & { x402?: { payer?: string } }).x402?.payer;
  return typeof p === "string" ? p : null;
}

// ------------------------------------------------------------------ boot

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain || process.env.START_SERVER === "1") {
  app.listen(config.port, () => {
    log.info("driftwatch listening", {
      url: config.publicUrl,
      port: config.port,
      x402: config.x402.enabled ? config.x402.networkLabel : "disabled",
      llm: config.llm.enabled ? config.llm.model : "disabled",
    });
  });
}
