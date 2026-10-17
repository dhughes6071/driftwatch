/**
 * US health systems, and which index companies belong to each.
 *
 * sources/health-systems.json lists all 639 systems in AHRQ's Compendium of
 * U.S. Health Systems, 2023 (largest by beds first), each with the index keys
 * (`ats:company`, exactly as in job rows) of the career sites it hires
 * through. The keys were matched by hand, 16 Oct 2026.
 *
 * Tagging works by lookup rather than by a field stored on each job, so it
 * covers every job the index has ever seen, and a newly mapped career site
 * tags its whole history at once.
 */
import { readFileSync } from "node:fs";

export interface HealthSystem {
  /** AHRQ health_sys_id, e.g. "HSI00000096". */
  id: string;
  name: string;
  city: string;
  state: string;
  hospitals: number;
  beds: number;
  /** Index keys "ats:company" of the system's career sites; empty when not crawled yet. */
  sources: string[];
}

export const HEALTH_SYSTEMS: HealthSystem[] = JSON.parse(
  readFileSync(new URL("../sources/health-systems.json", import.meta.url), "utf8"),
);

const BY_SOURCE = new Map<string, HealthSystem>();
for (const s of HEALTH_SYSTEMS) for (const k of s.sources) BY_SOURCE.set(k, s);

/** The health system a job's company belongs to, or null. */
export const healthSystemFor = (ats: string, company: string): HealthSystem | null =>
  BY_SOURCE.get(`${ats}:${company.toLowerCase()}`) ?? null;
