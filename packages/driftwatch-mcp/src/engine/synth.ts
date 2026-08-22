/**
 * OPTIONAL LLM synthesis layer.
 *
 * This is the ONLY component in the system that can cost money, and it is
 * DISABLED BY DEFAULT. Without it the service still returns useful, cited
 * answers from deterministic extraction (engine/extract.ts).
 *
 * Three hard spending controls, in order:
 *   1. `LLM_ENABLED` must be explicitly true.
 *   2. A daily USD ceiling (`LLM_MAX_DAILY_SPEND_USD`) checked BEFORE each call
 *      and recorded after. Exceed it and we silently fall back to the free tier.
 *   3. Bounded output tokens per call.
 *
 * Because every result is cached permanently, we pay for a given version pair
 * exactly once, ever. That is what makes the economics work.
 */
import { config } from "../lib/config.ts";
import { log } from "../lib/log.ts";
import { getDailySpend, addDailySpend } from "../lib/db.ts";
import type { ReleaseNote } from "../sources/github.ts";
import type { BreakingChange, Citation } from "./types.ts";

/**
 * USD per million tokens, as of 2026-08-07.
 * Source: Anthropic pricing. Update alongside any model change.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

export interface SynthResult {
  applied: boolean;
  breakingChanges: BreakingChange[];
  costUsd: number;
  warning?: string;
}

/*
 * The Anthropic SDK is loaded lazily and declared optional. The LLM tier is
 * off by default, so a user who never enables it should not have to download
 * or install it at all.
 */
let client: any = null;
async function getClient(): Promise<any> {
  if (!client) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic({ apiKey: config.llm.apiKey });
  }
  return client;
}

/**
 * Structured output schema. Constraining the model to this shape is what makes
 * the result machine-consumable and keeps it from drifting into prose.
 */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    breakingChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string", description: "One line: what broke, in plain terms." },
          version: { type: "string", description: "Version this landed in." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Identifiers removed, renamed, or moved. What a caller would grep for.",
          },
          migration: {
            type: "object",
            additionalProperties: false,
            properties: {
              before: { type: "string", description: "Old calling pattern. Empty string if unknown." },
              after: { type: "string", description: "New calling pattern. Empty string if unknown." },
              note: { type: "string", description: "Extra guidance. Empty string if none." },
            },
            required: ["before", "after", "note"],
          },
          sourceVersionTag: {
            type: "string",
            description: "The release tag this claim came from, so we can attach the citation.",
          },
        },
        required: ["summary", "version", "confidence", "symbols", "migration", "sourceVersionTag"],
      },
    },
  },
  required: ["breakingChanges"],
} as const;

const SYSTEM = `You extract breaking changes from library release notes for an automated API that AI coding agents call.

Your output is consumed by machines, not read by humans. Optimize for precision and actionability.

Rules:
- Report ONLY changes that would break or change the behavior of code calling this library. Ignore internal refactors, CI changes, docs, dependency bumps, and performance work that does not change the API.
- Every claim must be supported by the release notes provided. Do not infer changes from your own knowledge of the library, and do not speculate. If the notes do not say it, do not report it.
- Set sourceVersionTag to the exact release tag the claim came from.
- Put concrete old/new calling patterns in migration.before / migration.after when the notes make them clear. Use short code fragments, not full files. Leave them as empty strings rather than guessing.
- List the exact identifiers a caller would search for in symbols.
- confidence: "high" when the notes explicitly label it breaking; "medium" when the wording clearly implies a caller-visible change; "low" otherwise.
- Order by how likely a typical caller is to be affected.
- Quote at most a short phrase from the notes. Do not reproduce release notes wholesale -- state the fact in your own words.
- If there are no caller-visible breaking changes, return an empty array. An empty array is a correct and useful answer.
- Report AT MOST 25 changes. If there are more, return the 25 most likely to affect a typical caller. Keep each summary to one sentence and each code fragment to a few lines -- long output gets truncated and helps nobody.`;

