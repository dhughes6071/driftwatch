/**
 * Package existence and trust check -- the anti-slopsquatting tool.
 *
 * Coding agents hallucinate package names; attackers register the hallucinated
 * names and ship malware. This answers "is this real, and should I install it?"
 *
 * This ships FREE in the MCP server. It makes the server more useful, and it is
 * the natural upsell surface into the paid delta endpoint.
 */
import { getPackage, type Ecosystem } from "../sources/registry.ts";
import { getAdvisories } from "../sources/osv.ts";
import type { PackageCheck } from "./types.ts";

/**
 * Popular packages whose names get hallucinated or typo-squatted most often.
 * A miss here is not a security failure -- it just means we do not offer a
 * "did you mean" suggestion. Kept small and obvious on purpose.
 */
const POPULAR: Record<Ecosystem, string[]> = {
  npm: [
    "react", "react-dom", "next", "vue", "svelte", "express", "fastify", "axios",
    "lodash", "zod", "typescript", "eslint", "prettier", "vite", "webpack", "jest",
    "vitest", "tailwindcss", "prisma", "drizzle-orm", "dotenv", "commander", "chalk",
    "uuid", "date-fns", "dayjs", "socket.io", "mongoose", "pg", "redis", "openai",
  ],
  pypi: [
    "requests", "urllib3", "numpy", "pandas", "scipy", "flask", "django", "fastapi",
    "pydantic", "sqlalchemy", "pytest", "black", "ruff", "mypy", "click", "rich",
    "httpx", "beautifulsoup4", "scikit-learn", "matplotlib", "pillow", "boto3",
    "celery", "uvicorn", "python-dotenv", "openai", "anthropic", "transformers",
  ],
};

export async function checkPackage(ecosystem: Ecosystem, name: string): Promise<PackageCheck> {
  const warnings: string[] = [];
  const pkg = await getPackage(ecosystem, name);
  const near = nearestPopular(ecosystem, name);

  if (!pkg) {
    return {
      schemaVersion: 1,
      ecosystem,
      name,
      exists: false,
      didYouMean: near,
      latest: null,
      deprecated: null,
      repository: null,
      description: null,
      advisoryCount: 0,
      // Does not exist AND looks like a popular package: treat as hostile.
      suspicious: near.length > 0,
      meta: { checkedAt: new Date().toISOString(), warnings },
    };
  }

  const advisories = pkg.latest ? await getAdvisories(ecosystem, pkg.name, pkg.latest, pkg.latest) : [];

  /*
   * The dangerous case is NOT a name that fails to resolve -- it is a name that
   * RESOLVES to a squat. Verified against npm on 2026-08-07: `recat` (one edit
   * from `react`) exists, publishes version 0.0.0, and carries no repository
   * and no description. A check that only reported `exists: true` would have
   * waved that straight through to an install.
   *
   * So when the name is one or two edits from something popular, we look at
   * whether the package behaves like a real project.
   */
  const squatSignals: string[] = [];
  if (near.length > 0) {
    if (!pkg.repository) squatSignals.push("no source repository");
    if (!pkg.description) squatSignals.push("no description");
    if (pkg.versions.length <= 2) squatSignals.push(`only ${pkg.versions.length} published version(s)`);
    if (pkg.latest && /^0\.0\.[0-9]+$/.test(pkg.latest)) squatSignals.push(`placeholder version ${pkg.latest}`);
  }

  // Two or more independent signals: this looks like a squat, not a project.
  const suspicious = squatSignals.length >= 2;
  if (suspicious) {
    warnings.push(
      `Name is ${editDistance(name.toLowerCase(), near[0])} edit(s) from "${near[0]}" and shows squat signals: ${squatSignals.join(", ")}. Verify before installing.`,
    );
  } else if (near.length > 0) {
    warnings.push(`Name closely resembles "${near[0]}". Confirm this is the package you meant.`);
  }

  return {
    schemaVersion: 1,
    ecosystem,
    name: pkg.name,
    exists: true,
    didYouMean: near.length > 0 ? near : [],
    latest: pkg.latest,
    deprecated: pkg.deprecated,
    repository: pkg.repository,
    description: pkg.description,
    advisoryCount: advisories.length,
    suspicious,
    meta: { checkedAt: new Date().toISOString(), warnings },
  };
}

/** Popular names within edit distance 2 of the queried name. */
function nearestPopular(ecosystem: Ecosystem, name: string): string[] {
  const target = name.toLowerCase();
  return POPULAR[ecosystem]
    .map((p) => ({ p, d: editDistance(target, p) }))
    .filter(({ p, d }) => d > 0 && d <= 2 && Math.abs(p.length - target.length) <= 3)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ p }) => p);
}

/** Standard Levenshtein, two-row variant. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
