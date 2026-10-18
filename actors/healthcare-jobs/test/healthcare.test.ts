import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndexJob } from "../src/format.ts";
import { makeHealthMatcher, toRecord, type HealthQuery } from "../src/healthcare.ts";

const NOW = Date.parse("2026-10-17T12:00:00Z");

const job = (o: Partial<IndexJob>): IndexJob => ({
  id: "x",
  ats: "workday",
  company: "ssmh",
  companyName: "SSM Health",
  title: "Registered Nurse - ICU - Nights",
  location: "Saint Louis, MO",
  additionalLocations: [],
  country: "US",
  remote: false,
  remoteEligible: false,
  workplaceType: null,
  department: "Nursing",
  postedAt: "2026-10-15T00:00:00.000Z",
  firstSeenAt: "2026-10-15T08:00:00.000Z",
  url: "https://example.org/job/1",
  employmentType: "Full time",
  d: null,
  ...o,
});

const q = (o: Partial<HealthQuery> = {}): HealthQuery => ({ maxJobs: 100, ...o });
const run = (query: HealthQuery, j: IndexJob, tags: Record<string, never> | Record<string, unknown> = {}) =>
  makeHealthMatcher(query, (x) => tags[x.id] as never, NOW)(j);

test("only jobs at mapped US health systems qualify", () => {
  assert.equal(run(q(), job({}))?.system.name, "SSM Health");
  assert.equal(run(q(), job({ ats: "greenhouse", company: "stripe", companyName: "Stripe" })), null);
  // HCA's Workday tenant is HCA Healthcare UK, which is not mapped.
  assert.equal(run(q(), job({ company: "hcahealthcare", companyName: "HCA Healthcare UK" })), null);
});

test("system filters: name, home state, size", () => {
  assert.ok(run(q({ healthSystems: ["ssm"] }), job({})));
  assert.equal(run(q({ healthSystems: ["ascension"] }), job({})), null);
  assert.ok(run(q({ systemStates: ["mo"] }), job({})));
  assert.equal(run(q({ systemStates: ["TX"] }), job({})), null);
  assert.equal(run(q({ minSystemBeds: 100_000 }), job({})), null);
});

test("clinical filters use the published tags, or title-only tags when a job has none", () => {
  const h = run(q({ roleFamilies: ["Registered nurse"], specialties: ["ICU"], shifts: ["nights"] }), job({}));
  assert.equal(h?.tags.roleType, null);
  assert.deepEqual(h?.tags.specialties, ["ICU"]);
  assert.equal(run(q({ roleFamilies: ["Physician"] }), job({})), null);
  assert.equal(run(q({ employment: ["per diem"] }), job({})), null);
  assert.ok(run(q({ employment: ["per diem"] }), job({ title: "RN ICU PRN Nights" })));

  // A bonus is only known from the description, i.e. from the published tags.
  assert.equal(run(q({ onlySignOnBonus: true }), job({})), null);
  const published = {
    x: { roleFamily: "Registered nurse", roleType: null, specialties: ["ICU"], shift: ["nights"], shiftHours: 12, employment: "full time", signOnBonus: true, signOnBonusAmount: 15000, licenses: ["RN license", "BLS"] },
  };
  assert.ok(run(q({ onlySignOnBonus: true }), job({}), published));
  assert.ok(run(q({ minSignOnBonus: 10_000 }), job({}), published));
  assert.equal(run(q({ minSignOnBonus: 20_000 }), job({}), published), null);
});

test("pay and general filters", () => {
  const hourly = job({ salaryMin: 38, salaryMax: 57, salaryPeriod: "hour", salaryCurrency: "USD" });
  assert.ok(run(q({ minHourlyRate: 50 }), hourly));
  assert.equal(run(q({ minHourlyRate: 60 }), hourly), null);
  assert.equal(run(q({ minHourlyRate: 20 }), job({ salaryMin: 90000, salaryMax: 120000, salaryPeriod: "year" })), null);
  assert.ok(run(q({ titleKeywords: ["RN", "registered nurse"] }), job({})));
  assert.equal(run(q({ titleKeywords: ["pharmacist"] }), job({})), null);
  assert.equal(run(q({ postedWithinDays: 1 }), job({})), null);
});

test("record: job, system and tags in one flat row; internals left out", () => {
  const h = run(q(), job({ salaryMin: 38, salaryMax: 57, salaryPeriod: "hour", salaryCurrency: "USD" }))!;
  const r = toRecord(h, "2026-10-17T08:33:00.000Z", undefined);
  assert.equal(r.healthSystem, "SSM Health");
  assert.equal(r.healthSystemState, "MO");
  assert.equal(r.roleFamily, "Registered nurse");
  assert.deepEqual(r.shift, ["nights"]);
  assert.equal(r.salaryMax, 57);
  assert.equal("d" in r, false);
  assert.equal("description" in r, false);
  assert.equal(toRecord(h, "", "Care for patients").description, "Care for patients");
});

test("shared files are exact copies of the Career API's (edit them there, then copy)", () => {
  for (const f of ["src/format.ts", "src/search.ts", "src/health.ts", "src/clinical.ts", "src/standby.ts", "sources/health-systems.json"]) {
    const ours = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    const theirs = readFileSync(new URL(`../../career-jobs/${f}`, import.meta.url), "utf8");
    assert.equal(ours, theirs, `${f} differs from actors/career-jobs/${f}`);
  }
});
