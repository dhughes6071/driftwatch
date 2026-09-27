/**
 * Oracle Recruiting Cloud ("Candidate Experience") career sites.
 *
 * Each site is a single-page app over a public REST API -- the same pattern as
 * Workday, verified 27 Sep 2026 on JPMorgan Chase (7,496 roles):
 *   list:   GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *           ?onlyData=true&expand=requisitionList.secondaryLocations
 *           &finder=findReqs;siteNumber={site},limit=200,offset=N,sortBy=POSTING_DATES_DESC
 *   detail: GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails
 *           ?expand=all&onlyData=true&finder=ById;Id="{id}",siteNumber={site}
 *
 * Unlike Workday: pages go up to 200, and there is no hidden cap -- offsets
 * run to the true total (TotalJobsCount), so no facet splitting is needed.
 */
import type { IndexJob } from "../src/format.ts";
import { getJson, isoOrNull, REMOTE_RE, toText } from "./http.ts";

export interface OracleSite {
  /** e.g. "jpmc.fa.oraclecloud.com" */
  host: string;
  /** e.g. "CX_1001" */
  site: string;
  /** Display name, hand-assigned (Oracle publishes none usable). */
  name?: string;
}

export interface OraclePosting {
  Id: string;
  Title: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  WorkplaceType?: string;
  JobFamily?: string;
  JobSchedule?: string;
  secondaryLocations?: Array<{ Name?: string }>;
}

interface ListResponse {
  items?: Array<{ TotalJobsCount?: number; requisitionList?: OraclePosting[] }>;
}

interface DetailResponse {
  items?: Array<{
    ExternalDescriptionStr?: string;
    ExternalResponsibilitiesStr?: string;
    ExternalQualificationsStr?: string;
    ExternalPostedStartDate?: string;
    JobSchedule?: string;
    WorkplaceType?: string;
  }>;
}

const PAGE = 200;
const api = (s: OracleSite) => `https://${s.host}/hcmRestApi/resources/latest`;

/** Short, stable company id from the host: "jpmc.fa.oraclecloud.com" -> "jpmc". */
export const tenantOf = (s: OracleSite) => s.host.split(".")[0];

export async function listPage(s: OracleSite, offset: number, limit = PAGE) {
  const url =
    `${api(s)}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations` +
    `&finder=findReqs;siteNumber=${encodeURIComponent(s.site)},limit=${limit},offset=${offset},sortBy=POSTING_DATES_DESC`;
  const r = await getJson<ListResponse>(url);
  const item = r?.items?.[0];
  return item ? { total: item.TotalJobsCount ?? 0, rows: item.requisitionList ?? [] } : null;
}

/** Every posting on a site. Null when the site does not answer at all. */
export async function listAll(s: OracleSite): Promise<OraclePosting[] | null> {
  const first = await listPage(s, 0);
  if (!first) return null;
  const out = [...first.rows];
  for (let offset = PAGE; offset < first.total; offset += PAGE) {
    const next = await listPage(s, offset);
    if (!next || next.rows.length === 0) break;
    out.push(...next.rows);
  }
  return out;
}

export async function detail(s: OracleSite, id: string) {
  const url =
    `${api(s)}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true` +
    `&finder=ById;Id=%22${encodeURIComponent(id)}%22,siteNumber=${encodeURIComponent(s.site)}`;
  return (await getJson<DetailResponse>(url))?.items?.[0] ?? null;
}

export const jobId = (s: OracleSite, p: OraclePosting) => `oracle:${tenantOf(s)}:${p.Id}`;

export function toIndexJob(
  s: OracleSite,
  p: OraclePosting,
  d: Awaited<ReturnType<typeof detail>>,
  firstSeenAt: string,
): { job: IndexJob; description: string | null } {
  const additional = (p.secondaryLocations ?? []).map((l) => l.Name).filter((n): n is string => !!n);
  const workplace = d?.WorkplaceType || p.WorkplaceType || null;
  const location = p.PrimaryLocation ?? null;
  const remote = REMOTE_RE.test([location ?? "", ...additional, workplace ?? ""].join(" "));
  const description = d
    ? [d.ExternalDescriptionStr, d.ExternalResponsibilitiesStr, d.ExternalQualificationsStr]
        .map((h) => toText(h))
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 8_000)
    : "";
  return {
    job: {
      id: jobId(s, p),
      ats: "oracle",
      company: tenantOf(s),
      companyName: s.name ?? tenantOf(s),
      title: p.Title.trim(),
      location,
      additionalLocations: additional,
      country: p.PrimaryLocationCountry ?? null,
      remote,
      remoteEligible: remote,
      workplaceType: workplace,
      department: p.JobFamily || null,
      postedAt: isoOrNull(d?.ExternalPostedStartDate ?? p.PostedDate),
      firstSeenAt,
      url: `https://${s.host}/hcmUI/CandidateExperience/en/sites/${s.site}/job/${p.Id}`,
      employmentType: d?.JobSchedule || p.JobSchedule || null,
      d: null,
    },
    description: description || null,
  };
}
