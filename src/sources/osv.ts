/**
 * Security advisories from OSV.dev -- Google's open vulnerability database.
 * Free, public, no API key, and the authoritative aggregator for npm/PyPI.
 *
 * We report advisories that AFFECT the version being upgraded FROM, since
 * those are the ones an upgrade may fix -- that is a concrete reason to act.
 */
import { fetchJson } from "./http.ts";
import { log } from "../lib/log.ts";
import type { Ecosystem } from "./registry.ts";

export interface Advisory {
  id: string;
  summary: string;
  severity: "critical" | "high" | "moderate" | "low" | "unknown";
  url: string;
  /** True when `toVersion` is outside the vulnerable range -- i.e. the upgrade fixes it. */
  fixedByUpgrade: boolean;
}

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
  affected?: Array<{
    ranges?: Array<{ type: string; events?: Array<{ introduced?: string; fixed?: string }> }>;
    versions?: string[];
  }>;
}

const OSV_ECOSYSTEM: Record<Ecosystem, string> = { npm: "npm", pypi: "PyPI" };

export async function getAdvisories(
  ecosystem: Ecosystem,
  name: string,
  fromVersion: string,
  toVersion: string,
): Promise<Advisory[]> {
  try {
    const res = await fetchJson<{ vulns?: OsvVuln[] }>("https://api.osv.dev/v1/query", {
      headers: { "content-type": "application/json" },
      retries: 1,
    }).catch(async () => {
      // OSV query is a POST; fetchJson is GET-only, so do it directly.
      const r = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "driftwatch/0.1" },
        body: JSON.stringify({ package: { name, ecosystem: OSV_ECOSYSTEM[ecosystem] }, version: fromVersion }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`OSV HTTP ${r.status}`);
      return (await r.json()) as { vulns?: OsvVuln[] };
    });

    const vulns = res?.vulns ?? [];
    return vulns.slice(0, 25).map((v) => ({
      id: v.id,
      summary: (v.summary ?? v.details ?? "").slice(0, 300),
      severity: normalizeSeverity(v),
      url: `https://osv.dev/vulnerability/${v.id}`,
      fixedByUpgrade: isFixedBy(v, toVersion),
    }));
  } catch (err) {
    log.debug("osv lookup failed", { name, err: String(err) });
    return [];
  }
}

function normalizeSeverity(v: OsvVuln): Advisory["severity"] {
  const raw = (v.database_specific?.severity ?? "").toLowerCase();
  if (raw === "critical" || raw === "high" || raw === "moderate" || raw === "low") return raw;

  // Fall back to CVSS v3 base score bands.
  const cvss = v.severity?.find((s) => s.type?.startsWith("CVSS"))?.score;
  if (cvss) {
    const m = cvss.match(/\/AV:/) ? null : parseFloat(cvss);
    if (m !== null && Number.isFinite(m)) {
      if (m >= 9) return "critical";
      if (m >= 7) return "high";
      if (m >= 4) return "moderate";
      return "low";
    }
  }
  return "unknown";
}

/** True when a `fixed` event in the advisory is at or below `toVersion`. */
function isFixedBy(v: OsvVuln, toVersion: string): boolean {
  for (const aff of v.affected ?? []) {
    for (const range of aff.ranges ?? []) {
      for (const ev of range.events ?? []) {
        if (ev.fixed && compareLoose(toVersion, ev.fixed) >= 0) return true;
      }
    }
  }
  return false;
}

function compareLoose(a: string, b: string): number {
  const pa = a.replace(/^[^\d]*/, "").split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^[^\d]*/, "").split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
