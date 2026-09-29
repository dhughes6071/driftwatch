import { test } from "node:test";
import assert from "node:assert/strict";
import { SMALL_SOURCES, parsePersonio, parseTeamtailor, smallJobId } from "../sources/small.ts";
import { cleanLegalName } from "../crawler/discover-small.ts";

test("Personio XML: fields, extra offices, description sections", () => {
  const rows = parsePersonio(`<?xml version="1.0"?><workzag-jobs><position>
    <id>1834171</id><subcompany>Personio SE &amp; Co. KG</subcompany><office>Munich</office>
    <additionalOffices><office>Berlin</office><office>Dublin</office></additionalOffices>
    <department>Product and Tech</department><name>Staff Software Engineer</name>
    <jobDescriptions><jobDescription><name>The Role</name><value><![CDATA[<p>Build things</p>]]></value></jobDescription></jobDescriptions>
    <employmentType>permanent</employmentType><schedule>full-time</schedule><createdAt>2024-11-13T14:10:41+00:00</createdAt>
  </position></workzag-jobs>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "1834171");
  assert.equal(rows[0].subcompany, "Personio SE & Co. KG");
  assert.deepEqual(rows[0].additionalOffices, ["Berlin", "Dublin"]);
  assert.match(rows[0].description, /The Role.*Build things/);
});

test("Teamtailor RSS: company from the channel, locations and remote status", () => {
  const { company, rows } = parseTeamtailor(`<rss><channel><title>Acme AB</title><item>
    <title>Account Executive</title><description>&lt;p&gt;Sell&lt;/p&gt;</description>
    <pubDate>Thu, 23 Apr 2026 12:41:59 +0200</pubDate><link>https://acme.teamtailor.com/jobs/1-ae</link>
    <remoteStatus>hybrid</remoteStatus><guid>g-1</guid>
    <tt:locations><tt:location><tt:name>Madrid</tt:name><tt:country>Spain</tt:country></tt:location></tt:locations>
    <tt:department>Sales</tt:department></item></channel></rss>`);
  assert.equal(company, "Acme AB");
  assert.equal(rows[0].guid, "g-1");
  assert.equal(rows[0].remoteStatus, "hybrid");
  assert.deepEqual(rows[0].locations, [{ name: "Madrid", country: "Spain" }]);
  assert.equal(rows[0].description, "<p>Sell</p>");
});

test("legal suffixes are removed from company names", () => {
  assert.equal(cleanLegalName("Personio SE & Co. KG"), "Personio");
  assert.equal(cleanLegalName("100% Group Ltd"), "100% Group");
  assert.equal(cleanLegalName("Acme GmbH"), "Acme");
  assert.equal(cleanLegalName("Mollie B.V."), "Mollie");
  assert.equal(cleanLegalName("Sage"), "Sage");
});

test("the crawl's pre-build id matches the id build() produces, for every small source", async () => {
  // A mismatch makes every role look new each night (re-fetching every detail).
  const now = "2026-09-28T00:00:00.000Z";
  const samples: Record<string, [string, unknown]> = {
    bamboohr: ["acme", { id: "26", jobOpeningName: "Engineer" }],
    breezy: ["acme", { id: "abc", name: "Engineer" }],
    personio: ["acme", { id: "1", name: "Engineer", subcompany: null, office: null, additionalOffices: [], department: null, schedule: null, employmentType: null, createdAt: null, description: "" }],
    teamtailor: ["acme", { guid: "g1", title: "Engineer", link: "x", pubDate: null, remoteStatus: null, department: null, locations: [], description: "" }],
    recruitee: ["acme", { id: 7, title: "Engineer" }],
    ukg: ["AAM1000AAM|c5a88c41", { Id: "6f0e", Title: "Engineer" }],
  };
  for (const src of SMALL_SOURCES) {
    const s = samples[src.ats];
    if (!s) continue; // rippling's build needs the network
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    try {
      const built = await src.build(s[0], "Acme", s[1], now);
      assert.equal(built?.job.id, smallJobId(src, s[0], s[1]), src.ats);
    } finally {
      globalThis.fetch = realFetch;
    }
  }
});
