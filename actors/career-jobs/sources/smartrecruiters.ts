/**
 * SmartRecruiters -- the official public Posting API (documented, no key).
 *   list:   GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=N
 *   detail: GET https://api.smartrecruiters.com/v1/companies/{id}/postings/{postingId}
 *
 * Verified 27 Sep 2026 on Bosch (4,801 roles): 100 per page, offsets run to
 * the true total, and each posting carries the company's display name and
 * explicit remote / hybrid flags. An unknown company returns an empty list,
 * not an error.
 */
import type { IndexJob } from "../src/format.ts";
import { getJson, isoOrNull, toText } from "./http.ts";

const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE = 100;

export interface SrPosting {
  id: string;
  name: string | null;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: {
    city?: string;
    region?: string;
    country?: string;
    fullLocation?: string;
    remote?: boolean;
    hybrid?: boolean;
  };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
}

interface ListResponse {
  totalFound?: number;
  content?: SrPosting[];
}

interface DetailResponse {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> };
}

export async function listPage(company: string, offset: number, limit = PAGE) {
  const r = await getJson<ListResponse>(`${API}/${encodeURIComponent(company)}/postings?limit=${limit}&offset=${offset}`);
  return r ? { total: r.totalFound ?? 0, rows: r.content ?? [] } : null;
}

export async function listAll(company: string): Promise<SrPosting[] | null> {
  const first = await listPage(company, 0);
  if (!first) return null;
  const out = [...first.rows];
  for (let offset = PAGE; offset < first.total; offset += PAGE) {
    const next = await listPage(company, offset);
    if (!next || next.rows.length === 0) break;
    out.push(...next.rows);
  }
  return out;
}

export const detail = (company: string, id: string) =>
  getJson<DetailResponse>(`${API}/${encodeURIComponent(company)}/postings/${encodeURIComponent(id)}`);

export const jobId = (company: string, p: SrPosting) => `smartrecruiters:${company.toLowerCase()}:${p.id}`;

export function toIndexJob(
  company: string,
  p: SrPosting,
  d: DetailResponse | null,
  firstSeenAt: string,
): { job: IndexJob; description: string | null } {
  const loc = p.location ?? {};
  const location = loc.fullLocation ?? ([loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(", ") || null);
  const workplace = loc.remote ? "Remote" : loc.hybrid ? "Hybrid" : null;
  // Sections come in a fixed order: company, job, qualifications, additional info.
  const s = d?.jobAd?.sections ?? {};
  const description = ["jobDescription", "qualifications", "additionalInformation"]
    .map((k) => toText(s[k]?.text))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8_000);
  return {
    job: {
      id: jobId(company, p),
      ats: "smartrecruiters",
      company: company.toLowerCase(),
      companyName: p.company?.name?.trim() || company,
      title: (p.name ?? "").trim(),
      location,
      additionalLocations: [],
      country: loc.country ? loc.country.toUpperCase() : null,
      remote: !!loc.remote,
      remoteEligible: !!loc.remote || !!loc.hybrid,
      workplaceType: workplace,
      department: p.department?.label || p.function?.label || null,
      postedAt: isoOrNull(p.releasedDate),
      firstSeenAt,
      url: d?.postingUrl ?? `https://jobs.smartrecruiters.com/${company}/${p.id}`,
      employmentType: p.typeOfEmployment?.label ?? null,
      d: null,
    },
    description: description || null,
  };
}
