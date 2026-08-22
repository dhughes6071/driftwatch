/**
 * CHANGELOG.md fallback.
 *
 * Measured on 2026-08-07, this was the dominant coverage gap. Many major
 * projects publish a GitHub release whose entire body is a pointer:
 *
 *   vite v5.0.0:  "Please refer to CHANGELOG.md and the Vite 5 blog post."
 *   Flask 3.0.0:  prose, then "* Changes ..." with the detail living elsewhere
 *
 * The breaking changes are real and public -- they are just in a file rather
 * than a release body. This module fetches that file and extracts the section
 * for the version being asked about.
 *
 * Fetched from raw.githubusercontent.com, which serves plain files and does
 * NOT consume the GitHub API rate limit.
 */
import { config } from "../lib/config.ts";
import { log } from "../lib/log.ts";
import type { ReleaseNote } from "./github.ts";

/** Paths real projects actually use, in rough order of likelihood. */
const CANDIDATE_PATHS = [
  "CHANGELOG.md",
  "CHANGES.md",
  "CHANGELOG.rst",
  "CHANGES.rst",
  "docs/changes.rst",
  "HISTORY.md",
  "CHANGELOG",
];

/**
 * Projects that keep ONE FILE PER RELEASE rather than a single changelog.
 *
 * Django is the case that exposed this: it publishes **zero** GitHub Releases
 * and puts its notes in `docs/releases/5.0.txt`. Asking for Django 4.2 -> 5.0
 * returned nothing at all, for one of the largest Python frameworks there is.
 *
 * `{v}` is replaced with the version, and also with the two-component form
 * (5.0.0 -> 5.0) because that is how these files are usually named.
 */
const PER_VERSION_PATHS = [
  "docs/releases/{v}.txt",
  "docs/releases/{v}.rst",
  "docs/release-notes/{v}.md",
  "docs/changelog/{v}.md",
  "CHANGES/{v}.rst",
];

/** Expand the per-version templates for a given version. */
function perVersionPaths(version: string): string[] {
  const v = version.replace(/^v/, "");
  const short = v.replace(/\.0$/, ""); // 5.0.0 -> 5.0
  const forms = [...new Set([v, short])];
  return PER_VERSION_PATHS.flatMap((tpl) => forms.map((f) => tpl.replace("{v}", f)));
}

const MAX_BYTES = 400_000;
const MAX_SECTION_CHARS = 8_000;

/**
 * Git refs to read the changelog from, in order.
 *
 * The version's own tag comes FIRST, and that ordering is load-bearing. Active
 * projects rotate their changelog: vite is on v8 today and 5.0.0 has been
 * dropped from `packages/vite/CHANGELOG.md` on `main` entirely. Reading the
 * file at `v5.0.0` gets the section that existed when that release shipped.
 * Falling back to the default branch covers projects that keep full history.
 */
function refsFor(version: string): string[] {
  const v = version.replace(/^v/, "");
  return [`v${v}`, v, "main", "master"];
}

/**
 * True when a release body carries no real content -- either it is very short,
 * or it exists only to point at the changelog.
 */
export function isPointerRelease(body: string): boolean {
  const b = body.trim();
  if (b.length < 400) return true;
  return /refer to .{0,40}CHANGELOG|see .{0,40}CHANGELOG|full changelog/i.test(b) && b.length < 1500;
}

/**
 * Fetch the changelog section for one version.
 * Returns null when no changelog is found or the version has no section.
 */
