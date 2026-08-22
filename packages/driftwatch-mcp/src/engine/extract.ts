/**
 * Deterministic breaking-change extraction from release notes.
 *
 * This is the free tier and it does most of the work. No LLM, no cost, no
 * nondeterminism. Release notes are written by humans following strong
 * conventions (Keep a Changelog, conventional commits, semantic-release), and
 * those conventions are very machine-readable if you actually read them.
 *
 * An LLM pass on top (engine/synth.ts) is strictly an enhancement.
 */
import type { ReleaseNote } from "../sources/github.ts";
import type { BreakingChange, Citation } from "./types.ts";

/** Headings that mark a breaking-change section in a changelog. */
const SECTION_RE =
  /^#{1,6}\s*(?:.*\b(?:breaking|BREAKING)\b.*(?:changes?|)|⚠\s*breaking.*|💥.*)$/im;

/** Inline markers used by conventional-commit tooling. */
const INLINE_RE =
  /(?:^|\n)\s*[-*]?\s*(?:\*\*)?(?:BREAKING[ -]CHANGE(?:S)?|BREAKING)(?:\*\*)?\s*[:!]?\s*(.+)/g;

/** Phrases that reliably indicate a caller-visible break. */
const PHRASE_RE = new RegExp(
  [
    String.raw`\bremoved?\s+(?:the\s+)?[\`'"]?([A-Za-z_$][\w.$]*)[\`'"]?`,
    String.raw`\brenamed?\s+[\`'"]?([A-Za-z_$][\w.$]*)[\`'"]?\s+to\s+[\`'"]?([A-Za-z_$][\w.$]*)[\`'"]?`,
    String.raw`\bdropped?\s+support\s+for\s+(.+?)(?:\.|$)`,
    String.raw`\bno\s+longer\s+(?:supports?|accepts?|exports?|returns?)\s+(.+?)(?:\.|$)`,
    String.raw`\breplaced?\s+[\`'"]?([A-Za-z_$][\w.$]*)[\`'"]?\s+with\s+[\`'"]?([A-Za-z_$][\w.$]*)[\`'"]?`,
    String.raw`\bmust\s+now\s+(.+?)(?:\.|$)`,
    String.raw`\bmoved?\s+[\`'"]?([A-Za-z_$][\w.$]*)[\`'"]?\s+(?:to|into)\s+(.+?)(?:\.|$)`,
  ].join("|"),
  "gim",
);

/** Identifier-looking tokens inside backticks -- the symbols agents grep for. */
const SYMBOL_RE = /`([A-Za-z_$][\w.$]{1,60})`/g;

/**
 * Changes that are real but invisible to callers. Projects with auto-generated
 * release notes (pydantic, for one) list every merged commit, so the test suite
 * and internal refactors show up alongside genuine API breaks.
 *
 * A caller upgrading pydantic does not care that `xfail` was removed from
 * `tests.test_edge_cases`. Reporting it as a breaking change is worse than
 * silence -- it trains the reader to skim.
 */
const INTERNAL_RE =
  /\b(xfail|pytest|tox|mypy|ruff|flake8|lint|linting|codecov|coverage|benchmark|typo|docstring|changelog|readme|pre-commit|dependabot|workflow|makefile|gitignore)\b/i;

/** Symbols that are clearly internal rather than part of a public API. */
function isInternalSymbol(sym: string): boolean {
  return (
    sym.startsWith("_") || // _private, __dunder
    /^tests?\./i.test(sym) || // tests.foo, test.bar
    /^(docs|scripts|ci|benchmarks?)\./i.test(sym)
  );
}

