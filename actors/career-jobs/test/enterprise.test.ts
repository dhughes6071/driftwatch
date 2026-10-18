import { test } from "node:test";
import assert from "node:assert/strict";
import { icimsPortal, ldJobPosting, parseIcimsPortal, parseTalentBrew, taleo, talentbrew, tbPlace } from "../sources/small.ts";

const NOW = "2026-10-18T12:00:00.000Z";

test("JSON-LD JobPosting: found in a page, in a list or a @graph; null when absent", () => {
  const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  assert.equal(ldJobPosting(ld({ "@type": "JobPosting", title: "RN" }))?.title, "RN");
  assert.equal(ldJobPosting(ld([{ "@type": "Organization" }, { "@type": "JobPosting", title: "PT" }]))?.title, "PT");
  assert.equal(ldJobPosting(ld({ "@graph": [{ "@type": "JobPosting", title: "OT" }] }))?.title, "OT");
  assert.equal(ldJobPosting("<script type='application/ld+json'>{oops</script>"), null);
});

test("TalentBrew: rows from each site's own list markup, and the page count", () => {
  const html = `<section data-total-results="5953" data-total-pages="60"><ul>
    <li><a class="list_item_anchor" href="/job/council-bluffs/supervisor/35300/100818390656" data-job-id="100818390656">
      <h2 class="search-results-list__heading">Supervisor Behavioral Health Nursing</h2>
      <span class="job-info job-department">Behavioral Health</span><span class="job-location">Council Bluffs, IA</span></a></li>
    <li><a href="/job/oakland/rad-tech/641/88799959136" data-job-id="88799959136">
      <span class="job-title">Radiologic Technologist II &amp; Lead</span>
      <span class="job-location">Oakland, CA, Onsite, Regular, Day shift</span></a></li>
  </ul></section>`;
  const { rows, pages } = parseTalentBrew(html);
  assert.equal(pages, 60);
  assert.deepEqual(rows.map((r) => [r.id, r.title, r.department]), [
    ["100818390656", "Supervisor Behavioral Health Nursing", "Behavioral Health"],
    ["88799959136", "Radiologic Technologist II & Lead", null],
  ]);
  assert.equal(rows[1].location, "Oakland, CA");
  assert.equal(tbPlace("Remote"), "Remote");
});

test("TalentBrew build: date, description and type from the job page", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(`<script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-10-16","description":"<p>Lead the unit</p>","employmentType":"FULL_TIME"}</script>`)) as typeof fetch;
  try {
    const b = await talentbrew.build("www.commonspirit.careers", "CommonSpirit Health",
      { id: "100818390656", path: "/job/council-bluffs/supervisor/35300/100818390656", title: "Supervisor", location: "Council Bluffs, IA", department: "Behavioral Health" }, NOW);
    assert.equal(b?.job.id, "talentbrew:commonspirit:100818390656");
    assert.equal(b?.job.url, "https://www.commonspirit.careers/job/council-bluffs/supervisor/35300/100818390656");
    assert.equal(b?.job.postedAt, "2026-10-16T00:00:00.000Z");
    assert.equal(b?.job.employmentType, "Full time");
    assert.equal(b?.description, "Lead the unit");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("iCIMS portal: cards in both layouts, page count, and US-ST-City places", () => {
  const card = (inner: string) => `<li class="iCIMS_JobCardItem">${inner}</li>`;
  const html = `Page 1 of 36 ${card(`<span class="sr-only field-label">Location</span><span >
US-GA-Covington</span><a href="https://careers-piedmont.icims.com/jobs/30385/physical-therapist%2c-days/job?in_iframe=1" class="iCIMS_Anchor"><h3 >
Physical Therapist, Days</h3></a><dt class="iCIMS_JobHeaderField">Category</dt><dd class="iCIMS_JobHeaderData"><span >Rehab</span></dd>
<dt class="iCIMS_JobHeaderField">Schedule</dt><dd class="iCIMS_JobHeaderData"><span >Full-Time</span></dd>`)}
  ${card(`<a href="https://nursing-emory.icims.com/jobs/175220/charge-nurse/job?hub=14&amp;in_iframe=1" class="iCIMS_Anchor"><h3 >Charge Nurse &amp; Lead</h3></a>
<dt class="iCIMS_JobHeaderField">Campus Location</dt><dd class="iCIMS_JobHeaderData"><span >Atlanta, GA, 30322</span></dd>
<dt class="iCIMS_JobHeaderField">Job Type</dt><dd class="iCIMS_JobHeaderData"><span >Regular Full-Time</span></dd>
<dt class="iCIMS_JobHeaderField">Job Category</dt><dd class="iCIMS_JobHeaderData"><span >Nursing</span></dd>`)}`;
  const { rows, pages } = parseIcimsPortal(html);
  assert.equal(pages, 36);
  assert.deepEqual(rows.map((r) => [r.id, r.title, r.location, r.category, r.schedule]), [
    ["30385", "Physical Therapist, Days", "Covington, GA, US", "Rehab", "Full-Time"],
    ["175220", "Charge Nurse & Lead", "Atlanta, GA, 30322", "Nursing", "Regular Full-Time"],
  ]);
  assert.equal(rows[1].url, "https://nursing-emory.icims.com/jobs/175220/charge-nurse/job?hub=14&in_iframe=1");
});

test("iCIMS portal build: the public job link drops in_iframe", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("")) as typeof fetch;
  try {
    const b = await icimsPortal.build("careers-piedmont.icims.com", "Piedmont Healthcare",
      { id: "30385", url: "https://careers-piedmont.icims.com/jobs/30385/pt/job?in_iframe=1", title: "PT", location: null, category: null, schedule: null }, NOW);
    assert.equal(b?.job.id, "icims:careers-piedmont:30385");
    assert.equal(b?.job.url, "https://careers-piedmont.icims.com/jobs/30385/pt/job");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Taleo: one row per requisition across pages; title, places and date from the section's columns", async () => {
  const realFetch = globalThis.fetch;
  const req = (contestNo: string, title: string, place: string) => ({ jobId: contestNo, contestNo, column: [title, `["${place}"]`, "Oct 16, 2026"], linkedColumn: 0, locationsColumns: [1] });
  const pages = [
    [req("1", "RN ICU", "Dallas"), req("2", "Lab Tech", "Plano")],
    [req("2", "Lab Tech", "Frisco"), req("3", "Pharmacist", "Fort Worth")],
  ];
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const n = JSON.parse(String(init.body)).pageNo as number;
    return Response.json({ requisitionList: pages[n - 1] ?? [], pagingData: { totalCount: 4, pageSize: 2 } });
  }) as typeof fetch;
  try {
    const rows = await taleo.list("texashealth|ex3|12100020897");
    assert.deepEqual(rows?.map((r) => r.contestNo), ["1", "2", "3"]);
    const b = await taleo.build("texashealth|ex3|12100020897", "Texas Health Resources", rows![0], NOW);
    assert.equal(b?.job.id, "taleo:texashealth:1");
    assert.equal(b?.job.location, "Dallas");
    assert.equal(b?.job.url, "https://texashealth.taleo.net/careersection/ex3/jobdetail.ftl?job=1");
    assert.ok(b?.job.postedAt?.startsWith("2026-10-16"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
