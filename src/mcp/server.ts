/**
 * MCP server -- our distribution channel.
 *
 * STRATEGY: MCP is where the users actually are (Claude Code, Cursor, Windsurf,
 * Zed). The x402 market is tiny; MCP sessions are not. This server is useful on
 * its free tier so it spreads on merit, and it is the natural on-ramp to the
 * paid API for anyone running at volume.
 *
 * Runs over stdio and calls the same engine as the HTTP API -- no duplicated
 * logic, no separate deployment. By default it runs fully local (no network
 * calls to our own service, no payment); point it at a remote instance with
 * DRIFTWATCH_REMOTE_URL if you'd rather not run the engine locally.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { computeDelta, NotFoundError } from "../engine/delta.ts";
import { checkPackage } from "../engine/pkgcheck.ts";
import type { Ecosystem } from "../sources/registry.ts";
import type { DeltaResult, PackageCheck } from "../engine/types.ts";
import { renderDelta, renderCheck } from "./render.ts";
import { CHECK_PACKAGE_ANNOTATIONS, GET_MIGRATION_DELTA_ANNOTATIONS } from "./annotations.ts";

const REMOTE = process.env.DRIFTWATCH_REMOTE_URL?.replace(/\/+$/, "");

/*
 * Keep in step with packages/driftwatch-mcp/package.json -- a test asserts it.
 * It silently drifted to 0.1.0 while the package shipped 0.1.3, so clients
 * were told the wrong version for three releases.
 */
const server = new McpServer({ name: "driftwatch", version: "0.1.3" });

const ecosystemSchema = z
  .enum(["npm", "pypi"])
  .describe("Which package registry the package lives in.");

// ------------------------------------------------------------------ tools

server.registerTool(
  "check_package",
  {
    title: "Verify a package before installing",
    description:
      "Check whether a package actually exists and is safe to install. Returns existence, latest version, deprecation status, security advisory count, and a `suspicious` flag when the name resembles a popular package but behaves like a typosquat (no repository, placeholder version, one release). " +
      "Call this before running any install command for a package you have not verified in this session -- LLM-generated package names are a known malware vector.",
    inputSchema: {
      ecosystem: ecosystemSchema,
      name: z.string().min(1).max(214).describe("Package name exactly as it would be installed."),
    },
    annotations: CHECK_PACKAGE_ANNOTATIONS,
  },
  async ({ ecosystem, name }) => {
    const result = REMOTE
      ? await remoteGet<PackageCheck>(`/v1/check?ecosystem=${ecosystem}&name=${encodeURIComponent(name)}`)
      : await checkPackage(ecosystem as Ecosystem, name);
    return { content: [{ type: "text", text: renderCheck(result) }] };
  },
);

server.registerTool(
  "get_migration_delta",
  {
    title: "What broke between two versions",
    description:
      "Given a package and two versions, return the breaking changes between them: removed and renamed symbols, concrete before/after code fragments, and security advisories the upgrade resolves. Every claim links to a primary source. " +
      "Use this BEFORE writing or fixing code against a library version you are unsure about, and whenever a build fails after a dependency upgrade. It is far cheaper than iterating on failed builds.",
    inputSchema: {
      ecosystem: ecosystemSchema,
      name: z.string().min(1).max(214).describe("Package name."),
      from: z.string().min(1).max(64).describe("The version currently installed, e.g. 18.2.0"),
      to: z.string().min(1).max(64).describe("The version being upgraded to, e.g. 19.0.0"),
    },
    annotations: GET_MIGRATION_DELTA_ANNOTATIONS,
  },
  async ({ ecosystem, name, from, to }) => {
    try {
      const result = REMOTE
        ? await remoteGet<DeltaResult>(
            `/v1/delta?ecosystem=${ecosystem}&name=${encodeURIComponent(name)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          )
        : await computeDelta({ ecosystem: ecosystem as Ecosystem, name, from, to });
      return { content: [{ type: "text", text: renderDelta(result) }] };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Package "${name}" was not found on ${ecosystem}. It may be hallucinated or typosquatted -- run check_package before installing anything by this name.`,
            },
          ],
        };
      }
      throw err;
    }
  },
);

// ------------------------------------------------------------------ remote

async function remoteGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REMOTE}${path}`, {
    headers: { accept: "application/json", "user-agent": "driftwatch-mcp/0.1" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 402) {
    throw new Error(
      "The remote driftwatch instance requires payment (HTTP 402) and this MCP server has no wallet configured. " +
        "Unset DRIFTWATCH_REMOTE_URL to run the engine locally for free.",
    );
  }
  if (!res.ok) throw new Error(`driftwatch remote returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ boot

const transport = new StdioServerTransport();
await server.connect(transport);
// NOTE: never write to stdout here -- stdout is the MCP wire protocol.
process.stderr.write(`driftwatch MCP ready (${REMOTE ? `remote: ${REMOTE}` : "local engine"})\n`);
