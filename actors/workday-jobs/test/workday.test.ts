import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAP,
  PAGE,
  Pacer,
  WorkdayClient,
  chooseSplit,
  minAgeDays,
  normalize,
  parseCareerSiteUrl,
  parsePostedOn,
  retryAfterMs,
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

test("known Workday ids get their real company name", async () => {
  const { companyName } = await import("../src/workday.ts");
  assert.equal(companyName("ms"), "Morgan Stanley");
  assert.equal(companyName("ghr"), "Bank of America");
  assert.equal(companyName("nvidia"), "NVIDIA");
  assert.equal(companyName("not-a-tenant"), "not-a-tenant");
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
/** Fakes need no pacing. */
const UNPACED = { ratePerSecond: Infinity };

test("collects every job from a site over the 2,000 cap, each exactly once", async () => {
  const wd = fakeWorkday(2650, 4);
  const client = new WorkdayClient(wd.fetch, 30_000, UNPACED);
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
  const client = new WorkdayClient(wd.fetch, 30_000, UNPACED);
  const got = new Set<string>();
  await client.collect(SITE, { onPosting: (p) => void got.add(p.externalPath) });
  assert.equal(got.size, 4500);
  assert.equal(wd.requests(), 4500 / PAGE, "one request per page, no wasted slices");
});

test("stops requesting once the caller has enough", async () => {
  const wd = fakeWorkday(1500, 1);
  const client = new WorkdayClient(wd.fetch, 30_000, UNPACED);
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
  assert.equal(job.companyName, "acme", "unknown tenants fall back to their Workday id");
  assert.equal(job.remote, true);
  assert.equal(job.postedAt, "2026-09-20");
  assert.equal(job.department, "Engineering");
  assert.equal(job.employmentType, "Full time");
  assert.equal(job.description, "Build things\n- GPUs");
});

test("normalize reads stated pay from the description, in the job's own currency", () => {
  const detail = (desc: string, country: string) => ({
    title: "Analyst", location: "Toronto", jobReqId: "R2", jobDescription: desc, country: { descriptor: country },
  });
  const p = { title: "Analyst", externalPath: "/job/X/An_R2", bulletFields: ["R2"] };
  const us = normalize(SITE, p, null, detail("<p>The base pay range for this role is $98,000 - $125,000 per year.</p>", "United States of America"));
  assert.deepEqual(
    [us.salaryMin, us.salaryMax, us.salaryCurrency, us.salaryPeriod, us.salaryAnnualMax],
    [98000, 125000, "USD", "year", 125000],
  );
  const ca = normalize(SITE, p, null, detail("<p>Hourly pay: $24.00 - $28.00 per hour</p>", "Canada"));
  assert.deepEqual([ca.salaryCurrency, ca.salaryPeriod, ca.salaryAnnualMax], ["CAD", "hour", 58240]);
  const none = normalize(SITE, p, null, detail("<p>We raised $185 million last year.</p>", "United States of America"));
  assert.equal(none.salaryMin, null);
  const noDetail = normalize(SITE, p, null, null);
  assert.equal(noDetail.salaryText, null);
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

test("short location codes match whole words only", async () => {
  const { locationMatcher } = await import("../src/workday.ts");
  assert.equal(locationMatcher(["TX"])("US, TX, Austin"), true);
  assert.equal(locationMatcher(["NY"])("Munich, Germany"), false);
});

// ------------------------------------------------------------------ rate limit and retries

/** A clock that only moves when the client sleeps, so retry timing is exact and instant. */
function fakeClock() {
  let t = 0;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => void (slept.push(ms), (t += ms)),
    slept,
  };
}

const ok20 = (offset: number, total = 0) =>
  Response.json({ total, facets: [], jobPostings: Array.from({ length: 20 }, (_, i) => ({ title: "R", externalPath: `/job/${offset + i}` })) });

test("a page answered 429 is retried with growing waits until it loads (17 Oct 2026: 43% of requests got 429)", async () => {
  const clock = fakeClock();
  let calls = 0;
  const f = (async () => (++calls <= 3 ? new Response("challenge", { status: 429 }) : ok20(0, 20))) as unknown as Fetch;
  const client = new WorkdayClient(f, 30_000, { ...clock, random: () => 0.5 });
  const r = await client.page(SITE, {}, 0);
  assert.equal(r?.jobPostings?.length, 20);
  // 2, 4, 8 s backoff (random 0.5 = no jitter); the pacer's own 100 ms gaps and 5 s pauses fall inside those.
  assert.deepEqual(clock.slept.filter((ms) => ms >= 1000), [2000, 4000, 8000]);
  assert.deepEqual(client.counts, { requests: 4, limited: 3, failed: 0 });
});

test("Retry-After is honoured, in seconds or as a date", async () => {
  assert.equal(retryAfterMs("30"), 30_000);
  assert.equal(retryAfterMs("Sat, 17 Oct 2026 13:46:56 GMT", Date.parse("Sat, 17 Oct 2026 13:46:26 GMT")), 30_000);
  assert.equal(retryAfterMs(null), null);
  assert.equal(retryAfterMs("soon"), null);

  const clock = fakeClock();
  let calls = 0;
  const f = (async () => (++calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "17" } }) : ok20(0, 20))) as unknown as Fetch;
  await new WorkdayClient(f, 30_000, clock).page(SITE, {}, 0);
  assert.ok(clock.slept.includes(17_000), `slept ${clock.slept}`);
});

