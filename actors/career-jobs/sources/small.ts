/**
 * Hiring systems used mostly by small and mid-size companies. Each publishes a
 * public job feed per company; verified 28 Sep 2026:
 *
 *   bamboohr    https://{co}.bamboohr.com/careers/list  (+ /careers/{id}/detail)   JSON
 *   breezy      https://{co}.breezy.hr/json?verbose=true                         JSON, includes descriptions and a salary string
 *   personio    https://{co}.jobs.personio.de/xml?language=en                    XML, includes descriptions
 *   rippling    https://ats.rippling.com/api/v2/board/{co}/jobs (+ /jobs/{id})    JSON, detail has structured pay
 *   teamtailor  https://{co}.teamtailor.com/jobs.rss                             RSS, includes descriptions
 *   recruitee   https://{co}.recruitee.com/api/offers/                           JSON, includes descriptions
 *
 * Skipped: JazzHR and Jobvite serve HTML only; Workable's feed 404s (and was
 * unreliable in Aug 2026); Paylocity's feed returned no jobs for any sample.
 *
 * One interface, so the crawl has one loop for all of them. `build` is only
 * called for roles not seen before, so detail requests happen once per role.
 */
import { salaryFields, type IndexJob, type Source } from "../src/format.ts";
import { extractSalary, type Period } from "../src/salary.ts";
import { getJson, isoOrNull, REMOTE_RE, toText } from "./http.ts";

export interface SmallSource<P> {
  ats: Source;
  list(company: string): Promise<P[] | null>;
  id(company: string, p: P): string;
  /** The company part of job ids, when the registry id carries more (UKG: "tenant|board" -> tenant). */
  companyKey?(company: string): string;
  build(company: string, name: string, p: P, firstSeenAt: string): Promise<{ job: IndexJob; description: string | null } | null>;
}

const UA = { "user-agent": "career-jobs-index/0.1 (+public career-site listings)" };

async function getText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
      if (r.ok) return await r.text();
      if (r.status !== 429 && r.status < 500) return null;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
  return null;
}

/** Shared shape for every small source's job. */
function job(
  ats: Source,
  company: string,
  name: string,
  f: {
    id: string;
    title: string | null | undefined;
    location: string | null;
    additional?: string[];
    country?: string | null;
    workplace?: string | null;
    remoteFlag?: boolean;
    department?: string | null;
    postedAt?: string | null;
    url: string;
    employmentType?: string | null;
    firstSeenAt: string;
    salary?: ReturnType<typeof extractSalary>;
  },
): IndexJob | null {
  const title = (f.title ?? "").trim();
  if (!title) return null;
  const remote = !!f.remoteFlag || REMOTE_RE.test([f.location ?? "", ...(f.additional ?? []), f.workplace ?? ""].join(" "));
  return {
    id: `${ats}:${company.toLowerCase()}:${f.id}`,
    ats,
    company: company.toLowerCase(),
    companyName: name,
    title,
    location: f.location,
    additionalLocations: f.additional ?? [],
    country: f.country ?? null,
    remote,
    remoteEligible: remote || /hybrid/i.test(f.workplace ?? ""),
    workplaceType: f.workplace ?? null,
    department: f.department ?? null,
    postedAt: isoOrNull(f.postedAt),
    firstSeenAt: f.firstSeenAt,
    url: f.url,
    employmentType: f.employmentType ?? null,
    d: null,
    ...(f.salary ? salaryFields({ ...f.salary, source: "structured" }) : {}),
  };
}

/** A pay string published as its own field ("$60,000 - $75,000 / year"). */
const salaryFromField = (s: string | null | undefined, country: string | null) =>
  s ? extractSalary(`Salary: ${s}`, country) : null;

// ------------------------------------------------------------------ BambooHR

interface BambooRow {
  id: string;
  jobOpeningName?: string;
  departmentLabel?: string | null;
  employmentStatusLabel?: string | null;
  location?: { city?: string | null; state?: string | null };
  atsLocation?: { country?: string | null };
  isRemote?: boolean | null;
  locationType?: string | null;
}

