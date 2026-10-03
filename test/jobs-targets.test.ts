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
