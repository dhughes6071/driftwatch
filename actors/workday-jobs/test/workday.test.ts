import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAP,
  PAGE,
  WorkdayClient,
  chooseSplit,
  minAgeDays,
  normalize,
  parseCareerSiteUrl,
  parsePostedOn,
  type Fetch,
  type Site,
} from "../src/workday.ts";

// ------------------------------------------------------------------ URLs

test("parses myworkdayjobs career sites, with and without locale and job path", () => {
  const want = { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" };
  assert.deepEqual(parseCareerSiteUrl("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"), want);
  assert.deepEqual(parseCareerSiteUrl("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"), want);
  assert.deepEqual(
    parseCareerSiteUrl("https://NVIDIA.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA/Eng_JR1?q=1"),
    want,
  );
  assert.deepEqual(parseCareerSiteUrl("nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"), want);
});

test("parses myworkdaysite.com recruiting URLs", () => {
  assert.deepEqual(parseCareerSiteUrl("https://wd1.myworkdaysite.com/en-US/recruiting/tjx/TJX_EXTERNAL/job/x"), {
    host: "wd1.myworkdaysite.com",
    tenant: "tjx",
    site: "TJX_EXTERNAL",
  });
});

test("rejects URLs that are not a Workday career site", () => {
  assert.equal(parseCareerSiteUrl("https://boards.greenhouse.io/stripe"), null);
  assert.equal(parseCareerSiteUrl("https://nvidia.wd5.myworkdayjobs.com/"), null);
  assert.equal(parseCareerSiteUrl("not a url at all"), null);
});

// ------------------------------------------------------------------ dates

test("postedOn text becomes a date; '30+ days' stays unknown", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  assert.equal(parsePostedOn("Posted Today", now), "2026-09-26");
  assert.equal(parsePostedOn("Posted Yesterday", now), "2026-09-25");
  assert.equal(parsePostedOn("Posted 5 Days Ago", now), "2026-09-21");
  assert.equal(parsePostedOn("Posted 30+ Days Ago", now), null);
  assert.equal(minAgeDays("Posted 30+ Days Ago"), 30);
  assert.equal(minAgeDays("Posted Today"), 0);
  assert.equal(minAgeDays(undefined), null);
});

// ------------------------------------------------------------------ facets

test("chooseSplit prefers job category, and ignores facets that do not cover every job", () => {
  const facets = [
    { facetParameter: "timeType", values: [{ id: "a", count: 3000 }, { id: "b", count: 100 }] }, // sums short
    { facetParameter: "jobFamilyGroup", values: [{ id: "c", count: 1800 }, { id: "d", count: 1400 }] },
  ];
  assert.equal(chooseSplit(facets, {}, 3200)?.facetParameter, "jobFamilyGroup");
  assert.equal(chooseSplit(facets, { jobFamilyGroup: ["c"] }, 3200), null);
});

test("chooseSplit finds location facets nested inside a wrapper (the TJX case)", () => {
  const facets = [
    { facetParameter: "workerSubType", values: [{ id: "a", count: 8272 }, { id: "b", count: 2600 }] },
    {
      facetParameter: "locationMainGroup",
      values: [
        {
          facetParameter: "locations",
          values: Array.from({ length: 600 }, (_, i) => ({ id: `l${i}`, count: 19 })),
        } as never,
      ],
    },
  ];
  // workerSubType leaves an 8,272-job slice; locations gets every slice under the cap in one level.
  assert.equal(chooseSplit(facets, {}, 10872)?.facetParameter, "locations");
});

// ------------------------------------------------------------------ the wraparound bug

/**
 * A fake Workday that behaves like the real one: 20 per page, `total` only on
 * page one and capped at 2,000, offsets past 2,000 wrapping to the start, and
 * a category facet that partitions the jobs.
 */
