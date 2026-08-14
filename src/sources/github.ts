/**
 * GitHub release notes and changelog retrieval.
 *
 * COPYRIGHT NOTE: we extract short factual excerpts and always return a link to
 * the primary source. We never reproduce whole changelogs or documentation
 * pages in our output. This is both legally sound and a better product -- an
 * agent wants the specific breaking change, not 400 lines of prose.
 */
import { fetchJson, githubHeaders, UpstreamError } from "./http.ts";
import { log } from "../lib/log.ts";

export interface ReleaseNote {
  version: string;
  tag: string;
  publishedAt: string | null;
  url: string;
  /** Truncated. Full text lives at `url`. */
  body: string;
}

interface GhRelease {
  tag_name: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
}

const MAX_BODY_CHARS = 8_000;

/**
 * Fetch release notes for `repo`, filtered to versions strictly after `from`
 * and up to and including `to`.
 */
export async function getReleaseNotes(
  repo: string,
  fromVersion: string,
  toVersion: string,
): Promise<ReleaseNote[]> {
  const out: ReleaseNote[] = [];

  try {
    // Two pages is plenty for a typical upgrade span and keeps us well inside
    // the unauthenticated rate limit.
    for (let page = 1; page <= 2; page++) {
      const releases = await fetchJson<GhRelease[]>(
        `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
        { headers: githubHeaders() },
      );
      if (!Array.isArray(releases) || releases.length === 0) break;

      for (const r of releases) {
        if (r.draft) continue;
        const v = tagToVersion(r.tag_name);
        if (!v) continue;
        if (compareVersions(v, fromVersion) > 0 && compareVersions(v, toVersion) <= 0) {
          out.push({
            version: v,
            tag: r.tag_name,
            publishedAt: r.published_at ?? null,
            url: r.html_url,
            body: (r.body ?? "").slice(0, MAX_BODY_CHARS),
          });
        }
      }
      if (releases.length < 100) break;
    }
  } catch (err) {
    log.debug("release notes unavailable", { repo, err: String(err) });
  }

  /*
   * The list endpoint returns releases NEWEST FIRST, so for an actively
   * maintained project the release we care about can sit beyond the pages we
   * read. Measured 2026-08-07: vite 4.0.0 -> 5.0.0 returned only v4.5.x patch
   * notes because v5.0.0 itself was past page 2 -- the one release documenting
   * the major's breaking changes was the one we never fetched.
   *
   * So if the target version is missing, fetch it directly by tag.
   *
   * BUDGET: at most 3 extra requests, and only when the target is actually
   * absent. An earlier version of this tried 8 tag formats across 6 boundary
   * versions -- up to 48 calls per package, which exhausted GitHub's 60/hour
   * unauthenticated limit in a single scorecard run and silently zeroed every
   * result. Frugality here is a correctness property, not politeness.
   */
  const hasTarget = out.some((n) => compareVersions(n.version, toVersion) === 0);
  if (!hasTarget) {
    const note = await getReleaseByTag(repo, toVersion);
    if (note) out.push(note);
  }

  // Deduplicate -- a directly-fetched release may also appear in the pages.
  const seen = new Map<string, ReleaseNote>();
  for (const n of out) if (!seen.has(n.tag)) seen.set(n.tag, n);

  return [...seen.values()].sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * Fetch one release by tag, trying only the three most common conventions.
 * Verified against real repos: vite uses `v5.0.0`, Flask uses `3.0.0`, and
 * monorepos use `pkg@1.2.3`.
 */
async function getReleaseByTag(repo: string, version: string): Promise<ReleaseNote | null> {
  const v = version.replace(/^v/, "");
  const pkg = repo.split("/")[1] ?? "";
  const candidates = [...new Set([`v${v}`, v, `${pkg}@${v}`])].slice(0, 3);

  for (const tag of candidates) {
    try {
      const r = await fetchJson<GhRelease>(
        `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        { headers: githubHeaders(), retries: 0 },
      );
      if (r?.tag_name) {
        return {
          version: tagToVersion(r.tag_name) ?? v,
          tag: r.tag_name,
          publishedAt: r.published_at ?? null,
          url: r.html_url,
          body: (r.body ?? "").slice(0, MAX_BODY_CHARS),
        };
      }
    } catch (err) {
      // A 403 means we are rate limited -- stop guessing, it will not help.
      if (err instanceof UpstreamError && err.status === 403) {
        log.warn("github rate limited; set GITHUB_TOKEN to raise 60/hr to 5000/hr", { repo });
        return null;
      }
      // 404 for this naming convention -- try the next.
    }
  }
  return null;
}

/**
 * Strip common tag prefixes: `v1.2.3`, `react@18.0.0`, `release-2.0.0`.
 *
 * Two-component tags are accepted and normalized to three. This matters more
 * than it looks: pydantic ships its v2 release as `v2.0`, not `v2.0.0`. An
 * earlier version of this function required three numeric components and
 * silently dropped that release -- which is the one release containing every
 * v2 breaking change. Python projects tag this way routinely.
 *
 * Also handles PEP 440 prerelease suffixes attached without a separator
 * (`v2.0b3`, `v2.0a1`) alongside the semver style (`v2.0.0-rc.1`).
 */
export function tagToVersion(tag: string): string | null {
  const m = tag.match(/(\d+)\.(\d+)(?:\.(\d+))?([-+.]?[0-9A-Za-z][0-9A-Za-z.-]*)?/);
  if (!m) return null;

  const [, major, minor, patch, rawSuffix] = m;
  let suffix = rawSuffix ?? "";

  // A bare ".4" style trailing group is a fourth version component, not a
  // prerelease -- drop it rather than treating it as a tag.
  if (/^\.\d+$/.test(suffix)) suffix = "";

  return `${major}.${minor}.${patch ?? "0"}${suffix}`;
}

/**
 * Semver-ish comparison that tolerates the messy real world.
 * Returns <0, 0, or >0.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const cleaned = v.replace(/^[^\d]*/, "");
    // Split the numeric core from any prerelease suffix, whether it is
    // separated (1.0.0-rc.1) or attached PEP 440 style (2.0b3).
    const m = cleaned.match(/^(\d+(?:\.\d+)*)[-+]?(.*)$/);
    const core = m ? m[1] : cleaned;
    let pre = m && m[2] ? m[2] : null;

    // "2.0b3" -> core "2.0", pre "b3"; handled by the regex above because the
    // letter terminates the numeric run.
    const nums = core.split(".").map((n) => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    if (pre === "") pre = null;
    return { nums, pre };
  };
  const pa = parse(a);
  const pb = parse(b);

  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  // A prerelease sorts before its release: 1.0.0-rc.1 < 1.0.0
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre.localeCompare(pb.pre);
  return 0;
}