export const bamboohr: SmallSource<BambooRow> = {
  ats: "bamboohr",
  async list(co) {
    const r = await getJson<{ result?: BambooRow[] }>(`https://${co}.bamboohr.com/careers/list`);
    return r?.result ?? null;
  },
  id: (_co, p) => String(p.id),
  async build(co, name, p, now) {
    const d = (
      await getJson<{
        result?: {
          jobOpening?: {
            description?: string;
            datePosted?: string;
            location?: { city?: string; state?: string; addressCountry?: string };
            compensation?: string | null;
          };
        };
      }>(`https://${co}.bamboohr.com/careers/${encodeURIComponent(p.id)}/detail`)
    )?.result?.jobOpening;
    const loc = d?.location ?? p.location ?? {};
    const country = (d?.location?.addressCountry ?? p.atsLocation?.country) || null;
    const location = [loc.city, loc.state, country].filter(Boolean).join(", ") || null;
    // locationType: "0" on-site, "1" remote, "2" hybrid.
    const workplace = p.isRemote || p.locationType === "1" ? "Remote" : p.locationType === "2" ? "Hybrid" : null;
    const j = job("bamboohr", co, name, {
      id: String(p.id),
      title: p.jobOpeningName,
      location,
      country,
      workplace,
      remoteFlag: !!p.isRemote || p.locationType === "1",
      department: p.departmentLabel || null,
      postedAt: d?.datePosted,
      url: `https://${co}.bamboohr.com/careers/${p.id}`,
      employmentType: p.employmentStatusLabel || null,
      firstSeenAt: now,
      salary: salaryFromField(d?.compensation, country),
    });
    return j && { job: j, description: toText(d?.description) || null };
  },
};

// ------------------------------------------------------------------ Breezy HR

interface BreezyRow {
  id: string;
  name?: string;
  url?: string;
  published_date?: string;
  type?: { name?: string };
  location?: { name?: string; country?: { id?: string; name?: string }; is_remote?: boolean };
  locations?: Array<{ name?: string }>;
  department?: string;
  salary?: string;
  company?: { name?: string };
  description?: string;
}

export const breezy: SmallSource<BreezyRow> = {
  ats: "breezy",
  list: async (co) => getJson<BreezyRow[]>(`https://${co}.breezy.hr/json?verbose=true`).then((r) => (Array.isArray(r) ? r : null)),
  id: (_co, p) => p.id,
  async build(co, name, p, now) {
    const country = p.location?.country?.id ?? null;
    const additional = (p.locations ?? []).map((l) => l.name).filter((n): n is string => !!n && n !== p.location?.name);
    const j = job("breezy", co, p.company?.name?.trim() || name, {
      id: p.id,
      title: p.name,
      location: p.location?.name ?? null,
      additional,
      country,
      workplace: p.location?.is_remote ? "Remote" : null,
      remoteFlag: !!p.location?.is_remote,
      department: p.department || null,
      postedAt: p.published_date,
      url: p.url ?? `https://${co}.breezy.hr/p/${p.id}`,
      employmentType: p.type?.name ?? null,
      firstSeenAt: now,
      salary: salaryFromField(p.salary, country),
    });
    return j && { job: j, description: toText(p.description) || null };
  },
};

// ------------------------------------------------------------------ Personio

interface PersonioRow {
  id: string;
  name: string;
  subcompany: string | null;
  office: string | null;
  additionalOffices: string[];
  department: string | null;
  schedule: string | null;
  employmentType: string | null;
  createdAt: string | null;
  description: string;
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1].trim()) : null;
};
function decodeXml(s: string): string {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parsePersonio(xml: string): PersonioRow[] {
  return [...xml.matchAll(/<position>([\s\S]*?)<\/position>/g)].map(([, x]) => {
    const extra = tag(x, "additionalOffices");
    const sections = [...x.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)].map(
      ([, d]) => `<h3>${tag(d, "name") ?? ""}</h3>${tag(d, "value") ?? ""}`,
    );
    return {
      id: tag(x, "id") ?? "",
      name: tag(x, "name") ?? "",
      subcompany: tag(x, "subcompany"),
      office: tag(x, "office"),
      additionalOffices: extra ? [...extra.matchAll(/<office>([\s\S]*?)<\/office>/g)].map(([, o]) => decodeXml(o.trim())) : [],
      department: tag(x, "department"),
      schedule: tag(x, "schedule"),
      employmentType: tag(x, "employmentType"),
      createdAt: tag(x, "createdAt"),
      description: sections.join(""),
    };
  });
}

