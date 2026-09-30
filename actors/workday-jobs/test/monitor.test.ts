import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_DAYS, SeenPostings, monitorKey, postingKey, type MonitorFilters } from "../src/monitor.ts";

const base: MonitorFilters = {
  careerSiteUrls: ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"],
  useCuratedList: false,
  companyKeywords: [],
  searchText: "",
  titleKeywords: ["Engineer", "Scientist"],
  locationKeywords: ["CA"],
  remoteOnly: false,
};

test("monitor key: same search, same key; order/case ignored; a filter or name change starts afresh", () => {
  const k = monitorKey(base, undefined);
  assert.equal(k, monitorKey({ ...base, titleKeywords: ["scientist", "engineer"] }, undefined));
  assert.notEqual(k, monitorKey({ ...base, locationKeywords: ["TX"] }, undefined));
  assert.notEqual(k, monitorKey({ ...base, postedWithinDays: 7 }, undefined));
  assert.notEqual(k, monitorKey(base, "client-a"));
  assert.match(monitorKey(base, "Client A!"), /^client-a-[0-9a-f]{16}$/);
});

test("remembered postings: kept across runs, expired after KEEP_DAYS, run count advances once per run", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const old = new Date(now.getTime() - (KEEP_DAYS + 1) * 86_400_000).toISOString();
  const s = new SeenPostings({ seen: { a: now.toISOString(), gone: old }, lastRunAt: old, runs: 3 }, now);
  assert.ok(s.has("a"));
  assert.ok(!s.has("gone"));
  const key = postingKey("nvidia", "NVIDIAExternalCareerSite", "/job/US-CA-Santa-Clara/Engineer_JR1");
  assert.equal(key, "nvidia/nvidiaexternalcareersite/job/US-CA-Santa-Clara/Engineer_JR1");
  s.add(key, now.toISOString());
  const prev = { seen: {}, lastRunAt: old, runs: 3 };
  const st = s.toState(prev, now);
  assert.deepEqual(Object.keys(st.seen).sort(), ["a", key].sort());
  assert.equal(st.runs, 4);
  assert.equal(s.toState(prev, now).runs, 4); // saving mid-run and again at the end counts one run
  assert.equal(new SeenPostings(null).size, 0);
});
