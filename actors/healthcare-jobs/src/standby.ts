/**
 * Standby mode: the Actor stays warm as a small web server, so a search is one
 * HTTP request answered in seconds instead of a full run.
 *
 *   GET  <standby url>/?titleKeywords=nurse,rn&locationKeywords=TX&maxJobs=50
 *   POST <standby url>/   with the same input as a normal run, as JSON
 *
 * The answer is JSON. Array fields take comma-separated values in a GET.
 * Kept free of the Apify SDK (the caller passes the handler) so it is testable.
 * Shared with actors/healthcare-jobs (keep the two copies identical).
 */
import { createServer, type IncomingMessage, type Server } from "node:http";

export type FieldKind = "array" | "boolean" | "integer" | "string";

/** Field kinds from an input schema's `properties`. */
export function fieldKinds(properties: Record<string, { type?: string }>): Record<string, FieldKind> {
  const out: Record<string, FieldKind> = {};
  for (const [k, p] of Object.entries(properties)) {
    out[k] = p.type === "array" ? "array" : p.type === "boolean" ? "boolean" : p.type === "integer" || p.type === "number" ? "integer" : "string";
  }
  return out;
}

/** Allowed values of enum fields (single or array), from an input schema's `properties`. */
export function fieldEnums(properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, p] of Object.entries(properties)) {
    const e = p.enum ?? p.items?.enum;
    if (e) out[k] = e;
  }
  return out;
}

export class BadRequest extends Error {}

/** A value outside a field's choices would match nothing, silently; refuse it with the choices instead. */
export function checkEnums(input: Record<string, unknown>, enums: Record<string, string[]>): void {
  for (const [k, allowed] of Object.entries(enums)) {
    const v = input[k];
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) {
      if (!allowed.includes(x as string)) throw new BadRequest(`"${k}" has no value "${x}". Choose from: ${allowed.join(", ")}`);
    }
  }
}

/** Query string -> Actor input. Unknown parameters are refused so a typo is not silently ignored. */
export function inputFromParams(params: URLSearchParams, kinds: Record<string, FieldKind>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [k, raw] of params) {
    const kind = kinds[k];
    if (!kind) throw new BadRequest(`Unknown parameter "${k}". Known: ${Object.keys(kinds).join(", ")}`);
    const v = raw.trim();
    if (kind === "array") input[k] = [...((input[k] as string[]) ?? []), ...v.split(",").map((s) => s.trim()).filter(Boolean)];
    else if (kind === "boolean") {
      if (!/^(true|false|1|0)$/i.test(v)) throw new BadRequest(`"${k}" must be true or false`);
      input[k] = /^(true|1)$/i.test(v);
    } else if (kind === "integer") {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new BadRequest(`"${k}" must be a number`);
      input[k] = n;
    } else input[k] = v;
  }
  return input;
}

async function readBody(req: IncomingMessage, limit = 100_000): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new BadRequest("Request body too large");
  }
  return body;
}

export type Handler = (input: Record<string, unknown>) => Promise<unknown>;

/** Start the server. `handler` returns the JSON answer; BadRequest errors become HTTP 400. */
export function serveStandby(port: number, kinds: Record<string, FieldKind>, enums: Record<string, string[]>, handler: Handler, logError: (m: string) => void): Server {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    // The platform's readiness probe: answer at once, before any work.
    if (req.headers["x-apify-container-server-readiness-probe"]) return send(200, { ready: true });
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let input: Record<string, unknown>;
      if (req.method === "GET") {
        // A bare GET / (a browser, a health check) gets a usage note, not a charged search of everything.
        if (![...url.searchParams.keys()].length) {
          return send(200, { usage: "GET /?titleKeywords=nurse,rn&locationKeywords=TX&maxJobs=50, or POST / with the Actor's input as JSON. Array fields are comma-separated in a GET.", parameters: Object.keys(kinds) });
        }
        input = inputFromParams(url.searchParams, kinds);
      } else if (req.method === "POST") {
        const body = await readBody(req);
        try {
          input = body.trim() ? JSON.parse(body) : {};
        } catch {
          throw new BadRequest("Body is not valid JSON");
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequest("Body must be a JSON object");
      } else return send(405, { error: "Use GET or POST" });
      checkEnums(input, enums);
      send(200, await handler(input));
    } catch (err) {
      if (err instanceof BadRequest) return send(400, { error: err.message });
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Standby request failed: ${msg}`);
      send(500, { error: msg });
    }
  });
  server.listen(port);
  return server;
}
