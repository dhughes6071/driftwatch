import { test } from "node:test";
import assert from "node:assert/strict";
import { FREE_PLAN_MAX_JOBS, jobLimit } from "../src/jobs/plan.ts";

test("free-plan cap: only free users on the Apify platform are capped", () => {
  // Free user on Apify asking for more than the cap.
  assert.deepEqual(jobLimit(1000, { atHome: true, userIsPaying: "0" }), { limit: FREE_PLAN_MAX_JOBS, freePlanCapped: true });
  assert.deepEqual(jobLimit(1000, { atHome: true, userIsPaying: null }), { limit: FREE_PLAN_MAX_JOBS, freePlanCapped: true });
  // Free user asking for less than the cap keeps their own limit.
  assert.deepEqual(jobLimit(50, { atHome: true, userIsPaying: "0" }), { limit: 50, freePlanCapped: false });
  // Paying users and local runs are never capped.
  assert.deepEqual(jobLimit(5000, { atHome: true, userIsPaying: "1" }), { limit: 5000, freePlanCapped: false });
  assert.deepEqual(jobLimit(5000, { atHome: false, userIsPaying: undefined }), { limit: 5000, freePlanCapped: false });
});
