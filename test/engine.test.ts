/**
 * Unit tests for the pure logic. No network, no database writes beyond the
 * temp DB, no cost. Run with: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { compareVersions, tagToVersion } from "../src/sources/github.ts";
import { extractBreakingChanges } from "../src/engine/extract.ts";
import { editDistance } from "../src/engine/pkgcheck.ts";
import { normalizeRepo } from "../src/sources/registry.ts";

describe("compareVersions", () => {
  test("orders release versions", () => {
    assert.ok(compareVersions("1.0.0", "2.0.0") < 0);
    assert.ok(compareVersions("2.0.0", "1.0.0") > 0);
    assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
    assert.ok(compareVersions("1.9.0", "1.10.0") < 0, "numeric, not lexicographic");
  });

  test("sorts a prerelease before its release", () => {
    assert.ok(compareVersions("1.0.0-rc.1", "1.0.0") < 0);
    assert.ok(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
  });

  test("tolerates missing components and v-prefixes", () => {
    assert.ok(compareVersions("v1.0", "v1.0.1") < 0);
    assert.equal(compareVersions("v2.0.0", "2.0.0"), 0);
  });
});

describe("tagToVersion", () => {
  test("strips common tag prefixes", () => {
    assert.equal(tagToVersion("v19.0.0"), "19.0.0");
    assert.equal(tagToVersion("react@18.2.0"), "18.2.0");
    assert.equal(tagToVersion("release-2.1.0"), "2.1.0");
    assert.equal(tagToVersion("1.0.0-beta.2"), "1.0.0-beta.2");
  });

  test("returns null when there is no version in the tag", () => {
    assert.equal(tagToVersion("latest"), null);
  });
});

describe("normalizeRepo", () => {
  test("reduces the many shapes of a repository field to owner/repo", () => {
    assert.equal(normalizeRepo("https://github.com/facebook/react"), "facebook/react");
    assert.equal(normalizeRepo("git+https://github.com/facebook/react.git"), "facebook/react");
    assert.equal(normalizeRepo({ url: "git://github.com/expressjs/express.git" }), "expressjs/express");
    assert.equal(normalizeRepo("git@github.com:vuejs/core.git"), "vuejs/core");
  });

  test("returns null for non-GitHub or absent repositories", () => {
    assert.equal(normalizeRepo("https://gitlab.com/foo/bar"), null);
    assert.equal(normalizeRepo(undefined), null);
    assert.equal(normalizeRepo(null), null);
  });
});

describe("editDistance", () => {
  test("computes Levenshtein distance", () => {
    assert.equal(editDistance("react", "react"), 0);
    assert.equal(editDistance("react", "recat"), 2);
    assert.equal(editDistance("express", "expres"), 1);
    assert.equal(editDistance("requests", "requsts"), 1);
    assert.equal(editDistance("", "abc"), 3);
  });
});

describe("extractBreakingChanges", () => {
  const note = (body: string) => [
    { version: "19.0.0", tag: "v19.0.0", publishedAt: null, url: "https://example.test/r/v19.0.0", body },
  ];

  test("extracts items under a Breaking Changes heading with high confidence", () => {
    const out = extractBreakingChanges(
      note(`## Breaking Changes\n\n- Removed \`ReactDOM.render\` in favor of \`createRoot\`\n- Dropped support for Node 14\n\n## Features\n- Added something nice`),
    );
    assert.ok(out.length >= 2);
    assert.ok(out.every((b) => b.confidence === "high"));
    assert.ok(out.some((b) => b.summary.includes("ReactDOM.render")));
    // A Features bullet must not be picked up.
    assert.ok(!out.some((b) => b.summary.includes("something nice")));
  });

  test("extracts inline BREAKING CHANGE markers", () => {
    const out = extractBreakingChanges(note(`### Fixes\n\nBREAKING CHANGE: the \`maxSteps\` option has been removed`));
    assert.ok(out.some((b) => b.summary.includes("maxSteps")));
  });

  test("picks up removal and rename phrasing outside a labelled section", () => {
    const out = extractBreakingChanges(note(`## What's new\n\n- Renamed \`parameters\` to \`inputSchema\` for clarity`));
    assert.ok(out.length >= 1);
    assert.equal(out[0].confidence, "medium");
  });

  test("captures backticked identifiers as greppable symbols", () => {
    const out = extractBreakingChanges(note("## Breaking Changes\n- Removed `contextTypes` and `getChildContext`"));
    const syms = out[0].symbols ?? [];
    assert.ok(syms.includes("contextTypes"));
    assert.ok(syms.includes("getChildContext"));
  });

  test("attaches a citation to every finding", () => {
    const out = extractBreakingChanges(note("## Breaking Changes\n- Removed `foo` from the public API"));
    assert.ok(out.length >= 1);
    assert.equal(out[0].citations[0].url, "https://example.test/r/v19.0.0");
    assert.equal(out[0].citations[0].kind, "release-note");
  });

  test("returns nothing for release notes with no breaking changes", () => {
    const out = extractBreakingChanges(note("## Bug Fixes\n- Fixed a typo in the docs\n- Improved performance"));
    assert.equal(out.length, 0);
  });

  test("deduplicates the same change repeated across releases", () => {
    const body = "## Breaking Changes\n- Removed `legacyMode` from the config";
    const out = extractBreakingChanges([
      { version: "2.0.0", tag: "v2.0.0", publishedAt: null, url: "https://example.test/a", body },
      { version: "2.0.1", tag: "v2.0.1", publishedAt: null, url: "https://example.test/b", body },
    ]);
    assert.equal(out.length, 1, "identical findings should collapse to one");
  });

  test("strips markdown link syntax and PR references from summaries", () => {
    const out = extractBreakingChanges(
      note("## Breaking Changes\n- Removed `oldApi`, see [the guide](https://x.test/g) ([#1234](https://x.test/pr))"),
    );
    assert.ok(!out[0].summary.includes("]("), "markdown links should be unwrapped");
    assert.ok(!out[0].summary.includes("#1234"), "PR references should be stripped");
    assert.ok(out[0].summary.includes("the guide"), "link text should be preserved");
  });

  test("handles empty and malformed bodies without throwing", () => {
    assert.equal(extractBreakingChanges(note("")).length, 0);
    assert.equal(extractBreakingChanges([]).length, 0);
    assert.doesNotThrow(() => extractBreakingChanges(note("### \n##\n- \n`")));
  });
});

/*
 * Regression tests for bugs found by running DAY_1 against real packages.
 */
