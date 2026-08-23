/**
 * The response contract. This is the product -- keep it stable, keep it
 * machine-readable, and make every claim traceable to a primary source.
 */

export type Tier = "evidence" | "synthesized";

export interface Citation {
  /** What kind of primary source this is. */
  kind: "release-note" | "advisory" | "registry" | "repo";
  /** Human/agent-followable URL to the original. */
  url: string;
  /** Short label, e.g. "v19.0.0 release notes". */
  label: string;
}

export interface BreakingChange {
  /** One-line statement of what broke. */
  summary: string;
  /** Version in which this change landed. */
  version: string;
  /** How confident we are this affects a typical caller. */
  confidence: "high" | "medium" | "low";
  /** Symbols removed, renamed, or moved -- what an agent greps for. */
  symbols?: string[];
  /** Concrete edit, when we can state one. */
  migration?: { before?: string; after?: string; note?: string };
  citations: Citation[];
}

export interface DeltaResult {
  schemaVersion: 1;
  ecosystem: string;
  package: string;
  from: string;
  to: string;

  /** semver classification of the jump. */
  jump: {
    kind: "major" | "minor" | "patch" | "downgrade" | "same" | "unknown";
    majorsCrossed: number;
    /** Versions published between from (exclusive) and to (inclusive). */
    releasesInRange: number;
  };

  /**
   * "evidence"    -- deterministic extraction only, no LLM involved (free to compute)
   * "synthesized" -- an LLM structured the release notes into migration steps
   */
  tier: Tier;

  /** Highest-signal finding first. */
  breakingChanges: BreakingChange[];

  /** Advisories affecting `from`; `fixedByUpgrade` marks ones this upgrade resolves. */
  advisories: Array<{
    id: string;
    summary: string;
    severity: string;
    url: string;
    fixedByUpgrade: boolean;
  }>;

  /** Deprecation notice on the package itself, if any. */
  deprecated: string | null;

  /** Everything we relied on, so the caller can verify us. */
  citations: Citation[];

  /**
   * How well the sources actually covered this specific jump.
   *
   * A thin answer has two very different causes -- "nothing broke" and "the
   * project documented this release somewhere we cannot read" -- and a caller
   * acting on the first when the truth is the second will ship a broken
   * upgrade. This field separates them. Measured on zod 3.22.0 -> 4.0.0, a
   * major rewrite for which no GitHub Release and no CHANGELOG.md exist.
   */
  coverage: {
    /** Release notes found in range, whatever their quality. */
    notesFound: number;
    /** Whether we found notes for the TARGET version itself. */
    targetDocumented: boolean;
    /**
     * True when a major boundary was crossed with no notes for the target.
     * The single most important document is the one we are missing, so any
     * "no breaking changes" conclusion is unsafe.
     */
    majorUndocumented: boolean;
  };

  meta: {
    computedAt: string;
    cacheHit: boolean;
    /** Set when we could not reach a source; the result is still usable. */
    warnings: string[];
    /** Our variable cost to produce this answer, in USD. Transparency by design. */
    computeCostUsd: number;
  };
}

export interface PackageCheck {
  schemaVersion: 1;
  ecosystem: string;
  name: string;
  exists: boolean;
  /** Present when `exists` is false and something close was found. */
  didYouMean: string[];
  latest: string | null;
  deprecated: string | null;
  repository: string | null;
  description: string | null;
  /** Advisories against the latest version. */
  advisoryCount: number;
  /**
   * Set when the name does not exist but resembles a popular package -- the
   * slopsquatting signal. Treat as "do not install".
   */
  suspicious: boolean;
  meta: { checkedAt: string; warnings: string[] };
}
