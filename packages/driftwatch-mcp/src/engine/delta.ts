/**
 * The core engine: given (ecosystem, package, from, to), produce a cited,
 * structured migration answer.
 *
 * ECONOMICS: results are cached permanently and keyed on the exact version
 * pair. The delta between react@18.2.0 and react@19.0.0 is a fact that will
 * never change, so we compute it once and serve it forever. That is what takes
 * gross margin from ~60% cold to ~95%+ at steady state.
 */
import { getPackage, type Ecosystem } from "../sources/registry.ts";
import { getReleaseNotes, compareVersions } from "../sources/github.ts";
import { getChangelogSection, isPointerRelease } from "../sources/changelog.ts";
import { getAdvisories } from "../sources/osv.ts";
import { extractBreakingChanges } from "./extract.ts";
import { synthesize } from "./synth.ts";
import { deltaKey, getCachedDelta, putCachedDelta } from "../lib/db.ts";
import { log } from "../lib/log.ts";
import type { Citation, DeltaResult } from "./types.ts";

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

export async function computeDelta(args: {
  ecosystem: Ecosystem;
  name: string;
  from: string;
  to: string;
  /** Skip the cache. Used by the nightly precompute job, never by paid traffic. */
  force?: boolean;
}): Promise<DeltaResult> {
  const { ecosystem, name, from, to } = args;
  const key = deltaKey(ecosystem, name, from, to);

  if (!args.force) {
    const cached = getCachedDelta(key);
    if (cached) {
      const payload = cached.payload as DeltaResult;
      return { ...payload, meta: { ...payload.meta, cacheHit: true } };
    }
  }

  const warnings: string[] = [];
  const started = Date.now();

  // 1. Resolve the package. If the registry does not know it, that is a hard
  //    error -- and a genuinely useful answer (the agent hallucinated a name).
  const pkg = await getPackage(ecosystem, name);
  if (!pkg) throw new NotFoundError(`Package not found on ${ecosystem}: ${name}`);

  if (pkg.versions.length && !pkg.versions.includes(from)) {
    warnings.push(`Version ${from} not found in the registry; proceeding on version ordering alone.`);
  }
  if (pkg.versions.length && !pkg.versions.includes(to)) {
    warnings.push(`Version ${to} not found in the registry; proceeding on version ordering alone.`);
  }

  const jump = classifyJump(from, to, pkg.versions);

  // 2. Release notes across the range -- our primary evidence.
  let notes: Awaited<ReturnType<typeof getReleaseNotes>> = [];
  if (pkg.repository) {
    notes = await getReleaseNotes(pkg.repository, from, to);

    /*
     * Many projects publish a release whose body is only a pointer at
     * CHANGELOG.md (vite, Flask). The breaking changes are public -- they just
     * live in a file rather than a release body. Fall back to fetching it.
     */
    const targetNote = notes.find((n) => compareVersions(n.version, to) === 0);
    if (!targetNote || isPointerRelease(targetNote.body)) {
      const section = await getChangelogSection(pkg.repository, to, pkg.name);
      if (section) {
        notes = notes.filter((n) => n.tag !== targetNote?.tag).concat(section);
      }
    }

    if (notes.length === 0) {
      warnings.push(`No release notes or changelog entries found for ${pkg.repository} in this range.`);
    }
  } else {
    warnings.push("No source repository recorded in the registry; release notes unavailable.");
  }

  /*
   * Did we actually find the document that matters?
   *
   * Having notes in range is not the same as having notes for the TARGET. zod
   * 3.22.0 -> 4.0.0 returns 152 in-range 3.x releases and one thin breaking
   * change, because zod published no GitHub Release for v4.0.0 and ships no
   * CHANGELOG.md -- the entire v4 rewrite is documented on their docs site,
   * which we do not read. The answer looked confident and was nearly empty.
   *
   * Same shape as vite (CHANGELOG.md) and Django (docs/releases/*.txt), both
   * of which we fixed by adding a source. This one we cannot fix that way, so
   * we report it instead. Saying "the notes for this release do not exist" is
   * strictly more useful than a thin answer that reads like an all-clear.
   */
  const targetDocumented = notes.some((n) => compareVersions(n.version, to) === 0);
  const majorUndocumented = jump.kind === "major" && !targetDocumented;
  if (majorUndocumented) {
    warnings.push(
      `No release notes were found for ${pkg.name} ${to} itself -- the major release that ` +
        `documents most breaking changes. Projects often publish major-release notes outside ` +
        `GitHub Releases (a docs site, a migration guide, a blog post). Treat this result as ` +
        `incomplete and check the project's own upgrade guide before relying on it.`,
    );
  } else if (!targetDocumented && notes.length > 0) {
    warnings.push(`No release notes found for ${to} itself; findings come from intermediate releases.`);
  }

  // 3. Deterministic extraction -- always runs, always free.
  let breakingChanges = extractBreakingChanges(notes);

  // 4. Advisories affecting the version being left behind.
  const advisories = await getAdvisories(ecosystem, name, from, to);

  // 5. Optional LLM synthesis. Returns unchanged input if disabled or capped.
  let tier: DeltaResult["tier"] = "evidence";
  let computeCostUsd = 0;
  const synth = await synthesize({ pkg: `${ecosystem}:${name}`, from, to, notes, breakingChanges });
  if (synth.applied) {
    breakingChanges = synth.breakingChanges;
    tier = "synthesized";
    computeCostUsd = synth.costUsd;
  }
  if (synth.warning) warnings.push(synth.warning);

  const citations = buildCitations(pkg, notes, advisories);

  const result: DeltaResult = {
    schemaVersion: 1,
    ecosystem,
    package: pkg.name,
    from,
    to,
    jump,
    tier,
    breakingChanges: breakingChanges.slice(0, 40),
    advisories,
    deprecated: pkg.deprecated,
    citations,
    coverage: {
      notesFound: notes.length,
      targetDocumented,
      majorUndocumented,
    },
    meta: {
      computedAt: new Date().toISOString(),
      cacheHit: false,
      warnings,
      computeCostUsd: Number(computeCostUsd.toFixed(6)),
    },
  };

  putCachedDelta({
    key,
    ecosystem,
    name: pkg.name,
    from,
    to,
    payload: result,
    tier,
    computeCostUsd,
  });

  log.info("delta computed", {
    pkg: `${ecosystem}:${name}`,
    from,
    to,
    tier,
    breaking: result.breakingChanges.length,
    advisories: advisories.length,
    ms: Date.now() - started,
    costUsd: computeCostUsd,
  });

  return result;
}

