import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndexJob } from "../src/format.ts";
import { makeMatcher } from "../src/search.ts";
import { CompanyRollup, careerSiteUrl, displayName } from "../src/companies.ts";
import { monitorKey } from "../src/monitor.ts";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function job(p: Partial<IndexJob> & { id: string }): IndexJob {
  return {
    ats: "greenhouse", company: "acme", companyName: "Acme", title: "Engineer", location: "New York, NY",
    additionalLocations: [], country: "United States", remote: false, remoteEligible: false, workplaceType: null,
    department: null, postedAt: day(1), firstSeenAt: day(1), url: "https://job-boards.greenhouse.io/acme/jobs/1",
    employmentType: null, d: null, ...p,
  };
}

function rollup(jobs: IndexJob[], titleKeywords: string[], seenAfter?: string) {
  const r = new CompanyRollup(makeMatcher({ titleKeywords, maxJobs: Infinity }, NOW), seenAfter, NOW);
  for (const j of jobs) r.add(j);
  return r;
}

const jobs = [
  job({ id: "1", title: "Salesforce Administrator", department: "IT", postedAt: day(2), salaryCurrency: "USD", salaryAnnualMin: 90000, salaryAnnualMax: 120000 }),
  job({ id: "2", title: "Senior Salesforce Developer", department: "IT", postedAt: day(20), firstSeenAt: day(20), remote: true, salaryCurrency: "USD", salaryAnnualMin: 130000, salaryAnnualMax: 160000 }),
  job({ id: "3", title: "Account Executive", department: "Sales", postedAt: day(3) }),
  job({ id: "4", title: "Office Manager", postedAt: day(90), firstSeenAt: day(90) }),
  job({ id: "5", ats: "lever", company: "big-co", companyName: "big-co", title: "Salesforce Admin", postedAt: day(40), firstSeenAt: day(40), url: "https://jobs.lever.co/big-co/abc" }),
];

test("rolls matching roles and company-wide totals into one row per company", () => {
  const { companies, totalMatchingCompanies } = rollup(jobs, ["salesforce"]).results({ maxCompanies: 10 });
  assert.equal(totalMatchingCompanies, 2);
  const acme = companies[0];
  assert.equal(acme.companyName, "Acme");
  assert.equal(acme.matchingJobs, 2);
  assert.equal(acme.matchingJobsNewLast7Days, 1);
  assert.equal(acme.matchingJobsNewLast30Days, 2);
  assert.equal(acme.totalOpenJobs, 4);
  assert.equal(acme.newJobsLast30Days, 3);
  assert.equal(acme.hiringGrowth, 0.75);
  assert.equal(acme.matchingRemoteJobs, 1);
  assert.deepEqual(acme.topDepartments, [{ name: "IT", jobs: 2 }]);
  assert.equal(acme.salaryMin, 90000);
  assert.equal(acme.salaryMax, 160000);
  assert.equal(acme.salaryCurrency, "USD");
  // Newest first.
  assert.deepEqual(acme.sampleJobs.map((s) => s.title), ["Salesforce Administrator", "Senior Salesforce Developer"]);
  assert.equal(acme.careerSiteUrl, "https://job-boards.greenhouse.io/acme");
  assert.equal(companies[1].companyName, "Big Co");
});

test("company filters and sorting", () => {
  const r = rollup(jobs, ["salesforce"]);
  assert.equal(r.results({ maxCompanies: 10, minMatchingJobs: 2 }).companies.length, 1);
  assert.equal(r.results({ maxCompanies: 10, maxTotalOpenJobs: 1 }).companies[0].companyId, "big-co");
  assert.equal(r.results({ maxCompanies: 10, minTotalOpenJobs: 2 }).companies.length, 1);
  assert.equal(r.results({ maxCompanies: 1 }).companies.length, 1);
  assert.equal(r.results({ maxCompanies: 1 }).totalMatchingCompanies, 2);
  assert.equal(r.results({ maxCompanies: 10, sortBy: "newMatchingJobs" }).companies[0].companyId, "acme");
});

