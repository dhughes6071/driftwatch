import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countryHint, payFor } from "../src/jobs/pay.ts";

test("the job actor's pay reader is an exact copy of the Career API's", () => {
  const mine = readFileSync(new URL("../src/jobs/salary.ts", import.meta.url), "utf8");
  const theirs = readFileSync(new URL("../actors/career-jobs/src/salary.ts", import.meta.url), "utf8");
  assert.equal(mine.slice(mine.indexOf("\n") + 1), theirs, "copy actors/career-jobs/src/salary.ts over src/jobs/salary.ts (keep the first line)");
});

test("Ashby's structured pay wins over the description", () => {
  const p = payFor({
    location: "Remote",
    description: "Salary range: $50,000 - $60,000 per year",
    compensation: {
      compensationTiers: [{ components: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 211400, maxValue: 290600, summary: "$211.4K – $290.6K" }] }],
    },
  });
  assert.deepEqual([p.salaryMin, p.salaryMax, p.salarySource], [211400, 290600, "structured"]);
});

test("description pay, with a bare $ read as the local dollar", () => {
  const us = payFor({ location: "San Francisco, CA", description: "The base salary range for this role is $150,000 - $180,000.", compensation: undefined });
  assert.deepEqual([us.salaryMin, us.salaryMax, us.salaryCurrency, us.salaryPeriod, us.salarySource], [150000, 180000, "USD", "year", "description"]);
  const ca = payFor({ location: "Toronto, ON", description: "Salary range: $110,000 - $130,000 annually", compensation: undefined });
  assert.equal(ca.salaryCurrency, "CAD");
  const none = payFor({ location: "Austin, TX", description: "We raised $185 million in capital since 2018.", compensation: undefined });
  assert.equal(none.salaryMin, null);
});

test("country hint: Canadian and Australian locations, CA the US state is not Canada", () => {
  assert.equal(countryHint("Vancouver, BC"), "CA");
  assert.equal(countryHint("Sydney, NSW, Australia"), "AU");
  assert.equal(countryHint("Los Angeles, CA"), null);
  assert.equal(countryHint("Toronto, ON or New York, US"), null);
  assert.equal(countryHint(null), null);
});

test("Greenhouse pay ranges count as structured pay", () => {
  const p = payFor({
    location: "New York, NY",
    description: "Great team, great mission.",
    compensation: { payInputRanges: [{ min_cents: 13000000, max_cents: 15000000, currency_type: "USD", title: "Range" }] },
  });
  assert.deepEqual([p.salaryMin, p.salaryMax, p.salaryPeriod, p.salarySource], [130000, 150000, "year", "structured"]);
});

test("Lever descriptions include every section, so pay in a Compensation list is found", async () => {
  const { leverDescription } = await import("../src/jobs/ats.ts");
  const d = leverDescription({
    descriptionPlain: "Veeva is a mission-driven company.",
    lists: [
      { text: "Requirements", content: "<li>5+ years</li>" },
      { text: "Compensation", content: "<div><li>Base pay: $95,000 - $140,000</li></div>" },
    ],
    additionalPlain: "Veeva is an equal opportunity employer.",
  });
  assert.match(d, /Requirements\n5\+ years/);
  const p = payFor({ location: "New Jersey - Lyndhurst", description: d, compensation: undefined });
  assert.deepEqual([p.salaryMin, p.salaryMax, p.salaryPeriod], [95000, 140000, "year"]);
});