test("a page that keeps getting 429 still fails in the end (fail rather than guess)", async () => {
  const clock = fakeClock();
  const f = (async () => new Response("", { status: 429 })) as unknown as Fetch;
  const client = new WorkdayClient(f, 30_000, { ...clock, random: () => 0.5 });
  assert.equal(await client.page(SITE, {}, 0), null);
  assert.deepEqual(client.counts, { requests: 7, limited: 7, failed: 1 });
  // About two minutes of waiting in all, then give up.
  const waited = clock.now();
  assert.ok(waited > 100_000 && waited < 200_000, `${waited} ms`);
});

test("a site that answers 5xx fails fast, as before (17 Oct: every Workday site gave 500)", async () => {
  const clock = fakeClock();
  const f = (async () => new Response("", { status: 500 })) as unknown as Fetch;
  const client = new WorkdayClient(f, 30_000, clock);
  assert.equal(await client.page(SITE, {}, 0), null);
  assert.equal(client.counts.requests, 4);
  assert.ok(clock.now() < 10_000, `${clock.now()} ms`);
});

test("404 is a definitive miss: no retry", async () => {
  const clock = fakeClock();
  const f = (async () => new Response("", { status: 404 })) as unknown as Fetch;
  const client = new WorkdayClient(f, 30_000, clock);
  assert.equal(await client.detail(SITE, "/job/gone"), null);
  assert.equal(client.counts.requests, 1);
});

test("requests to one Workday domain are paced together, across sites and data centers", async () => {
  const clock = fakeClock();
  const at: Array<[string, number]> = [];
  const f = (async (url: string) => (at.push([new URL(url).hostname, clock.now()]), ok20(0, 20))) as unknown as Fetch;
  const client = new WorkdayClient(f, 30_000, { ...clock, ratePerSecond: 10 });
  const other: Site = { host: "beta.wd5.myworkdayjobs.com", tenant: "beta", site: "Jobs" };
  const elsewhere: Site = { host: "wd1.myworkdaysite.com", tenant: "gamma", site: "Jobs" };
  for (let i = 0; i < 3; i++) {
    await client.page(SITE, {}, 0);
    await client.page(other, {}, 0);
  }
  await client.page(elsewhere, {}, 0);
  // Six myworkdayjobs.com requests 100 ms apart, whichever host; myworkdaysite.com has its own pace.
  assert.deepEqual(at.map(([, t]) => t), [0, 100, 200, 300, 400, 500, 500]);
});

test("the pacer slows down on 429 and recovers on success, never below 5 a second", () => {
  const clock = fakeClock();
  const p = new Pacer(11, clock.now, clock.sleep);
  for (let i = 0; i < 20; i++) p.limited(0);
  assert.equal(p.rate, 5);
  for (let i = 0; i < 1000; i++) p.ok();
  assert.equal(p.rate, 11);
});

test("a collect walk survives a burst of 429s and loads every page", async () => {
  const clock = fakeClock();
  let n = 0;
  const f = (async (_url: string, init: RequestInit) => {
    const { offset } = JSON.parse(String(init.body)) as { offset: number };
    // Every third request is rate limited.
    if (++n % 3 === 0) return new Response("", { status: 429 });
    return ok20(offset, 200);
  }) as unknown as Fetch;
  const client = new WorkdayClient(f, 30_000, clock);
  let failed = 0;
  const seen = new Set<string>();
  await client.collect(SITE, { onPosting: (p) => void seen.add(p.externalPath), onPageFailed: () => void failed++ });
  assert.equal(failed, 0);
  assert.equal(seen.size, 200);
});