test("only companies with matching roles new since the last run", () => {
  const r = rollup(jobs, ["salesforce"], day(10));
  const { companies } = r.results({ maxCompanies: 10, seenAfter: day(10) });
  assert.deepEqual(companies.map((c) => c.companyId), ["acme"]);
  assert.equal(companies[0].matchingJobsNewSinceLastRun, 1);
});

test("stale roles are left out of every count", () => {
  const old = [...jobs, job({ id: "z", company: "ghost", companyName: "Ghost", title: "Salesforce Admin", postedAt: day(3000), firstSeenAt: day(3) })];
  const r = new CompanyRollup(makeMatcher({ titleKeywords: ["salesforce"], maxJobs: Infinity }, NOW), undefined, NOW, 365);
  for (const j of old) r.add(j);
  const ids = r.results({ maxCompanies: 10 }).companies.map((c) => c.companyId);
  assert.ok(!ids.includes("ghost"));
  assert.equal(r.jobsStale, 1);
  const keepAll = new CompanyRollup(makeMatcher({ titleKeywords: ["salesforce"], maxJobs: Infinity }, NOW), undefined, NOW, null);
  for (const j of old) keepAll.add(j);
  assert.ok(keepAll.results({ maxCompanies: 10 }).companies.some((c) => c.companyId === "ghost"));
});

test("undated roles only count as new once the index has watched the company for the whole window", () => {
  // Jobvite-style board, no posting dates. The index first saw the company 10 days ago:
  // its first crawl's roles have an unknown age, not "new this month".
  const fresh = [
    ...Array.from({ length: 8 }, (_, i) => job({ id: `f${i}`, company: "jbs", companyName: "JBS", ats: "jobvite", title: "Salesforce Analyst", postedAt: null, firstSeenAt: day(10) })),
    job({ id: "f8", company: "jbs", companyName: "JBS", ats: "jobvite", title: "Line Worker", postedAt: null, firstSeenAt: day(2) }),
  ];
  // Same board, but watched for 60 days: first-seen dates now prove age.
  const watched = [
    ...Array.from({ length: 6 }, (_, i) => job({ id: `w${i}`, company: "old", companyName: "Old", ats: "jobvite", title: "Salesforce Analyst", postedAt: null, firstSeenAt: day(60) })),
    job({ id: "w6", company: "old", companyName: "Old", ats: "jobvite", title: "Salesforce Analyst", postedAt: null, firstSeenAt: day(20) }),
    job({ id: "w7", company: "old", companyName: "Old", ats: "jobvite", title: "Line Worker", postedAt: null, firstSeenAt: day(3) }),
  ];
  const r = rollup([...fresh, ...watched, ...jobs], []);
  const by = (id: string) => r.results({ maxCompanies: 10 }).companies.find((c) => c.companyId === id)!;

  const jbs = by("jbs");
  assert.equal(jbs.newJobsLast30Days, 0);
  assert.equal(jbs.hiringGrowth, null);
  // Watched for 10 days: the 7-day window is covered, the role seen 2 days ago is new this week.
  assert.equal(jbs.newJobsLast7Days, 1);

  const old = by("old");
  assert.equal(old.newJobsLast30Days, 2);
  assert.equal(old.newJobsLast7Days, 1);
  assert.equal(old.hiringGrowth, 0.25);

  // Matching counts follow the same rule.
  const m = rollup([...fresh, ...watched], ["salesforce"]).results({ maxCompanies: 10 }).companies;
  assert.equal(m.find((c) => c.companyId === "jbs")!.matchingJobsNewLast30Days, 0);
  assert.equal(m.find((c) => c.companyId === "old")!.matchingJobsNewLast30Days, 1);

  // Unknown growth sorts last, after a company with any known growth.
  const sorted = r.results({ maxCompanies: 10, sortBy: "hiringGrowth" }).companies.map((c) => c.companyId);
  assert.equal(sorted.at(-1), "jbs");
});