export async function synthesize(args: {
  pkg: string;
  from: string;
  to: string;
  notes: ReleaseNote[];
  breakingChanges: BreakingChange[];
}): Promise<SynthResult> {
  const nothing: SynthResult = { applied: false, breakingChanges: args.breakingChanges, costUsd: 0 };

  if (!config.llm.enabled) return nothing;
  if (!config.llm.apiKey) return { ...nothing, warning: "LLM enabled but no API key configured." };
  if (args.notes.length === 0) return nothing;

  // SPENDING CONTROL: check the daily ceiling before spending anything.
  const spentToday = getDailySpend();
  if (spentToday >= config.llm.maxDailySpendUsd) {
    log.warn("llm daily spend cap reached; serving free tier", {
      spentToday,
      cap: config.llm.maxDailySpendUsd,
    });
    return {
      ...nothing,
      warning: "Daily LLM budget reached; returning deterministic evidence only.",
    };
  }

  const corpus = args.notes
    .map((n) => `### ${n.tag} (${n.publishedAt ?? "date unknown"})\n${n.body}`)
    .join("\n\n")
    .slice(0, 60_000);

  try {
    const res = await (await getClient()).messages.create({
      model: config.llm.model,
      max_tokens: config.llm.maxOutputTokens,
      system: SYSTEM,
      // Low effort: this is bounded extraction from supplied text, not open
      // reasoning. Thinking stays on (adaptive by default) -- disabling it is
      // the more expensive lever and degrades structured extraction.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Package: ${args.pkg}\nUpgrading from ${args.from} to ${args.to}\n\nRelease notes across that range:\n\n${corpus}`,
        },
      ],
    });

    if (res.stop_reason === "refusal") {
      return { ...nothing, warning: "LLM declined to process these release notes." };
    }

    const cost = priceOf(config.llm.model, res.usage.input_tokens, res.usage.output_tokens);
    addDailySpend(cost);

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return { ...nothing, costUsd: cost };

    type RawChange = {
      summary: string;
      version: string;
      confidence: BreakingChange["confidence"];
      symbols: string[];
      migration: { before: string; after: string; note: string };
      sourceVersionTag: string;
    };

    let parsed: { breakingChanges: RawChange[] };
    let truncated = false;

    if (res.stop_reason === "max_tokens") {
      /*
       * The output hit the token ceiling. We have ALREADY PAID for these
       * tokens, so discarding the whole response wastes real money and returns
       * the user nothing -- the worst of both outcomes. React 18->19 hit this
       * on 2026-08-08 with a 2000-token cap.
       *
       * Salvage every complete object from the partial JSON instead. A
       * truncated array still contains many whole, valid entries.
       */
      truncated = true;
      parsed = { breakingChanges: salvagePartialJson<RawChange>(text.text) };
      log.warn("synth truncated; salvaged partial result", {
        pkg: args.pkg,
        salvaged: parsed.breakingChanges.length,
        costUsd: cost,
      });
      if (parsed.breakingChanges.length === 0) {
        return {
          ...nothing,
          costUsd: cost,
          warning: "LLM output was truncated and unrecoverable; showing deterministic evidence.",
        };
      }
    } else {
      parsed = JSON.parse(text.text) as { breakingChanges: RawChange[] };
    }

    // Attach real citations by matching the model's stated source tag back to
    // the release we actually fetched. A claim we cannot cite is dropped --
    // every line of our output must be traceable to a primary source.
    const byTag = new Map(args.notes.map((n) => [n.tag, n]));
    const out: BreakingChange[] = [];
    for (const bc of parsed.breakingChanges) {
      const note = byTag.get(bc.sourceVersionTag) ?? args.notes.find((n) => n.version === bc.version);
      if (!note) continue;
      const citation: Citation = {
        kind: "release-note",
        url: note.url,
        label: `${note.tag} release notes`,
      };
      const migration =
        bc.migration.before || bc.migration.after || bc.migration.note
          ? {
              before: bc.migration.before || undefined,
              after: bc.migration.after || undefined,
              note: bc.migration.note || undefined,
            }
          : undefined;

      out.push({
        summary: bc.summary,
        version: bc.version || note.version,
        confidence: bc.confidence,
        symbols: bc.symbols?.length ? bc.symbols : undefined,
        migration,
        citations: [citation],
      });
    }

    log.info("synth complete", {
      pkg: args.pkg,
      found: out.length,
      truncated,
      costUsd: cost,
      inTok: res.usage.input_tokens,
      outTok: res.usage.output_tokens,
    });

    return {
      applied: true,
      breakingChanges: out,
      costUsd: cost,
      warning: truncated
        ? "LLM output was truncated; showing the changes recovered so far. There may be more."
        : undefined,
    };
  } catch (err) {
    // Never let an LLM failure take down a paid request -- fall back to the
    // deterministic tier, which is always available.
    if ((err as { name?: string })?.name === "RateLimitError") {
      return { ...nothing, warning: "LLM rate limited; returning deterministic evidence." };
    }
    log.error("synth failed", { pkg: args.pkg, err: String(err) });
    return { ...nothing, warning: "LLM synthesis unavailable; returning deterministic evidence." };
  }
}

/**
 * Recover complete objects from a truncated JSON array.
 *
 * Walks the string tracking brace depth (and string/escape state, so braces
 * inside text don't confuse it) and keeps every top-level object that closed
 * cleanly. The final, half-written object is discarded.
 */
export function salvagePartialJson<T>(text: string): T[] {
  /*
   * Scan from INSIDE the array, not from the start of the document.
   *
   * The response is `{"breakingChanges":[ {...}, {...}, {...` -- and because
   * it is truncated, that wrapper brace never closes. A scanner that starts at
   * character zero therefore sits at depth >= 1 forever and never sees a
   * single element close at depth 0, so it recovers nothing. Skipping past the
   * opening bracket is what makes the elements top-level.
   */
  const key = text.indexOf('"breakingChanges"');
  const arrayStart = text.indexOf("[", key === -1 ? 0 : key);
  if (arrayStart === -1) return [];

  const out: T[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i];

    // Order matters: an escape consumes the next character, including a quote.
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)) as T);
        } catch {
          // Malformed element -- skip it rather than failing the whole salvage.
        }
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return out;
}

function priceOf(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model] ?? PRICING["claude-opus-5"];
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
}
