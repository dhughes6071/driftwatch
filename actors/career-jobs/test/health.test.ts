import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HEALTH_SYSTEMS, healthSystemFor } from "../src/health.ts";
import { cleanPlace, hostKey, icims, parsePhenomDetail, phenom } from "../sources/small.ts";

const NOW = "2026-10-16T12:00:00.000Z";
const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

test("health-system registry: every AHRQ system once, every source key well-formed and owned by one system", () => {
  assert.equal(HEALTH_SYSTEMS.length, 639);
  assert.equal(new Set(HEALTH_SYSTEMS.map((s) => s.id)).size, 639);
  const keys = HEALTH_SYSTEMS.flatMap((s) => s.sources);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z]+:[a-z0-9._-]+$/, k);
  // Largest first, so "the top N systems" is a slice.
  for (let i = 1; i < HEALTH_SYSTEMS.length; i++) assert.ok(HEALTH_SYSTEMS[i - 1].beds >= HEALTH_SYSTEMS[i].beds);
});

test("every mapped career site is actually crawled", () => {
  const crawled = new Set<string>([
    ...read("../../workday-jobs/src/sites.json").map((s: { tenant: string }) => `workday:${s.tenant.toLowerCase()}`),
    ...read("../sources/oracle-sites.json").map((s: { host: string }) => `oracle:${s.host.split(".")[0]}`),
    ...read("../sources/smartrecruiters.json").map((s: { id: string }) => `smartrecruiters:${s.id.toLowerCase()}`),
    ...read("../sources/jobvite.json").map((s: { id: string }) => `jobvite:${s.id.toLowerCase()}`),
    ...read("../sources/phenom.json").map((s: { id: string }) => `phenom:${hostKey(s.id)}`),
    ...read("../sources/icims.json").map((s: { id: string }) => `icims:${hostKey(s.id)}`),
    ...read("../sources/icims-portals.json").map((s: { id: string }) => `icims:${s.id.split(".")[0]}`),
    ...read("../sources/talentbrew.json").map((s: { id: string }) => `talentbrew:${hostKey(s.id)}`),
    ...read("../sources/taleo.json").map((s: { id: string }) => `taleo:${s.id.split("|")[0]}`),
  ]);
  for (const k of HEALTH_SYSTEMS.flatMap((s) => s.sources)) assert.ok(crawled.has(k), `${k} is mapped but not in any crawl registry`);
});

test("healthSystemFor finds a job's system by source and company", () => {
  assert.equal(healthSystemFor("workday", "ssmh")?.name, "SSM Health");
  assert.equal(healthSystemFor("icims", "BJC")?.name, "BJC Healthcare");
  assert.equal(healthSystemFor("workday", "trinityhealth")?.state, "MI");
  // HCA's Workday tenant is HCA Healthcare UK, not the US system.
  assert.equal(healthSystemFor("workday", "hcahealthcare"), null);
  assert.equal(healthSystemFor("greenhouse", "stripe"), null);
});

test("cleanPlace drops blank and repeated location parts", () => {
  assert.equal(cleanPlace("United States, \u200b, United States"), "United States");
  assert.equal(cleanPlace("Largo, Maryland, United States"), "Largo, Maryland, United States");
  assert.equal(cleanPlace("New York, New York, United States"), "New York, New York, United States");
});

test("hostKey: the company part of a career-site host", () => {
  assert.equal(hostKey("jobs.bswhealth.com"), "bswhealth");
  assert.equal(hostKey("www.osfcareers.org"), "osfcareers");
});

test("Phenom: description from the job page's phApp.ddo, fields from the list row", async () => {
  const page = `<script>phApp.ddo = {"jobDetail":{"data":{"job":{"description":"<p>Care for patients</p>","postedDate":"2026-10-09T12:07:51.000+0000"}}}}; phApp.experimentData = {};</script>`;
  assert.equal(parsePhenomDetail(page)?.description, "<p>Care for patients</p>");
  assert.equal(parsePhenomDetail("<html></html>"), null);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(page)) as typeof fetch;
  try {
    const built = await phenom.build("jobs.bswhealth.com", "Baylor Scott & White Health", {
      jobId: "26018737", jobSeqNo: "BSWHUS26018737EXTERNALENUS", title: " Access Services Rep 2 ",
      multi_location: ["Mckinney, Texas, United States", "Plano, Texas, United States"], country: "United States",
      category: "Patient Access", type: "Full time", postedDate: "2026-10-09T12:07:51.000+0000",
    }, NOW);
    assert.equal(built?.job.id, "phenom:bswhealth:BSWHUS26018737EXTERNALENUS");
    assert.equal(built?.job.title, "Access Services Rep 2");
    assert.equal(built?.job.location, "Mckinney, Texas, United States");
    assert.deepEqual(built?.job.additionalLocations, ["Plano, Texas, United States"]);
    assert.equal(built?.job.url, "https://jobs.bswhealth.com/us/en/job/26018737");
    assert.equal(built?.job.postedAt, "2026-10-09T12:07:51.000Z");
    assert.equal(built?.description, "Care for patients");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Phenom list: splits by category until each slice fits in one request; a failed slice fails the list", async () => {
  const realFetch = globalThis.fetch;
  const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ jobId: `${p}${i}` }));
  const asked: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const cat = (JSON.parse(String(init.body)).selected_fields.category ?? [])[0] as string | undefined;
    asked.push(cat ?? "all");
    if (cat === "Nursing") return Response.json({ refineSearch: { totalHits: 400, data: { jobs: ids("N", 400) } } });
    if (cat === "Physicians") return Response.json({ refineSearch: { totalHits: 200, data: { jobs: ids("P", 200) } } });
    // Unfiltered: 600 hits, only 500 returned (with overlap), plus the category counts.
    return Response.json({
      refineSearch: { totalHits: 600, data: { jobs: [...ids("N", 300), ...ids("P", 200)], aggregations: [{ field: "category", value: { Nursing: 400, Physicians: 200 } }] } },
    });
  }) as typeof fetch;
  try {
    assert.equal((await phenom.list("jobs.example.org"))?.length, 600);
    assert.deepEqual(asked, ["all", "Nursing", "Physicians"]);
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    assert.equal(await phenom.list("jobs.example.org"), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Jibe/iCIMS: every field from the list row, description sections joined", async () => {
  const built = await icims.build("jobs.bjc.org", "BJC HealthCare", {
    slug: "28963", req_id: "28963", title: "Operating Room Nurse - Experienced", full_location: "Saint Louis, Missouri",
    country: "United States", country_code: "US", posted_date: "2026-03-18T16:14:00+0000", employment_type: "FULL_TIME",
    categories: [{ name: "Nursing Services" }], description: "<p>Join our OR team</p>", qualifications: "<ul><li>BLS</li></ul>",
  }, NOW);
  assert.equal(built?.job.id, "icims:bjc:28963");
  assert.equal(built?.job.location, "Saint Louis, Missouri, United States");
  assert.equal(built?.job.country, "US");
  assert.equal(built?.job.department, "Nursing Services");
  assert.equal(built?.job.employmentType, "Full time");
  assert.equal(built?.job.url, "https://jobs.bjc.org/jobs/28963");
  assert.match(built?.description ?? "", /Join our OR team\s+- BLS/);
});
