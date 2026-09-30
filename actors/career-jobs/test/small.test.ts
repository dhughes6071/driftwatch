import { test } from "node:test";
import assert from "node:assert/strict";
import { SMALL_SOURCES, mergeWorkable, parseJobviteList, parseJobviteMeta, parsePersonio, parseTeamtailor, smallJobId } from "../sources/small.ts";
import { cleanLegalName, decodeName, jobviteNameFromPage, shareUkgNames, ukgNameFromPage } from "../crawler/discover-small.ts";

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
    ukg: ["recruiting2.ultipro.com|AAM1000AAM|c5a88c41", { Id: "6f0e", Title: "Engineer" }],
    workable: ["Acme", { shortcode: "ABC123", title: "Engineer" }],
    jobvite: ["Acme", { id: "oAAA1", title: "Engineer", location: null, department: null }],
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

test("UKG names: skip browser logos, fall back to the board name, decode entities", () => {
  const browserOnly = `<img alt="Chrome logo"><img alt="Firefox logo"> "Id":"b1","BrandId":"x","Name":"The High Companies"`;
  assert.equal(ukgNameFromPage(browserOnly, "b1"), "The High Companies");
  assert.equal(ukgNameFromPage(`<img alt="AAM Brand">`, "b1"), "AAM");
  assert.equal(ukgNameFromPage(`"Id":"b1","BrandId":"x","Name":"Careers"`, "b1"), null);
  assert.equal(ukgNameFromPage(`"Id":"b1","BrandId":"x","Name":"JRayl Transport Opportunities"`, "b1"), "JRayl Transport");
  assert.equal(decodeName("Ollie&#x27;s Bargain Outlet"), "Ollie's Bargain Outlet");
  assert.equal(decodeName("All Green Lawn \\u0026 Pest"), "All Green Lawn & Pest");
});

test("UKG: generic board labels are not names; a tenant's boards share its best name", () => {
  assert.equal(ukgNameFromPage(`"Id":"b1","BrandId":"x","Name":"Default"`, "b1"), null);
  assert.equal(ukgNameFromPage(`"Id":"b1","BrandId":"x","Name":"Big 5 Sporting Goods Opt 1"`, "b1"), "Big 5 Sporting Goods");
  const reg = [
    { id: "h|BIG1000|b1", name: "Big 5 Sporting Goods" },
    { id: "h|BIG1000|b2", name: "Stores" },
    { id: "h|ZZZ1000|b3", name: "Default" },
  ];
  shareUkgNames(reg);
  assert.deepEqual(reg.map((r) => r.name), ["Big 5 Sporting Goods", "Big 5 Sporting Goods", "ZZZ1000"]);
});

test("Jobvite list page: departments, locations, hot-jobs duplicates", () => {
  const rows = parseJobviteList(`
    <div class="jv-featured-job"><div class="jv-featured-job-title"><a href="/acme/job/oAAA1">Coordinator</a></div></div>
    <h3 class="h2">Administrative &amp; Facility</h3>
    <table class="jv-job-list"><tbody><tr>
      <td class="jv-job-list-name"><a href="/acme/job/oAAA1">IT Project Coordinator<span class=""> | </span>Req#4720</a></td>
      <td class="jv-job-list-location">  Remote,\n  United States </td></tr>
    <tr><td class="jv-job-list-name"><a href="/acme/job/oBBB2">Architect</a></td>
      <td class="jv-job-list-location"><div class="jv-meta">2 Locations</div></td></tr></tbody></table>
    <a href="/acme/job/oBBB2/apply">Apply</a>`, "acme");
  assert.deepEqual(rows, [
    { id: "oAAA1", title: "IT Project Coordinator", location: "Remote, United States", department: "Administrative & Facility" },
    { id: "oBBB2", title: "Architect", location: null, department: "Administrative & Facility" },
  ]);
});

test("Jobvite company names come from the page title", () => {
  assert.equal(jobviteNameFromPage("<title>Abcam Careers</title>"), "Abcam");
  assert.equal(jobviteNameFromPage("<title>Careers | Jobvite</title>"), null);
  assert.equal(jobviteNameFromPage("<title>ActioNet Career Opportunities</title>"), "ActioNet");
});

test("Workable: a job listed once per location becomes one job with all its locations", () => {
  const loc = (city: string) => ({ city, region: "Illinois", country: "United States", countryCode: "US" });
  const rows = mergeWorkable([
    { shortcode: "A1", title: "Nurse", locations: [loc("Chicago")] },
    { shortcode: "A1", title: "Nurse", locations: [loc("Oak Park")] },
    { shortcode: "A1", title: "Nurse", locations: [loc("Chicago")] },
    { shortcode: "B2", title: "Driver", locations: [loc("Glenview")] },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].locations!.map((l) => l.city), ["Chicago", "Oak Park"]);
});

test("Jobvite: a Company column between title and location, and the detail meta line", () => {
  const rows = parseJobviteList(`<h3 class="h2">Accounting</h3><table class="jv-job-list"><tbody><tr>
    <td class="jv-job-list-name"><a href="/se/job/o5gR" title="x">Finance Manager</a></td>
    <td class="jv-job-company">Judd Wire Mexico, S.A. de C.V.</td>
    <td class="jv-job-list-location"> Aguascaliente,\n Aguascaliente </td></tr></tbody></table>`, "se");
  assert.deepEqual(rows, [{ id: "o5gR", title: "Finance Manager", location: "Aguascaliente, Aguascaliente", department: "Accounting" }]);
  assert.deepEqual(parseJobviteMeta(`\n Conservation<span class='jv-inline-separator'></span>\n  Toronto,\n  Ontario\n`), {
    department: "Conservation", location: "Toronto, Ontario",
  });
  assert.deepEqual(parseJobviteMeta(" Toronto,\n Ontario "), { department: null, location: "Toronto, Ontario" });
});