function fakeWorkday(nJobs: number, categories: number, capped = true): { fetch: Fetch; requests: () => number } {
  const jobs = Array.from({ length: nJobs }, (_, i) => ({
    title: `Job ${i}`,
    externalPath: `/job/Loc/Job_${i}`,
    locationsText: "Somewhere",
    postedOn: "Posted Today",
    bulletFields: [`R${i}`],
    cat: `cat${i % categories}`,
  }));
  let requests = 0;
  const f = (async (_url: string, init?: RequestInit) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    if (body.limit > PAGE) return new Response("{}", { status: 400 });
    const cat: string | undefined = body.appliedFacets.jobFamilyGroup?.[0];
    const pool = cat ? jobs.filter((j) => j.cat === cat) : jobs;
    const offset = capped && body.offset >= CAP ? 0 : body.offset; // the wraparound
    const counts = new Map<string, number>();
    for (const j of jobs) counts.set(j.cat, (counts.get(j.cat) ?? 0) + 1);
    return Response.json({
      total: body.offset === 0 ? (capped ? Math.min(pool.length, CAP) : pool.length) : 0,
      jobPostings: pool.slice(offset, offset + body.limit).map(({ cat: _c, ...j }) => j),
      facets: [
        {
          facetParameter: "jobFamilyGroup",
          values: [...counts].map(([id, count]) => ({ id, descriptor: id.toUpperCase(), count })),
        },
      ],
    });
  }) as Fetch;
  return { fetch: f, requests: () => requests };
}

const SITE: Site = { host: "acme.wd1.myworkdayjobs.com", tenant: "acme", site: "External" };

test("collects every job from a site over the 2,000 cap, each exactly once", async () => {
  const wd = fakeWorkday(2650, 4);
  const client = new WorkdayClient(wd.fetch);
  const got: string[] = [];
  const cats = new Set<string | null>();
  await client.collect(SITE, {
    onPosting: (p, c) => {
      got.push(p.externalPath);
      cats.add(c);
    },
  });
  assert.equal(got.length, 2650, "a naive pager would stop at 2,000");
  assert.equal(new Set(got).size, 2650, "no duplicates from the wraparound");
  assert.deepEqual([...cats].sort(), ["CAT0", "CAT1", "CAT2", "CAT3"]);
});

test("sites that report their real count are paged straight through, not split", async () => {
  const wd = fakeWorkday(4500, 1, false); // one category: nothing to split by anyway
  const client = new WorkdayClient(wd.fetch);
  const got = new Set<string>();
  await client.collect(SITE, { onPosting: (p) => void got.add(p.externalPath) });
  assert.equal(got.size, 4500);
  assert.equal(wd.requests(), 4500 / PAGE, "one request per page, no wasted slices");
});

test("stops requesting once the caller has enough", async () => {
  const wd = fakeWorkday(1500, 1);
  const client = new WorkdayClient(wd.fetch);
  let n = 0;
  await client.collect(SITE, { concurrency: 1, onPosting: () => ++n >= 30 });
  assert.equal(n, 30);
  // One category -> no split: first page + a couple more, not all 75 pages.
  assert.ok(wd.requests() < 10, `made ${wd.requests()} requests`);
});

// ------------------------------------------------------------------ normalize

test("normalize prefers the detail call and flags remote from the workplace label", () => {
  const job = normalize(
    SITE,
    { title: "Engineer ", externalPath: "/job/X/Eng_R1", locationsText: "3 Locations", postedOn: "Posted Today", bulletFields: ["R1"] },
    "Engineering",
    {
      title: "Engineer",
      location: "US, CA, Santa Clara",
      additionalLocations: ["US, TX, Austin"],
      startDate: "2026-09-20",
      remoteType: "Fully Remote",
      timeType: "Full time",
      jobReqId: "R1",
      jobDescription: "<p>Build&nbsp;things</p><ul><li>GPUs</li></ul>",
      externalUrl: "https://acme.wd1.myworkdayjobs.com/External/job/X/Eng_R1",
    },
  );
  assert.equal(job.id, "workday:acme:R1");
  assert.equal(job.remote, true);
  assert.equal(job.postedAt, "2026-09-20");
  assert.equal(job.department, "Engineering");
  assert.equal(job.employmentType, "Full time");
  assert.equal(job.description, "Build things\n- GPUs");
});

test("normalize without detail: no fake location from 'N Locations', URL built from the site", () => {
  const job = normalize(
    SITE,
    { title: "Analyst", externalPath: "/job/Y/An_R2", locationsText: "5 Locations", postedOn: "Posted 30+ Days Ago", bulletFields: ["R2"] },
    null,
    null,
  );
  assert.equal(job.location, null);
  assert.equal(job.postedAt, null);
  assert.equal(job.url, "https://acme.wd1.myworkdayjobs.com/External/job/Y/An_R2");
  assert.equal(job.description, undefined);
});
