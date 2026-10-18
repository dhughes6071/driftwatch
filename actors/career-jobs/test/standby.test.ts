import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { BadRequest, checkEnums, fieldEnums, fieldKinds, inputFromParams, serveStandby } from "../src/standby.ts";

const schema = JSON.parse(readFileSync(new URL("../.actor/input_schema.json", import.meta.url), "utf8"));
const kinds = fieldKinds(schema.properties);
const enums = fieldEnums(schema.properties);

test("GET parameters become Actor input, typed from the input schema", () => {
  const input = inputFromParams(new URLSearchParams("titleKeywords=nurse, rn&titleKeywords=lpn&remoteOnly=true&maxJobs=50&sources=workday"), kinds);
  assert.deepEqual(input, { titleKeywords: ["nurse", "rn", "lpn"], remoteOnly: true, maxJobs: 50, sources: ["workday"] });
});

test("typos and bad values are refused, not ignored", () => {
  assert.throws(() => inputFromParams(new URLSearchParams("titleKeyword=nurse"), kinds), BadRequest);
  assert.throws(() => inputFromParams(new URLSearchParams("maxJobs=lots"), kinds), BadRequest);
  assert.throws(() => inputFromParams(new URLSearchParams("remoteOnly=yes"), kinds), BadRequest);
  assert.throws(() => checkEnums({ sources: ["workday", "monster"] }, enums), /Choose from/);
  checkEnums({ sources: ["workday", "taleo"] }, enums);
});

test("server: readiness probe, usage note, search, 400s", async () => {
  const calls: unknown[] = [];
  const server = serveStandby(0, kinds, enums, async (input) => {
    calls.push(input);
    return { count: 0, jobs: [] };
  }, () => {});
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/`;
  try {
    const probe = await fetch(base, { headers: { "x-apify-container-server-readiness-probe": "1" } });
    assert.equal(probe.status, 200);
    assert.ok((await (await fetch(base)).json()).usage, "bare GET explains usage");
    assert.equal(calls.length, 0, "probe and bare GET run no search");
    assert.equal((await fetch(base + "?titleKeywords=nurse&maxJobs=5")).status, 200);
    assert.equal((await fetch(base, { method: "POST", body: JSON.stringify({ titleKeywords: ["nurse"] }) })).status, 200);
    assert.deepEqual(calls, [{ titleKeywords: ["nurse"], maxJobs: 5 }, { titleKeywords: ["nurse"] }]);
    assert.equal((await fetch(base + "?nope=1")).status, 400);
    assert.equal((await fetch(base, { method: "POST", body: "{not json" })).status, 400);
    assert.equal((await fetch(base, { method: "POST", body: JSON.stringify({ sources: ["monster"] }) })).status, 400);
  } finally {
    server.close();
  }
});