export function extractBreakingChanges(notes: ReleaseNote[]): BreakingChange[] {
  const out: BreakingChange[] = [];

  for (const note of notes) {
    const citation: Citation = {
      kind: "release-note",
      url: note.url,
      label: `${note.tag} release notes`,
    };

    for (const { text, confidence } of candidateLines(note.body)) {
      const summary = cleanup(text);
      if (summary.length < 12 || summary.length > 400) continue;

      // Drop internal churn. Applied to medium-confidence findings only --
      // if a maintainer put it under an explicit "Breaking Changes" heading,
      // we defer to them even when it mentions the test suite.
      if (confidence !== "high" && INTERNAL_RE.test(summary)) continue;

      const symbols = extractSymbols(text);
      // A medium-confidence finding whose only named symbols are internal is
      // an internal change described in public-sounding words.
      if (confidence !== "high" && symbols.length > 0 && symbols.every(isInternalSymbol)) continue;

      out.push({
        summary,
        version: note.version,
        confidence,
        symbols,
        citations: [citation],
      });
    }
  }

  return dedupe(out).sort(rank);
}

/**
 * Pull candidate breaking-change lines out of one release body, tagging each
 * with how much we trust it.
 */
function candidateLines(body: string): Array<{ text: string; confidence: BreakingChange["confidence"] }> {
  const found: Array<{ text: string; confidence: BreakingChange["confidence"] }> = [];
  if (!body) return found;

  // 1. An explicit "Breaking Changes" section is the strongest signal.
  const lines = body.split("\n");
  let inBreakingSection = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      inBreakingSection = SECTION_RE.test(line);
      continue;
    }
    if (inBreakingSection) {
      const item = line.replace(/^\s*[-*+]\s*/, "").trim();
      if (item.length > 10) found.push({ text: item, confidence: "high" });
    }
  }

  // 2. Inline BREAKING CHANGE: markers.
  for (const m of body.matchAll(INLINE_RE)) {
    if (m[1]) found.push({ text: m[1].trim(), confidence: "high" });
  }

  // 3. Phrase heuristics anywhere in the body.
  //
  // These fire outside any "Breaking Changes" heading, so precision matters
  // more than recall here. We require the line to name a code symbol in
  // backticks. Without that gate, GitHub's auto-generated release notes
  // produce false positives from ordinary maintenance commits -- pydantic v2
  // was reporting "setup: remove upper bound from python_requires by @vfazio",
  // which is a packaging change, not a caller-visible break.
  for (const line of lines) {
    const trimmed = line.replace(/^\s*[-*+]\s*/, "").trim();
    if (trimmed.length < 12) continue;
    if (!/`[A-Za-z_$][\w.$]{1,60}`/.test(trimmed)) continue;
    PHRASE_RE.lastIndex = 0;
    if (PHRASE_RE.test(trimmed)) {
      found.push({ text: trimmed, confidence: "medium" });
    }
  }

  return found;
}

function extractSymbols(text: string): string[] {
  const syms = new Set<string>();
  for (const m of text.matchAll(SYMBOL_RE)) {
    const s = m[1];
    // Filter obvious prose that happened to be in backticks.
    if (/^[a-z]{1,3}$/.test(s)) continue;
    syms.add(s);
  }
  return [...syms].slice(0, 10);
}

function cleanup(s: string): string {
  return s
    .replace(/\(\[#?\d+\]\([^)]*\)\)/g, "") // strip "([#123](url))" PR refs
    .replace(/\bby @[\w-]+ in https?:\/\/\S+/gi, "") // GitHub auto-note attribution
    .replace(/\bin https?:\/\/\S+\/pull\/\d+/gi, "") // bare PR links
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // unwrap markdown links, keep text
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse near-identical findings that appear in several releases. */
function dedupe(items: BreakingChange[]): BreakingChange[] {
  const seen = new Map<string, BreakingChange>();
  for (const item of items) {
    const key = item.summary.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else if (confidenceScore(item) > confidenceScore(existing)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

function confidenceScore(b: BreakingChange): number {
  return b.confidence === "high" ? 3 : b.confidence === "medium" ? 2 : 1;
}

/** Highest confidence first, then most symbols (most actionable), then newest. */
function rank(a: BreakingChange, b: BreakingChange): number {
  const c = confidenceScore(b) - confidenceScore(a);
  if (c !== 0) return c;
  return (b.symbols?.length ?? 0) - (a.symbols?.length ?? 0);
}