export const personio: SmallSource<PersonioRow> = {
  ats: "personio",
  async list(co) {
    const xml = await getText(`https://${co}.jobs.personio.de/xml?language=en`);
    return xml && xml.includes("<workzag-jobs") ? parsePersonio(xml) : null;
  },
  id: (_co, p) => p.id,
  async build(co, name, p, now) {
    const j = job("personio", co, name, {
      id: p.id,
      title: p.name,
      location: p.office,
      additional: p.additionalOffices,
      department: p.department,
      postedAt: p.createdAt,
      url: `https://${co}.jobs.personio.de/job/${p.id}`,
      employmentType: [p.schedule, p.employmentType].filter(Boolean).join(", ") || null,
      firstSeenAt: now,
    });
    return j && { job: j, description: toText(p.description) || null };
  },
};

// ------------------------------------------------------------------ Rippling

interface RipplingRow {
  id: string;
  name?: string;
  url?: string;
  department?: { name?: string };
  locations?: Array<{ name?: string; countryCode?: string; workplaceType?: string }>;
}

export const rippling: SmallSource<RipplingRow> = {
  ats: "rippling",
  async list(co) {
    const out = new Map<string, RipplingRow>();
    for (let page = 0; page < 100; page++) {
      const r = await getJson<{ items?: RipplingRow[]; totalPages?: number }>(
        `https://ats.rippling.com/api/v2/board/${encodeURIComponent(co)}/jobs?page=${page}&pageSize=100`,
      );
      if (!r) return page === 0 ? null : [...out.values()];
      // One row per job *location*: merge them back into one job.
      for (const it of r.items ?? []) {
        const prev = out.get(it.id);
        out.set(it.id, prev ? { ...prev, locations: [...(prev.locations ?? []), ...(it.locations ?? [])] } : it);
      }
      if (page + 1 >= (r.totalPages ?? 0)) break;
    }
    return [...out.values()];
  },
  id: (_co, p) => p.id,
  async build(co, name, p, now) {
    const d = await getJson<{
      description?: Record<string, string> | string;
      createdOn?: string;
      employmentType?: { id?: string };
      companyName?: string;
      payRangeDetails?: Array<{ currency?: string; frequency?: string; rangeStart?: number; rangeEnd?: number }>;
    }>(`https://ats.rippling.com/api/v2/board/${encodeURIComponent(co)}/jobs/${encodeURIComponent(p.id)}`);
    const locs = (p.locations ?? []).map((l) => l.name).filter((n): n is string => !!n);
    const workplace = p.locations?.find((l) => l.workplaceType)?.workplaceType?.replace("_", "-").toLowerCase() ?? null;
    // Description is split into sections; the "company" blurb is the same on every job.
    const desc =
      typeof d?.description === "string"
        ? d.description
        : Object.entries(d?.description ?? {})
            .filter(([k]) => k !== "company")
            .map(([, v]) => v)
            .join("\n");
    const pay = d?.payRangeDetails?.find((r) => r.currency && (r.rangeStart || r.rangeEnd));
    const period = ({ HOUR: "hour", DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" } as Record<string, Period>)[pay?.frequency ?? ""];
    const annual = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
    const salary =
      pay && period
        ? {
            min: pay.rangeStart ?? pay.rangeEnd!,
            max: pay.rangeEnd ?? pay.rangeStart!,
            currency: pay.currency!,
            period,
            annualMin: Math.round((pay.rangeStart ?? pay.rangeEnd!) * annual[period]),
            annualMax: Math.round((pay.rangeEnd ?? pay.rangeStart!) * annual[period]),
            text: `${pay.currency} ${pay.rangeStart} - ${pay.rangeEnd} per ${period}`,
            source: "structured" as const,
          }
        : null;
    const j = job("rippling", co, d?.companyName?.trim() || name, {
      id: p.id,
      title: p.name,
      location: locs[0] ?? null,
      additional: locs.slice(1),
      country: p.locations?.[0]?.countryCode ?? null,
      workplace,
      remoteFlag: workplace === "remote",
      department: p.department?.name ?? null,
      postedAt: d?.createdOn,
      url: p.url ?? `https://ats.rippling.com/${co}/jobs/${p.id}`,
      employmentType: d?.employmentType?.id ?? null,
      firstSeenAt: now,
      salary,
    });
    return j && { job: j, description: toText(desc) || null };
  },
};

// ------------------------------------------------------------------ Teamtailor

interface TeamtailorRow {
  guid: string;
  title: string;
  link: string;
  pubDate: string | null;
  remoteStatus: string | null;
  department: string | null;
  locations: Array<{ name: string | null; country: string | null }>;
  description: string;
}

export function parseTeamtailor(xml: string): { company: string | null; rows: TeamtailorRow[] } {
  const channel = xml.match(/<channel>\s*<title>([\s\S]*?)<\/title>/);
  const rows = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({
    guid: tag(x, "guid") ?? tag(x, "link") ?? "",
    title: tag(x, "title") ?? "",
    link: tag(x, "link") ?? "",
    pubDate: tag(x, "pubDate"),
    remoteStatus: tag(x, "remoteStatus"),
    department: tag(x, "tt:department"),
    locations: [...x.matchAll(/<tt:location>([\s\S]*?)<\/tt:location>/g)].map(([, l]) => ({
      name: tag(l, "tt:name") ?? tag(l, "tt:city"),
      country: tag(l, "tt:country"),
    })),
    description: tag(x, "description") ?? "",
  }));
  return { company: channel ? decodeXml(channel[1].trim()) : null, rows };
}

export const teamtailor: SmallSource<TeamtailorRow> = {
  ats: "teamtailor",
  async list(co) {
    const xml = await getText(`https://${co}.teamtailor.com/jobs.rss`);
    return xml && xml.includes("<rss") ? parseTeamtailor(xml).rows : null;
  },
  id: (_co, p) => p.guid,
  async build(co, name, p, now) {
    const locs = p.locations.map((l) => [l.name, l.country].filter(Boolean).join(", ")).filter(Boolean);
    const workplace = p.remoteStatus && p.remoteStatus !== "none" ? p.remoteStatus[0].toUpperCase() + p.remoteStatus.slice(1) : null;
    const j = job("teamtailor", co, name, {
      id: p.guid,
      title: p.title,
      location: locs[0] ?? null,
      additional: locs.slice(1),
      country: p.locations[0]?.country ?? null,
      workplace,
      remoteFlag: p.remoteStatus === "fully",
      department: p.department,
      postedAt: p.pubDate,
      url: p.link,
      firstSeenAt: now,
    });
    return j && { job: j, description: toText(p.description) || null };
  },
};

// ------------------------------------------------------------------ Recruitee

interface RecruiteeRow {
  id: number;
  title?: string;
  careers_url?: string;
  location?: string;
  country_code?: string;
  remote?: boolean;
  hybrid?: boolean;
  department?: string | null;
  published_at?: string;
  employment_type_code?: string;
  company_name?: string;
  description?: string;
  requirements?: string;
  salary?: { min?: string | number | null; max?: string | number | null; currency?: string | null; period?: string | null } | null;
}

export const recruitee: SmallSource<RecruiteeRow> = {
  ats: "recruitee",
  list: async (co) => (await getJson<{ offers?: RecruiteeRow[] }>(`https://${co}.recruitee.com/api/offers/`))?.offers ?? null,
  id: (_co, p) => String(p.id),
  async build(co, name, p, now) {
    const s = p.salary;
    const period = ({ hour: "hour", day: "day", week: "week", month: "month", year: "year" } as Record<string, Period>)[s?.period ?? ""];
    const min = Number(s?.min ?? s?.max);
    const max = Number(s?.max ?? s?.min);
    const salary =
      s?.currency && period && min > 0
        ? (extractSalary(`Salary: ${s.currency} ${min} - ${s.currency} ${max} per ${period}`, p.country_code ?? null) ?? null)
        : null;
    const j = job("recruitee", co, p.company_name?.trim() || name, {
      id: String(p.id),
      title: p.title,
      location: p.location ?? null,
      country: p.country_code?.toUpperCase() ?? null,
      workplace: p.remote ? "Remote" : p.hybrid ? "Hybrid" : null,
      remoteFlag: !!p.remote,
      department: p.department ?? null,
      postedAt: p.published_at,
      url: p.careers_url ?? `https://${co}.recruitee.com/o/${p.id}`,
      employmentType: p.employment_type_code ?? null,
      firstSeenAt: now,
      salary,
    });
    return j && { job: j, description: toText([p.description, p.requirements].filter(Boolean).join("<br>")) || null };
  },
};


// ------------------------------------------------------------------ UKG (UltiPro)

/**
 * UKG Pro Recruiting job boards. List: POST .../JobBoardView/LoadSearchResults
 * (paged). The detail page embeds the full opportunity as JSON, including the
 * description and structured pay when the employer publishes it.
 * Company id here is "{tenant}|{boardId}" -- a tenant can run several boards.
 */
interface UkgRow {
  Id: string;
  Title?: string;
  RequisitionNumber?: string;
  FullTime?: boolean;
  JobCategoryName?: string;
  PostedDate?: string;
  JobLocationType?: number;
  Locations?: Array<{ LocalizedName?: string | null; Address?: { City?: string; State?: { Code?: string }; Country?: { Code?: string; Name?: string } } }>;
}

/** Registry id: "host|tenant|board" (UKG runs recruiting. and recruiting2. hosts; a tenant answers on one only). */
const ukgParts = (co: string) => {
  const p = co.split("|");
  return p.length === 3 ? { host: p[0], tenant: p[1], board: p[2] } : { host: "recruiting.ultipro.com", tenant: p[0], board: p[1] };
};
const ukgBase = (co: string) => {
  const { host, tenant, board } = ukgParts(co);
  return `https://${host}/${tenant}/JobBoard/${board}`;
};

export const ukg: SmallSource<UkgRow> = {
  ats: "ukg",
  companyKey: (co) => ukgParts(co).tenant,
  async list(co) {
    const out: UkgRow[] = [];
    for (let skip = 0; skip < 20_000; skip += 50) {
      const r = await getJson<{ totalCount?: number; opportunities?: UkgRow[] }>(`${ukgBase(co)}/JobBoardView/LoadSearchResults`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunitySearch: { Top: 50, Skip: skip, QueryString: "", OrderBy: [], Filters: [] } }),
      });
      if (!r) return skip === 0 ? null : out;
      out.push(...(r.opportunities ?? []));
      if (!r.opportunities?.length || out.length >= (r.totalCount ?? 0)) break;
    }
    return out;
  },
  id: (_co, p) => p.Id,
  async build(co, name, p, now) {
    const html = await getText(`${ukgBase(co)}/OpportunityDetail?opportunityId=${encodeURIComponent(p.Id)}`);
    const m = html?.match(/new US\.Opportunity\.CandidateOpportunityDetail\((\{[\s\S]*?\})\);/);
    let d: Record<string, unknown> | null = null;
    try {
      d = m ? (JSON.parse(m[1]) as Record<string, unknown>) : null;
    } catch {
      d = null;
    }
    const locs = (p.Locations ?? []).map((l) => {
      const a = l.Address;
      return [a?.City, a?.State?.Code, a?.Country?.Code].filter(Boolean).join(", ") || l.LocalizedName || "";
    }).filter(Boolean);
    const country = p.Locations?.[0]?.Address?.Country?.Code ?? null;
    // JobLocationType: 1 on-site, 2 remote, 3 hybrid (as shown on UKG boards).
    const workplace = p.JobLocationType === 2 ? "Remote" : p.JobLocationType === 3 ? "Hybrid" : null;
    const cur = (d?.CompensationCurrencyCode as string | null) ?? (d?.PayRangeCurrencyCode as string | null) ?? null;
    const aMin = d?.CompensationAnnualMinimum as number | null, aMax = d?.CompensationAnnualMaximum as number | null;
    const hMin = d?.CompensationHourlyMinimum as number | null, hMax = d?.CompensationHourlyMaximum as number | null;
    const salary =
      cur && (aMin || aMax)
        ? extractSalary(`Salary: ${cur} ${aMin ?? aMax} - ${cur} ${aMax ?? aMin} per year`, country)
        : cur && (hMin || hMax)
          ? extractSalary(`Pay: ${cur} ${hMin ?? hMax} - ${cur} ${hMax ?? hMin} per hour`, country)
          : null;
    const j = job("ukg", ukgParts(co).tenant, name, {
      id: p.Id,
      title: p.Title,
      location: locs[0] ?? null,
      additional: locs.slice(1),
      country,
      workplace,
      remoteFlag: p.JobLocationType === 2,
      department: p.JobCategoryName ?? null,
      postedAt: p.PostedDate,
      url: `${ukgBase(co)}/OpportunityDetail?opportunityId=${p.Id}`,
      employmentType: p.FullTime === undefined ? null : p.FullTime ? "Full time" : "Part time",
      firstSeenAt: now,
      salary,
    });
    return j && { job: j, description: toText((d?.Description as string) ?? "") || null };
  },
};

/** The index id of a small-source job -- used by the crawl before `build` runs, so it must match `job()`. */
export const smallJobId = <P>(src: SmallSource<P>, co: string, p: P) =>
  `${src.ats}:${(src.companyKey?.(co) ?? co).toLowerCase()}:${src.id(co, p)}`;

export { ukgParts };
export const SMALL_SOURCES = [bamboohr, breezy, personio, rippling, teamtailor, recruitee, ukg] as SmallSource<unknown>[];
