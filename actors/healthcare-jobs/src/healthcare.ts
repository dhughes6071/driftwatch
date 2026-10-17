/**
 * Healthcare filters and output records. Pure logic, no Apify SDK.
 *
 * A job qualifies when its company is one of the US health systems in
 * health.ts, it passes the general filters (title, location, date, pay,
 * new since last run -- search.ts), and its clinical tags pass the
 * healthcare filters below.
 *
 * Clinical tags come from the index's health file (computed at publish
 * with the full description: bonus amounts, licenses, shift phrases). For a
 * job missing from it -- an index published before that file existed --
 * they are computed here from the title alone.
 */
import { clinicalTags, type ClinicalTags, type Employment, type RoleFamily } from "./clinical.ts";
import type { IndexJob } from "./format.ts";
import { healthSystemFor, type HealthSystem } from "./health.ts";
import { makeMatcher, type Query } from "./search.ts";

export interface HealthQuery extends Query {
  /** Health system names, matched as substrings ("Ascension", "baylor"). */
  healthSystems?: string[];
  /** Two-letter states of the health system's home (AHRQ), e.g. ["TX", "MO"]. */
  systemStates?: string[];
  roleFamilies?: RoleFamily[];
  specialties?: string[];
  employment?: Employment[];
  shifts?: ClinicalTags["shift"];
  onlySignOnBonus?: boolean;
  minSignOnBonus?: number;
  /** Only jobs paid by the hour whose top hourly rate reaches this. */
  minHourlyRate?: number;
  /** Systems with at least this many staffed beds. */
  minSystemBeds?: number;
  maxJobsPerSystem?: number;
}

export interface HealthJob {
  job: IndexJob;
  system: HealthSystem;
  tags: ClinicalTags;
}

const lower = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** A test for one index job: its system and tags when it qualifies, otherwise null. */
export function makeHealthMatcher(q: HealthQuery, tagsFor: (j: IndexJob) => ClinicalTags | undefined, now = Date.now()) {
  const base = makeMatcher(q, now);
  const systems = lower(q.healthSystems);
  const states = new Set((q.systemStates ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean));
  const families = new Set(q.roleFamilies ?? []);
  const specialties = new Set(q.specialties ?? []);
  const employment = new Set(q.employment ?? []);
  const shifts = new Set(q.shifts ?? []);

  return (j: IndexJob): HealthJob | null => {
    const system = healthSystemFor(j.ats, j.company);
    if (!system) return null;
    if (systems.length && !systems.some((s) => system.name.toLowerCase().includes(s) || j.companyName.toLowerCase().includes(s))) return null;
    if (states.size && !states.has(system.state)) return null;
    if (q.minSystemBeds && system.beds < q.minSystemBeds) return null;
    if (q.minHourlyRate && !(j.salaryPeriod === "hour" && (j.salaryMax ?? j.salaryMin ?? 0) >= q.minHourlyRate)) return null;
    if (!base(j)) return null;
    const tags = tagsFor(j) ?? clinicalTags({ title: j.title, department: j.department, employmentType: j.employmentType });
    if (families.size && !families.has(tags.roleFamily)) return null;
    if (specialties.size && !tags.specialties.some((s) => specialties.has(s))) return null;
    if (employment.size && !(tags.employment && employment.has(tags.employment))) return null;
    if (shifts.size && !tags.shift.some((s) => shifts.has(s))) return null;
    if ((q.onlySignOnBonus || q.minSignOnBonus) && !tags.signOnBonus) return null;
    if (q.minSignOnBonus && (tags.signOnBonusAmount ?? 0) < q.minSignOnBonus) return null;
    return { job: j, system, tags };
  };
}

/** The public record: the job, its health system, and its clinical tags. */
export function toRecord(h: HealthJob, indexedAt: string, description: string | undefined) {
  const { d: _d, ...job } = h.job;
  return {
    title: job.title,
    healthSystem: h.system.name,
    healthSystemState: h.system.state,
    healthSystemBeds: h.system.beds,
    healthSystemId: h.system.id,
    employer: job.companyName,
    location: job.location,
    additionalLocations: job.additionalLocations,
    roleFamily: h.tags.roleFamily,
    roleType: h.tags.roleType,
    specialties: h.tags.specialties,
    shift: h.tags.shift,
    shiftHours: h.tags.shiftHours,
    employment: h.tags.employment,
    signOnBonus: h.tags.signOnBonus,
    signOnBonusAmount: h.tags.signOnBonusAmount,
    licenses: h.tags.licenses,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    salaryAnnualMin: job.salaryAnnualMin ?? null,
    salaryAnnualMax: job.salaryAnnualMax ?? null,
    salaryText: job.salaryText ?? null,
    department: job.department,
    employmentType: job.employmentType,
    postedAt: job.postedAt,
    firstSeenAt: job.firstSeenAt,
    url: job.url,
    id: job.id,
    ats: job.ats,
    ...(description !== undefined ? { description } : {}),
    indexedAt,
  };
}
