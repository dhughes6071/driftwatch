/**
 * OpenAPI 3.1 spec, generated from config so prices and URLs never drift.
 *
 * This is a discovery mechanism, not documentation for humans. Agent frameworks
 * (LangChain, tool-calling loops, MCP bridges) ingest OpenAPI directly, so a
 * correct spec is how a machine decides whether to call us.
 */
import { config } from "../lib/config.ts";

export function buildOpenApi() {
  const paid = config.x402.enabled;
  const payNote = paid
    ? ` Requires x402 payment (${config.x402.networkLabel}, USDC). An unpaid request returns HTTP 402 with payment requirements.`
    : " Currently free (development mode).";

  return {
    openapi: "3.1.0",
    info: {
      title: "driftwatch",
      version: "0.1.0",
      description:
        "Dependency migration intelligence for AI coding agents. Answers: this library moved from version A to B -- what broke, and what edits does my code need? Every claim cites a primary source.",
      contact: { url: config.publicUrl },
    },
    servers: [{ url: config.publicUrl }],
    paths: {
      "/v1/check": {
        get: {
          operationId: "checkPackage",
          summary: "Verify a package exists and is safe to install",
          description:
            "Free. Returns existence, latest version, deprecation, advisory count, and a `suspicious` flag when the name does not exist but closely resembles a popular package (the slopsquatting signal). Call this before running any install command.",
          parameters: [ecosystemParam(), nameParam()],
          responses: {
            "200": jsonResponse("Package check result", "#/components/schemas/PackageCheck"),
            "400": errorResponse("Invalid parameters"),
            "429": errorResponse("Rate limited"),
          },
        },
      },
      "/v1/delta": {
        get: {
          operationId: "getMigrationDelta",
          summary: "Get breaking changes between two versions of a package",
          description:
            "Returns cited breaking changes, removed/renamed symbols, concrete before/after code fragments, and security advisories resolved by the upgrade." +
            payNote,
          parameters: [
            ecosystemParam(),
            nameParam(),
            {
              name: "from",
              in: "query",
              required: true,
              schema: { type: "string", examples: ["18.2.0"] },
              description: "The version currently installed.",
            },
            {
              name: "to",
              in: "query",
              required: true,
              schema: { type: "string", examples: ["19.0.0"] },
              description: "The version being upgraded to.",
            },
          ],
          responses: {
            "200": jsonResponse("Migration delta", "#/components/schemas/DeltaResult"),
            "400": errorResponse("Invalid parameters"),
            "402": errorResponse("Payment required -- body carries x402 payment requirements"),
            "404": errorResponse("Package not found (it may be hallucinated)"),
            "429": errorResponse("Rate limited"),
          },
        },
      },
      "/v1/manifest": {
        post: {
          operationId: "analyzeManifest",
          summary: "Analyze a batch of package upgrades in one call",
          description: "Same analysis as /v1/delta, applied across a whole dependency manifest." + payNote,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ecosystem", "packages"],
                  properties: {
                    ecosystem: { type: "string", enum: ["npm", "pypi"] },
                    packages: {
                      type: "array",
                      maxItems: config.limits.maxManifestPackages,
                      items: {
                        type: "object",
                        required: ["name", "from", "to"],
                        properties: {
                          name: { type: "string" },
                          from: { type: "string" },
                          to: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("Per-package results", "#/components/schemas/ManifestResult"),
            "400": errorResponse("Invalid body"),
            "402": errorResponse("Payment required"),
            "429": errorResponse("Rate limited"),
          },
        },
      },
      "/health": {
        get: {
          operationId: "health",
          summary: "Liveness and configuration check",
          responses: { "200": jsonResponse("Service status") },
        },
      },
    },
    components: {
      schemas: {
        Citation: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["release-note", "advisory", "registry", "repo"] },
            url: { type: "string", format: "uri" },
            label: { type: "string" },
          },
        },
        BreakingChange: {
          type: "object",
          properties: {
            summary: { type: "string", description: "One line: what broke." },
            version: { type: "string", description: "Version this landed in." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            symbols: {
              type: "array",
              items: { type: "string" },
              description: "Identifiers removed, renamed, or moved -- what to grep for.",
            },
            migration: {
              type: "object",
              properties: {
                before: { type: "string" },
                after: { type: "string" },
                note: { type: "string" },
              },
            },
            citations: { type: "array", items: { $ref: "#/components/schemas/Citation" } },
          },
        },
        DeltaResult: {
          type: "object",
          properties: {
            schemaVersion: { type: "integer", const: 1 },
            ecosystem: { type: "string" },
            package: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            jump: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["major", "minor", "patch", "downgrade", "same", "unknown"] },
                majorsCrossed: { type: "integer" },
                releasesInRange: { type: "integer" },
              },
            },
            tier: {
              type: "string",
              enum: ["evidence", "synthesized"],
              description: "`evidence` = deterministic extraction only. `synthesized` = additionally structured by an LLM.",
            },
            breakingChanges: { type: "array", items: { $ref: "#/components/schemas/BreakingChange" } },
            advisories: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  summary: { type: "string" },
                  severity: { type: "string" },
                  url: { type: "string", format: "uri" },
                  fixedByUpgrade: { type: "boolean" },
                },
              },
            },
            deprecated: { type: ["string", "null"] },
            citations: { type: "array", items: { $ref: "#/components/schemas/Citation" } },
            meta: {
              type: "object",
              properties: {
                computedAt: { type: "string", format: "date-time" },
                cacheHit: { type: "boolean" },
                warnings: { type: "array", items: { type: "string" } },
                computeCostUsd: { type: "number" },
              },
            },
          },
        },
        PackageCheck: {
          type: "object",
          properties: {
            schemaVersion: { type: "integer", const: 1 },
            ecosystem: { type: "string" },
            name: { type: "string" },
            exists: { type: "boolean" },
            didYouMean: { type: "array", items: { type: "string" } },
            latest: { type: ["string", "null"] },
            deprecated: { type: ["string", "null"] },
            repository: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            advisoryCount: { type: "integer" },
            suspicious: {
              type: "boolean",
              description: "True when the name does not exist but closely resembles a popular package. Do not install.",
            },
          },
        },
        ManifestResult: {
          type: "object",
          properties: {
            schemaVersion: { type: "integer", const: 1 },
            ecosystem: { type: "string" },
            count: { type: "integer" },
            results: { type: "array", items: { $ref: "#/components/schemas/DeltaResult" } },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" }, message: { type: "string" } },
        },
      },
    },
  };
}

function ecosystemParam() {
  return {
    name: "ecosystem",
    in: "query" as const,
    required: true,
    schema: { type: "string", enum: ["npm", "pypi"] },
    description: "Which package registry.",
  };
}

function nameParam() {
  return {
    name: "name",
    in: "query" as const,
    required: true,
    schema: { type: "string", examples: ["react"] },
    description: "Package name as published.",
  };
}

function jsonResponse(description: string, ref?: string) {
  return {
    description,
    content: { "application/json": ref ? { schema: { $ref: ref } } : { schema: { type: "object" } } },
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}
