/**
 * Package registry lookups. npm and PyPI only, for now -- both are free,
 * public, unauthenticated, and generous with rate limits.
 *
 * We deliberately do NOT depend on any licensed or paid data source. That is a
 * strategic choice: it keeps marginal cost at zero and keeps us clear of the
 * resale-of-licensed-data problem that most x402 sellers have.
 */
import { fetchJson } from "./http.ts";

export type Ecosystem = "npm" | "pypi";

export interface PackageInfo {
  ecosystem: Ecosystem;
  name: string;
  /** All published versions, ascending by publish time where known. */
  versions: string[];
  latest: string | null;
  repository: string | null;
  homepage: string | null;
  description: string | null;
  deprecated: string | null;
  /** ISO timestamps keyed by version, when the registry provides them. */
  publishedAt: Record<string, string>;
}

export async function getPackage(ecosystem: Ecosystem, name: string): Promise<PackageInfo | null> {
  try {
    return ecosystem === "npm" ? await getNpm(name) : await getPypi(name);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- npm

interface NpmPackument {
  name: string;
  description?: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { deprecated?: string; repository?: unknown; homepage?: string }>;
  time?: Record<string, string>;
  repository?: unknown;
  homepage?: string;
}

async function getNpm(name: string): Promise<PackageInfo | null> {
  const data = await fetchJson<NpmPackument>(
    `https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`,
  );
  if (!data?.name) return null;

  const time = data.time ?? {};
  const versions = Object.keys(data.versions ?? {}).sort((a, b) => {
    const ta = time[a] ? Date.parse(time[a]) : 0;
    const tb = time[b] ? Date.parse(time[b]) : 0;
    return ta - tb;
  });
  const latest = data["dist-tags"]?.latest ?? versions.at(-1) ?? null;

  const publishedAt: Record<string, string> = {};
  for (const v of versions) if (time[v]) publishedAt[v] = time[v];

  return {
    ecosystem: "npm",
    name: data.name,
    versions,
    latest,
    repository: normalizeRepo(data.repository ?? data.versions?.[latest ?? ""]?.repository),
    homepage: data.homepage ?? null,
    description: data.description ?? null,
    deprecated: (latest && data.versions?.[latest]?.deprecated) || null,
    publishedAt,
  };
}

// ---------------------------------------------------------------- PyPI

interface PypiResponse {
  info?: {
    name?: string;
    version?: string;
    summary?: string;
    home_page?: string;
    project_urls?: Record<string, string>;
    yanked?: boolean;
    yanked_reason?: string;
  };
  releases?: Record<string, Array<{ upload_time_iso_8601?: string; yanked?: boolean }>>;
}

async function getPypi(name: string): Promise<PackageInfo | null> {
  const data = await fetchJson<PypiResponse>(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!data?.info?.name) return null;

  const releases = data.releases ?? {};
  const publishedAt: Record<string, string> = {};
  for (const [v, files] of Object.entries(releases)) {
    const ts = files?.[0]?.upload_time_iso_8601;
    if (ts) publishedAt[v] = ts;
  }
  const versions = Object.keys(releases).sort(
    (a, b) => Date.parse(publishedAt[a] ?? "0") - Date.parse(publishedAt[b] ?? "0"),
  );

  /*
   * Find the GitHub repo. Prefer a key that names it explicitly, but fall back
   * to scanning every URL for a github.com host -- SQLAlchemy, for one,
   * publishes its repo only under "Issue Tracker", and a key-name-only match
   * left us with no release notes at all for it.
   */
  const urls = data.info.project_urls ?? {};
  const repo =
    Object.entries(urls).find(([k]) => /source|repo|code|github/i.test(k))?.[1] ??
    Object.values(urls).find((u) => typeof u === "string" && /github\.com/i.test(u)) ??
    data.info.home_page ??
    null;

  return {
    ecosystem: "pypi",
    name: data.info.name,
    versions,
    latest: data.info.version ?? versions.at(-1) ?? null,
    repository: normalizeRepo(repo),
    homepage: data.info.home_page ?? null,
    description: data.info.summary ?? null,
    deprecated: data.info.yanked ? (data.info.yanked_reason ?? "yanked") : null,
    publishedAt,
  };
}

// ---------------------------------------------------------------- helpers

/** Reduce the many shapes of a repository field to `owner/repo` on GitHub. */
export function normalizeRepo(repo: unknown): string | null {
  let url: string | null = null;
  if (typeof repo === "string") url = repo;
  else if (repo && typeof repo === "object" && "url" in repo) url = String((repo as { url: unknown }).url);
  if (!url) return null;

  const m = url.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?]|$)/i);
  return m ? `${m[1]}/${m[2]}` : null;
}
