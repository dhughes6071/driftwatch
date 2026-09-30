import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the pay reader is an exact copy of the Career API's", () => {
  const mine = readFileSync(new URL("../src/salary.ts", import.meta.url), "utf8");
  const theirs = readFileSync(new URL("../../career-jobs/src/salary.ts", import.meta.url), "utf8");
  assert.equal(mine.slice(mine.indexOf("\n") + 1), theirs, "copy actors/career-jobs/src/salary.ts over src/salary.ts (keep the first line)");
});
