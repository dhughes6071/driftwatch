import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCompanyEntry } from "../src/jobs/targets.ts";

test("company entries: objects, plain names and job-board links all work", () => {
  assert.deepEqual(parseCompanyEntry({ slug: "stripe" }), { slug: "stripe" });
  assert.deepEqual(parseCompanyEntry({ slug: "ramp", ats: "Ashby" }), { ats: "ashby", slug: "ramp" });
  assert.deepEqual(parseCompanyEntry("Stripe"), { slug: "stripe" });
  assert.deepEqual(parseCompanyEntry("Scale AI"), { slug: "scaleai" });
  assert.deepEqual(parseCompanyEntry("https://boards.greenhouse.io/stripe"), { ats: "greenhouse", slug: "stripe" });
  assert.deepEqual(parseCompanyEntry("https://job-boards.greenhouse.io/anthropic/jobs/123"), { ats: "greenhouse", slug: "anthropic" });
  assert.deepEqual(parseCompanyEntry({ slug: "https://jobs.lever.co/veeva" }), { ats: "lever", slug: "veeva" });
  assert.deepEqual(parseCompanyEntry("jobs.ashbyhq.com/Ramp"), { ats: "ashby", slug: "ramp" });
  assert.deepEqual(parseCompanyEntry("https://api.lever.co/v0/postings/veeva?mode=json"), { ats: "lever", slug: "veeva" });
  assert.deepEqual(parseCompanyEntry("https://api.ashbyhq.com/posting-api/job-board/ramp"), { ats: "ashby", slug: "ramp" });
});

test("company entries that can't be used are skipped with a reason, never a crash", () => {
  for (const bad of [null, undefined, 42, { ats: "lever" }, { slug: "x", ats: "workday" }, "https://example.com/careers", ""]) {
    const r = parseCompanyEntry(bad);
    assert.ok("skip" in r, `${JSON.stringify(bad)} should be skipped`);
  }
});

test("Greenhouse with a prefilter: light list first, details only for matches", async () => {
  const { fetchCompany } = await import("../src/jobs/ats.ts");
  const calls: string[] = [];
  const light = { jobs: [
    { id: 1, title: "Staff Engineer", location: { name: "Remote, US" }, absolute_url: "u1", first_published: "2026-10-01" },
    { id: 2, title: "Account Executive", location: { name: "NYC" }, absolute_url: "u2", first_published: "2026-10-01" },
  ] };
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url).replace("https://boards-api.greenhouse.io/v1/boards/acme/jobs", ""));
    if (String(url).includes("/jobs/1")) return Response.json({ ...light.jobs[0], content: "&lt;p&gt;Build things. Salary range: $150,000 - $180,000&lt;/p&gt;" });
    if (String(url).includes("content=true")) throw new Error("should not download the full list");
    return Response.json(light);
  }) as typeof fetch;
  try {
    const jobs = await fetchCompany("greenhouse", "acme", (j) => j.title.toLowerCase().includes("engineer"));
    assert.equal(jobs.length, 1);
    assert.match(jobs[0].description, /Build things/);
    assert.deepEqual(calls, ["?pay_transparency=true", "/1?pay_transparency=true"]);
    calls.length = 0;
    assert.deepEqual(await fetchCompany("greenhouse", "acme", () => false), []);
    assert.deepEqual(calls, ["?pay_transparency=true"], "no matches: no description download at all");
  } finally {
    globalThis.fetch = real;
  }
});
