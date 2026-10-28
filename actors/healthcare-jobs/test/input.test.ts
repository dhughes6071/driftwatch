import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLists, noResultsNote } from "../src/input.ts";

test("input clean-up: null and blank list entries are dropped, other fields untouched", () => {
  const out = cleanLists({ titleKeywords: ["nurse", null, "  ", ""], sources: [], maxJobs: 5, remoteOnly: true } as Record<string, unknown>);
  assert.deepEqual(out, { titleKeywords: ["nurse"], sources: [], maxJobs: 5, remoteOnly: true });
});

test("a run with no results always says why", () => {
  assert.match(noResultsNote("jobs", false), /^0 jobs matched your filters/);
  assert.match(noResultsNote("jobs", true), /nothing new matched since this search last ran/);
});