export async function getChangelogSection(
  repo: string,
  version: string,
  monorepoPackage?: string,
): Promise<ReleaseNote | null> {
  const paths = [...CANDIDATE_PATHS];

  // Monorepos keep a per-package changelog. vite's lives at
  // packages/vite/CHANGELOG.md, not at the repo root.
  if (monorepoPackage) {
    const bare = monorepoPackage.replace(/^@[^/]+\//, "");
    paths.unshift(`packages/${bare}/CHANGELOG.md`, `packages/${monorepoPackage}/CHANGELOG.md`);
  }

  /*
   * Per-version files first. When a project publishes one, it IS the release
   * notes for that version -- no heading to locate, no section to slice.
   */
  for (const ref of refsFor(version)) {
    for (const path of perVersionPaths(version)) {
      const text = await fetchText(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`);
      if (text && text.trim().length > 200) {
        log.debug("per-version release notes found", { repo, ref, path });
        return {
          version,
          tag: `${path}`,
          publishedAt: null,
          url: `https://github.com/${repo}/blob/${ref}/${path}`,
          body: text.slice(0, MAX_SECTION_CHARS),
        };
      }
    }
  }

  for (const ref of refsFor(version)) {
    for (const path of paths) {
      const url = `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
      const text = await fetchText(url);
      if (!text) continue;

      const section = extractVersionSection(text, version);
      if (section) {
        log.debug("changelog section found", { repo, ref, path, version });
        return {
          version,
          tag: `${path}#${version}`,
          publishedAt: null,
          url: `https://github.com/${repo}/blob/${ref}/${path}`,
          body: section.slice(0, MAX_SECTION_CHARS),
        };
      }
      // File exists at this ref but has no section for this version. Try the
      // next ref rather than the next filename -- a project has one changelog,
      // and the version we want may only exist at its own tag.
      break;
    }
  }
  return null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "driftwatch/0.1", accept: "text/plain" },
      signal: AbortSignal.timeout(config.limits.upstreamTimeoutMs),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } catch {
    return null;
  }
}

/**
 * Pull out the block of a changelog belonging to one version.
 *
 * Handles the conventions in the wild: markdown headings (`## 5.0.0`,
 * `## [5.0.0] - 2023-11-16`, `# v5.0.0`) and reStructuredText underlined
 * headings, which Python projects use heavily.
 */
export function extractVersionSection(text: string, version: string): string | null {
  const direct = extractOneSection(text, version);
  if (direct) return direct;

  /*
   * The stable heading can be empty. Projects using semantic-release or
   * changesets land every change in a prerelease and cut the final tag with no
   * new entries -- vite's `## 5.0.0` is four blank lines, while the actual
   * content sits under `## 5.0.0-beta.20` and its predecessors.
   *
   * So when the exact section is empty, gather the prereleases of that same
   * version instead. That is where the breaking changes actually are.
   */
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const preHeading = new RegExp(`^#{1,4}\\s*\\[?v?${escaped}-[0-9A-Za-z.]+`, "i");
  const lines = text.split("\n");
  const collected: string[] = [];

  for (let i = 0; i < lines.length && collected.join("\n").length < MAX_SECTION_CHARS; i++) {
    if (!preHeading.test(lines[i].trim())) continue;
    const tag = lines[i].trim();
    const section = extractOneSection(lines.slice(i).join("\n"), null);
    if (section) collected.push(`${tag}\n${section}`);
  }

  const joined = collected.join("\n\n").trim();
  return joined.length > 20 ? joined : null;
}

/**
 * Extract the block under one version heading. Pass `null` for `version` to
 * take the block under whatever heading is on the first line.
 */
function extractOneSection(text: string, version: string | null): string | null {
  const lines = text.split("\n");
  const escaped = (version ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Matches "## 5.0.0", "## [5.0.0] - 2023-11-16", "# v5.0.0 (2023-11-16)"
  const mdHeading = new RegExp(`^#{1,4}\\s*\\[?v?${escaped}\\]?(?![\\d.])`, "i");
  // reStructuredText: "Version 3.0.0" followed by a line of ---- or ====
  const rstHeading = new RegExp(`^(?:version\\s+)?v?${escaped}(?![\\d.])`, "i");
  const anyMdHeading = /^#{1,4}\s*\[?v?\d+\.\d+/;

  let start = -1;
  let isRst = false;

  // version === null means "take the block under the heading on line 0".
  if (version === null) {
    start = 1;
  }

  for (let i = 0; start === -1 && i < lines.length; i++) {
    const line = lines[i].trim();

    if (mdHeading.test(line)) {
      start = i + 1;
      break;
    }
    // RST heading: the *next* line is all -, =, or ~
    if (rstHeading.test(line) && i + 1 < lines.length && /^[-=~]{3,}\s*$/.test(lines[i + 1].trim())) {
      start = i + 2;
      isRst = true;
      break;
    }
  }

  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop at the next version heading.
    if (!isRst && anyMdHeading.test(trimmed)) break;
    if (isRst && i + 1 < lines.length && /^[-=~]{3,}\s*$/.test(lines[i + 1].trim()) && /\d+\.\d+/.test(trimmed)) {
      break;
    }

    body.push(line);
    if (body.join("\n").length > MAX_SECTION_CHARS) break;
  }

  const out = body.join("\n").trim();
  return out.length > 20 ? out : null;
}
