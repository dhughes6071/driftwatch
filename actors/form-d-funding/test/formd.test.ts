import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exemptionName, parseFiling, parseXml, q, tidyName, INDUSTRY_SECTOR } from "../src/formd.ts";
import { addDays, daysBetween, parseSearch, EdgarClient } from "../src/edgar.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), "utf8");
const ref = (accessionNumber: string, cik: string) => ({ accessionNumber, cik, fileName: "primary_doc.xml", filedAt: "2026-10-13" });

test("parses a startup's SAFE round", () => {
  const f = parseFiling(fixture("company-safe"), ref("0002160087-26-000001", "2160087"));
  assert.equal(f.companyName, "ExBrain, Inc.");
  assert.equal(f.filingType, "New");
  assert.equal(f.sector, "Technology");
  assert.equal(f.industry, "Other Technology");
  assert.equal(f.isFund, false);
  assert.equal(f.yearOfIncorporation, 2025);
  assert.equal(f.city, "Austin");
  assert.equal(f.state, "TX");
  assert.equal(f.phone, "+1 415-813-0515");
  assert.equal(f.totalOfferingAmount, 1_000_000);
  assert.equal(f.totalAmountSold, 425_000);
  assert.equal(f.investorCount, 6);
  assert.equal(f.nonAccreditedInvestorCount, 4);
  assert.ok(f.securitiesOffered.includes("Other: Simple Agreements for Future Equity (SAFEs)"));
  assert.deepEqual(f.executives.map((p) => p.name), ["Dena Neek", "Cyrus Neek", "Afshin Sepehri"]);
  assert.equal(f.executives[0].title, "President and Chief Executive Officer");
  assert.match(f.executivesText, /^Dena Neek \(President and Chief Executive Officer\); /);
  assert.equal(f.filingUrl, "https://www.sec.gov/Archives/edgar/data/2160087/000216008726000001/0002160087-26-000001-index.htm");
});

test("parses a hedge fund amendment with an indefinite offering", () => {
  const f = parseFiling(fixture("fund-amendment"), ref("0000902664-26-004138", "2139851"));
  assert.equal(f.filingType, "Amendment");
  assert.equal(f.isFund, true);
  assert.equal(f.fundType, "Hedge Fund");
  assert.equal(f.totalOfferingAmount, null);
  assert.equal(f.offeringAmountIndefinite, true);
  assert.equal(f.stateOrCountryName, "Cayman Islands");
  assert.ok(f.exemptions.includes("Investment Company Act Section 3(c)(7)"));
  assert.ok(f.previousAccessionNumber);
  // The general partner is an entity filed with "-" as its first name.
  assert.ok(f.executives.every((p) => !p.name.startsWith("-")));
});

test("lists the brokers paid on a raise", () => {
  const f = parseFiling(fixture("broker"), ref("0000737875-26-000036", "737875"));
  assert.equal(f.industry, "Commercial Banking");
  assert.ok(f.salesBrokers.some((b) => b.includes("Performance Trust Capital Partners, LLC")));
});

test("keeps co-issuers", () => {
  const f = parseFiling(fixture("multi-issuer"), ref("0001618796-26-000003", "1618796"));
  assert.ok(f.otherIssuers.length >= 1);
  assert.ok(f.otherIssuers.includes("VERGER FUND II LLC"));
});

test("xml basics: entities, self-closing tags, CDATA, namespaces", () => {
  const doc = parseXml(`<?xml version="1.0"?><a:root><b>A &amp; B &#233;</b><c/><d><![CDATA[x < y]]></d></a:root>`);
  assert.equal(q(doc, "root", "b")?.text, "A & B é");
  assert.ok(q(doc, "root", "c"));
  assert.equal(q(doc, "root", "d")?.text, "x < y");
});

test("vocabularies", () => {
  assert.equal(exemptionName("06b"), "Rule 506(b)");
  assert.equal(exemptionName("3C.1"), "Investment Company Act Section 3(c)(1)");
  assert.equal(exemptionName("zz"), "zz");
  assert.equal(INDUSTRY_SECTOR["Pooled Investment Fund"], "Financial Services");
  assert.equal(tidyName("JOHN O'NEIL"), "John O'Neil");
  assert.equal(tidyName("McDonald"), "McDonald");
});

test("search hits", () => {
  const body = JSON.stringify({
    hits: {
      total: { value: 2 },
      hits: [
        { _id: "0002160087-26-000001:primary_doc.xml", _source: { ciks: ["0002160087"], display_names: ["ExBrain, Inc.  (CIK 0002160087)"], file_date: "2026-10-13", form: "D", biz_states: ["TX"] } },
        { _id: "bad", _source: {} },
      ],
    },
  });
  const r = parseSearch(body);
  assert.equal(r.total, 2);
  assert.deepEqual(r.hits, [
    { accessionNumber: "0002160087-26-000001", cik: "2160087", fileName: "primary_doc.xml", filedAt: "2026-10-13", form: "D", name: "ExBrain, Inc.", states: ["TX"] },
  ]);
});

test("dates", () => {
  assert.equal(addDays("2026-10-14", -6), "2026-10-08");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-01", "2026-10-14"), 13);
});

test("search splits ranges over the 10,000-hit window and walks newest first", async () => {
  const calls: string[] = [];
  const fake = (async (url: string) => {
    const u = new URL(url);
    const from = u.searchParams.get("startdt")!;
    const to = u.searchParams.get("enddt")!;
    calls.push(`${from}..${to}@${u.searchParams.get("from") ?? 0}`);
    // Over the window unless the range is a single day.
    const total = from === to ? 1 : 20_000;
    const hits = [{ _id: `${to}-x:primary_doc.xml`, _source: { ciks: ["1"], display_names: ["X"], file_date: to, form: "D" } }];
    return new Response(JSON.stringify({ hits: { total: { value: total }, hits } }), { status: 200 });
  }) as unknown as typeof fetch;
  const c = new EdgarClient(1000, fake);
  const seen: string[] = [];
  await c.search({ from: "2026-10-01", to: "2026-10-04" }, (h) => void seen.push(h.filedAt!));
  assert.deepEqual(seen, ["2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01"]);
});

test("retries rate-limit answers, then returns null on 404", async () => {
  let n = 0;
  const fake = (async () => {
    n++;
    return new Response("", { status: n === 1 ? 429 : 404 });
  }) as unknown as typeof fetch;
  const c = new EdgarClient(1000, fake);
  c.limiter.backOff = () => {}; // no real waiting in tests
  assert.equal(await c.get("https://www.sec.gov/x", "text/xml"), null);
  assert.equal(n, 2);
});