describe("regressions found in real-world testing (2026-08-07)", () => {
  test("two-component tags are not dropped -- pydantic ships v2 as `v2.0`", () => {
    // The original regex required three numeric components, so `v2.0` returned
    // null and the entire pydantic v2 release was skipped -- the one release
    // containing every v2 breaking change.
    assert.equal(tagToVersion("v2.0"), "2.0.0");
    assert.equal(tagToVersion("2.0"), "2.0.0");
    assert.equal(tagToVersion("v1.5"), "1.5.0");
  });

  test("PEP 440 prereleases attached without a separator are parsed", () => {
    assert.equal(tagToVersion("v2.0b3"), "2.0.0b3");
    assert.equal(tagToVersion("v2.0a1"), "2.0.0a1");
  });

  test("normalized two-component versions compare correctly against three", () => {
    assert.equal(compareVersions(tagToVersion("v2.0")!, "2.0.0"), 0);
    assert.ok(compareVersions(tagToVersion("v2.0")!, "1.10.26") > 0);
    assert.ok(compareVersions(tagToVersion("v2.0b3")!, "2.0.0") < 0, "prerelease sorts before release");
  });

  test("packaging-only commits no longer produce false positives", () => {
    // Real line from pydantic's auto-generated notes that was being reported
    // as a breaking change. It names no code symbol, so it must be ignored.
    const out = extractBreakingChanges([
      {
        version: "2.0.0",
        tag: "v2.0",
        publishedAt: null,
        url: "https://example.test/r",
        body: "## What's Changed\n* setup: remove upper bound from python_requires by @vfazio in https://github.com/pydantic/pydantic/pull/9685",
      },
    ]);
    assert.equal(out.length, 0, "packaging change without a code symbol must not be reported");
  });

  test("PR attribution is stripped from summaries", () => {
    const out = extractBreakingChanges([
      {
        version: "2.0.0",
        tag: "v2.0",
        publishedAt: null,
        url: "https://example.test/r",
        body: "## Breaking Changes\n* Removed `BaseSettings` from the main package by @samuelcolvin in https://github.com/pydantic/pydantic/pull/123",
      },
    ]);
    assert.ok(out.length >= 1);
    assert.ok(!out[0].summary.includes("@samuelcolvin"), "attribution should be stripped");
    assert.ok(!out[0].summary.includes("http"), "PR URL should be stripped");
    assert.ok(out[0].summary.includes("BaseSettings"));
  });
});

