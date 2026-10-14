import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_DAYS, SeenFilings, monitorKey } from "../src/monitor.ts";

test("monitor key ignores order and case, and changes with filters or name", () => {
  const a = monitorKey({ states: ["CA", "ny"], sectors: ["Technology"], companyType: "companies" }, undefined);
  const b = monitorKey({ companyType: "companies", sectors: ["technology"], states: ["NY", "ca"] }, undefined);
  assert.equal(a, b);
  assert.notEqual(a, monitorKey({ states: ["CA"], sectors: ["Technology"], companyType: "companies" }, undefined));
  assert.notEqual(a, monitorKey({ states: ["CA", "NY"], sectors: ["Technology"], companyType: "companies" }, "client-1"));
  assert.match(monitorKey({}, "Client 1!"), /^client-1-[0-9a-f]{16}$/);
});

test("history forgets entries older than KEEP_DAYS and counts runs", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  const old = new Date(now.getTime() - (KEEP_DAYS + 1) * 86_400_000).toISOString();
  const s = new SeenFilings({ seen: { a: old, b: now.toISOString() }, lastRunAt: old, runs: 2 }, now);
  assert.equal(s.has("a"), false);
  assert.equal(s.has("b"), true);
  s.add("c", now.toISOString());
  const state = s.toState({ seen: {}, lastRunAt: old, runs: 2 }, now);
  assert.equal(state.runs, 3);
  assert.deepEqual(Object.keys(state.seen).sort(), ["b", "c"]);
});
