import { test } from "node:test";
import assert from "node:assert/strict";
import * as O from "../sources/oracle.ts";
import * as S from "../sources/smartrecruiters.ts";

const NOW = "2026-09-27T12:00:00.000Z";

test("Oracle posting -> index job: id, URL, remote from workplace, joined description", () => {
  const site = { host: "jpmc.fa.oraclecloud.com", site: "CX_1001", name: "JPMorgan Chase" };
  const { job, description } = O.toIndexJob(
    site,
    {
      Id: "210778204",
      Title: " Risk Lead ",
      PostedDate: "2026-09-27",
      PrimaryLocation: "New York, NY, United States",
      PrimaryLocationCountry: "US",
      JobFamily: "Credit Risk",
      secondaryLocations: [{ Name: "Jersey City, NJ" }],
    },
    { ExternalDescriptionStr: "<p>About the role</p>", ExternalQualificationsStr: "<ul><li>SQL</li></ul>", WorkplaceType: "Remote", JobSchedule: "Full time" },
    NOW,
  );
  assert.equal(job.id, "oracle:jpmc:210778204");
  assert.equal(job.title, "Risk Lead");
  assert.equal(job.companyName, "JPMorgan Chase");
  assert.equal(job.url, "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210778204");
  assert.deepEqual(job.additionalLocations, ["Jersey City, NJ"]);
  assert.equal(job.remote, true);
  assert.equal(job.employmentType, "Full time");
  assert.equal(job.postedAt, "2026-09-27T00:00:00.000Z");
  assert.equal(description, "About the role\n\n- SQL");
});

test("SmartRecruiters posting -> index job: company name, hybrid flag, country code", () => {
  const { job, description } = S.toIndexJob(
    "BoschGroup",
    {
      id: "744000152035059",
      name: "Systemberater",
      releasedDate: "2026-09-27T19:58:45.105Z",
      company: { identifier: "BoschGroup", name: "Bosch Group" },
      location: { city: "Hamburg", region: "HH", country: "de", fullLocation: "Hamburg, HH, Germany", remote: false, hybrid: true },
      function: { label: "Sales" },
      typeOfEmployment: { label: "Full-time" },
    },
    { postingUrl: "https://jobs.smartrecruiters.com/BoschGroup/744000152035059-x", jobAd: { sections: { jobDescription: { text: "<p>Do things</p>" } } } },
    NOW,
  );
  assert.equal(job.id, "smartrecruiters:boschgroup:744000152035059");
  assert.equal(job.companyName, "Bosch Group");
  assert.equal(job.country, "DE");
  assert.equal(job.remote, false);
  assert.equal(job.remoteEligible, true);
  assert.equal(job.workplaceType, "Hybrid");
  assert.equal(job.department, "Sales");
  assert.equal(description, "Do things");
});