function classifyJump(from: string, to: string, versions: string[]): DeltaResult["jump"] {
  const cmp = compareVersions(from, to);
  const parse = (v: string) => v.replace(/^[^\d]*/, "").split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const a = parse(from);
  const b = parse(to);

  let kind: DeltaResult["jump"]["kind"];
  if (cmp === 0) kind = "same";
  else if (cmp > 0) kind = "downgrade";
  else if (b[0] > a[0]) kind = "major";
  else if (b[1] > a[1]) kind = "minor";
  else kind = "patch";

  const releasesInRange = versions.filter(
    (v) => compareVersions(v, from) > 0 && compareVersions(v, to) <= 0,
  ).length;

  return {
    kind,
    majorsCrossed: Math.max(0, (b[0] ?? 0) - (a[0] ?? 0)),
    releasesInRange,
  };
}

function buildCitations(
  pkg: NonNullable<Awaited<ReturnType<typeof getPackage>>>,
  notes: Awaited<ReturnType<typeof getReleaseNotes>>,
  advisories: Awaited<ReturnType<typeof getAdvisories>>,
): Citation[] {
  const out: Citation[] = [
    {
      kind: "registry",
      url:
        pkg.ecosystem === "npm"
          ? `https://www.npmjs.com/package/${pkg.name}`
          : `https://pypi.org/project/${pkg.name}/`,
      label: `${pkg.name} on ${pkg.ecosystem}`,
    },
  ];

  if (pkg.repository) {
    out.push({ kind: "repo", url: `https://github.com/${pkg.repository}`, label: pkg.repository });
  }
  for (const n of notes.slice(0, 20)) {
    out.push({ kind: "release-note", url: n.url, label: `${n.tag} release notes` });
  }
  for (const a of advisories.slice(0, 10)) {
    out.push({ kind: "advisory", url: a.url, label: a.id });
  }
  return out;
}