describe("internal-churn filtering", () => {
  const rel = (body: string) => [
    { version: "2.0.0", tag: "v2.0", publishedAt: null, url: "https://example.test/r", body },
  ];

  test("drops test-suite churn from auto-generated notes", () => {
    const out = extractBreakingChanges(
      rel("## What's Changed\n* Remove xfail from `tests.test_edge_cases.test_int_subclass` as it is expected behavior"),
    );
    assert.equal(out.length, 0);
  });

  test("drops changes whose only symbols are private", () => {
    const out = extractBreakingChanges(rel("## What's Changed\n* Remove `_base_class_defined` hack in favor of an empty bases check"));
    assert.equal(out.length, 0);
  });

  test("keeps genuine public-API removals", () => {
    const out = extractBreakingChanges(rel("## What's Changed\n* Remove `SecretField` from public API"));
    assert.equal(out.length, 1);
    assert.ok(out[0].symbols?.includes("SecretField"));
  });

  test("respects an explicit Breaking Changes heading even when it mentions tests", () => {
    const out = extractBreakingChanges(rel("## Breaking Changes\n* Removed the `pytest` plugin entry point"));
    assert.equal(out.length, 1, "maintainer intent wins over our heuristics");
  });
});

/*
 * ATS aggregator. Pure normalization logic only -- no network in tests.
 */
describe("ATS job normalization", () => {
  test("remote and remoteEligible are separate signals", async () => {
    // Ashby flagged 112/123 Ramp roles isRemote while listing them all at
    // "New York, NY (HQ)". Letting that drive `remote` made the filter useless,
    // so the company's flag and the location text are reported separately.
    const { VERIFIED_ATS } = await import("../src/jobs/ats.ts");
    assert.ok(Array.isArray(VERIFIED_ATS));
    assert.ok(VERIFIED_ATS.includes("greenhouse"));
    assert.ok(VERIFIED_ATS.includes("ashby"));
    assert.ok(VERIFIED_ATS.includes("lever"));
    // Workable is excluded: it intermittently serves HTML instead of JSON.
    assert.ok(!VERIFIED_ATS.includes("workable"));
  });

  test("slug candidates cover the forms ATSs actually use", async () => {
    const { slugCandidates } = await import("../src/jobs/seed.ts");
    const c = slugCandidates("Modern Treasury");
    assert.ok(c.includes("moderntreasury"), "punctuation-stripped form");
    assert.ok(c.includes("modern-treasury"), "dashed form");
    assert.equal(slugCandidates("x").length, 0, "too-short names are rejected");
  });
});

describe("truncated LLM output salvage", () => {
  test("recovers complete objects from a cut-off JSON array", async () => {
    const { salvagePartialJson } = await import("../src/engine/synth.ts");
    // Two complete entries, then the response was cut mid-object.
    const partial = `{"breakingChanges":[
      {"summary":"Removed foo","version":"2.0.0","confidence":"high","symbols":["foo"],
       "migration":{"before":"foo()","after":"bar()","note":""},"sourceVersionTag":"v2.0.0"},
      {"summary":"Renamed baz","version":"2.0.0","confidence":"medium","symbols":["baz"],
       "migration":{"before":"","after":"","note":""},"sourceVersionTag":"v2.0.0"},
      {"summary":"Half-writt`;
    const out = salvagePartialJson<{ summary: string }>(partial);
    assert.equal(out.length, 2, "the two complete objects survive; the partial one is dropped");
    assert.equal(out[0].summary, "Removed foo");
    assert.equal(out[1].summary, "Renamed baz");
  });

  test("braces inside string values do not confuse the scanner", async () => {
    const { salvagePartialJson } = await import("../src/engine/synth.ts");
    const partial = `{"breakingChanges":[
      {"summary":"Config shape changed from {a:1} to {b:2}","version":"3.0.0","confidence":"high",
       "symbols":[],"migration":{"before":"{a:1}","after":"{b:2}","note":""},"sourceVersionTag":"v3"},
      {"summary":"trunc`;
    const out = salvagePartialJson<{ summary: string }>(partial);
    assert.equal(out.length, 1);
    assert.ok(out[0].summary.includes("{a:1}"));
  });

  test("returns nothing when there is no complete object", async () => {
    const { salvagePartialJson } = await import("../src/engine/synth.ts");
    assert.equal(salvagePartialJson('{"breakingChanges":[{"summary":"cut').length, 0);
    assert.equal(salvagePartialJson("").length, 0);
  });
});

describe("cache versioning", () => {
  test("engine version is part of the cache key", async () => {
    // Cached answers computed under older, buggier engine code must not be
    // served after a fix. Bumping ENGINE_VERSION makes them unreachable.
    const { deltaKey, ENGINE_VERSION } = await import("../src/lib/db.ts");
    const k = deltaKey("npm", "react", "18.2.0", "19.0.0");
    assert.ok(k.startsWith(`v${ENGINE_VERSION}:`), `key should be version-prefixed, got ${k}`);
    assert.ok(k.includes("npm:react:18.2.0:19.0.0"));
  });
});
