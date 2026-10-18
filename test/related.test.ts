import { test } from "node:test";
import assert from "node:assert/strict";
import { relatedTip } from "../src/jobs/related.ts";

test("end-of-run tip: hospital Actor for clinical searches, Career API otherwise", () => {
  assert.match(relatedTip(["RN", "ICU"]), /us-hospital-jobs/);
  assert.match(relatedTip(["Registered Nurse"]), /us-hospital-jobs/);
  assert.match(relatedTip(["software engineer"]), /career-site-jobs-api/);
  assert.match(relatedTip([]), /career-site-jobs-api/);
  // "rn" inside a word is not a nurse search.
  assert.match(relatedTip(["frontend"]), /career-site-jobs-api/);
});