test("growth counts only roles of known age, and needs at least half of them", () => {
  const mixed = [
    // 3 dated (2 new), 1 undated from the first crawl: growth 2/3 over known-age roles.
    job({ id: "a", postedAt: day(1) }), job({ id: "b", postedAt: day(5) }), job({ id: "c", postedAt: day(200), firstSeenAt: day(5) }),
    job({ id: "d", postedAt: null, firstSeenAt: day(5) }),
    // 1 dated, 2 undated of unknown age: too few known to say.
    job({ id: "e", company: "thin", postedAt: day(1) }),
    job({ id: "f", company: "thin", postedAt: null, firstSeenAt: day(5) }), job({ id: "g", company: "thin", postedAt: null, firstSeenAt: day(5) }),
  ];
  const cs = rollup(mixed, []).results({ maxCompanies: 10 }).companies;
  assert.equal(cs.find((c) => c.companyId === "acme")!.hiringGrowth, 0.67);
  assert.equal(cs.find((c) => c.companyId === "thin")!.hiringGrowth, null);
});

test("keeps the 5 newest sample roles", () => {
  const many = Array.from({ length: 12 }, (_, i) => job({ id: `m${i}`, title: `Salesforce ${i}`, postedAt: day(i) }));
  const [c] = rollup(many, ["salesforce"]).results({ maxCompanies: 1 }).companies;
  assert.deepEqual(c.sampleJobs.map((s) => s.title), ["Salesforce 0", "Salesforce 1", "Salesforce 2", "Salesforce 3", "Salesforce 4"]);
});

test("career site links per hiring system", () => {
  assert.equal(careerSiteUrl("workday", "pwc", "https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers/job/Pune/IN-Manager_758634WD-1"), "https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers");
  assert.equal(careerSiteUrl("smartrecruiters", "necsws", "https://jobs.smartrecruiters.com/NECSWS/744000155467174-product-owner"), "https://jobs.smartrecruiters.com/NECSWS");
  assert.equal(careerSiteUrl("ukg", "x", "https://recruiting2.ultipro.com/QUA1012QBPC/JobBoard/0a83d4df/OpportunityDetail?opportunityId=1"), "https://recruiting2.ultipro.com/QUA1012QBPC/JobBoard/0a83d4df");
  assert.equal(careerSiteUrl("personio", "x", "https://1sp-agency.jobs.personio.de/job/2842274"), "https://1sp-agency.jobs.personio.de");
  assert.equal(careerSiteUrl("bamboohr", "ri", "https://ri.bamboohr.com/careers/496"), "https://ri.bamboohr.com/careers");
  assert.equal(careerSiteUrl("teamtailor", "x", "https://empleo.leroymerlin.es/jobs/8544905-vendedor"), "https://empleo.leroymerlin.es");
  assert.equal(careerSiteUrl("recruitee", "x", "https://careersdeltacapita.recruitee.com/o/vpdirector"), "https://careersdeltacapita.recruitee.com");
  assert.equal(careerSiteUrl("oracle", "x", "https://fa-eqvg-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/7534"), "https://fa-eqvg-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1");
  assert.equal(careerSiteUrl("jobvite", "ookla", "https://jobs.jobvite.com/ookla/job/oGPIAfwx"), "https://jobs.jobvite.com/ookla");
  assert.equal(careerSiteUrl("workable", "fuku", "https://apply.workable.com/j/7EA27C61ED"), "https://apply.workable.com/fuku/");
});

test("display names", () => {
  assert.equal(displayName("elevenlabs", "elevenlabs"), "Elevenlabs");
  assert.equal(displayName("cullen-jewellery", "cullen-jewellery"), "Cullen Jewellery");
  assert.equal(displayName("Morgan Stanley", "ms"), "Morgan Stanley");
});

test("monitor key ignores order and case", () => {
  assert.equal(monitorKey({ titleKeywords: ["B", "a"], sortBy: "x" }, undefined), monitorKey({ sortBy: "x", titleKeywords: ["A", "b"] }, undefined));
});

test("shared index code stays in sync with the Career API actor", () => {
  for (const f of ["format.ts", "search.ts"]) {
    const ours = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    const theirs = readFileSync(new URL(`../../career-jobs/src/${f}`, import.meta.url), "utf8");
    assert.equal(ours, theirs, `${f} differs from actors/career-jobs/src/${f}; copy it over`);
  }
});
