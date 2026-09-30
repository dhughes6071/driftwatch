/**
 * Pay for a job: the company's structured pay data (Ashby compensation or
 * Greenhouse pay ranges) when it publishes it, otherwise the range stated in the description (see salary.ts, shared
 * with the Career Site Jobs API).
 */
import type { Job } from "./ats.ts";
import { extractSalary, fromStructuredPay, type Period, type Salary } from "./salary.ts";

export interface PayFields {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: Period | null;
  /** Annualised (hour x 2,080, day x 260, week x 52, month x 12), same currency. */
  salaryAnnualMin: number | null;
  salaryAnnualMax: number | null;
  /** The text the pay was read from, for checking. */
  salaryText: string | null;
  /** "structured" = the company's own pay data (Ashby or Greenhouse); "description" = read from the text. */
  salarySource: "structured" | "description" | null;
}

/**
 * These boards publish no country field, and a bare "$" means the local
 * dollar, so the location text decides between USD and CAD/AUD.
 */
export function countryHint(location: string | null): string | null {
  const l = location ?? "";
  if (/canada|toronto|vancouver|montr[eé]al|ottawa|calgary|edmonton|waterloo|\b(ON|BC|QC|AB)\b/i.test(l) && !/\bUS\b|united states/i.test(l)) return "CA";
  if (/australia|sydney|melbourne|brisbane|perth\b|\b(NSW|VIC|QLD)\b/i.test(l)) return "AU";
  if (/new zealand|auckland|wellington/i.test(l)) return "NZ";
  if (/singapore/i.test(l)) return "SG";
  return null;
}

export function payFor(job: Pick<Job, "compensation" | "description" | "location">): PayFields {
  const s: Salary | null = fromStructuredPay(job.compensation) ?? extractSalary(job.description, countryHint(job.location));
  return {
    salaryMin: s?.min ?? null,
    salaryMax: s?.max ?? null,
    salaryCurrency: s?.currency ?? null,
    salaryPeriod: s?.period ?? null,
    salaryAnnualMin: s?.annualMin ?? null,
    salaryAnnualMax: s?.annualMax ?? null,
    salaryText: s?.text ?? null,
    salarySource: s?.source ?? null,
  };
}
