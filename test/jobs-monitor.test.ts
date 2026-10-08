import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_DAYS, SeenJobs, monitorKey, type MonitorFilters } from "../src/jobs/monitor.ts";

const base: MonitorFilters = { companies: [], useCuratedList: true, titleKeywords: ["Engineer"], locationKeywords: [], remoteOnly: true };

test("first-actor monitor key: order and case ignored; filters, companies and names start a new history", () => {
  const k = monitorKey(base, undefined);
  assert.equal(k, monitorKey({ ...base, titleKeywords: ["engineer"] }, undefined));
  assert.notEqual(k, monitorKey({ ...base, remoteOnly: false }, undefined));
  assert.notEqual(k, monitorKey({ ...base, companies: ["*:stripe"] }, undefined));
  assert.equal(monitorKey({ ...base, companies: ["*:stripe", "ashby:ramp"] }, undefined), monitorKey({ ...base, companies: ["ashby:ramp", "*:stripe"], useCuratedList: false }, undefined));
  assert.equal(k, monitorKey({ ...base, onlyWithSalary: false }, undefined), "unused pay filters keep the key");
  assert.notEqual(k, monitorKey({ ...base, onlyWithSalary: true }, undefined));
  assert.match(monitorKey(base, "Client A"), /^client-a-[0-9a-f]{16}$/);
});

test("remembered jobs expire after KEEP_DAYS; a run counts once however often it saves", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const old = new Date(now.getTime() - (KEEP_DAYS + 1) * 86_400_000).toISOString();
  const s = new SeenJobs({ seen: { "greenhouse:stripe:1": now.toISOString(), "lever:x:2": old }, lastRunAt: old, runs: 2 }, now);
  assert.ok(s.has("greenhouse:stripe:1"));
  assert.ok(!s.has("lever:x:2"));
  const prev = { seen: {}, lastRunAt: old, runs: 2 };
  assert.equal(s.toState(prev, now).runs, 3);
  assert.equal(s.toState(prev, now).runs, 3);
});
