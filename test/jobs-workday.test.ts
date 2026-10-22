import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCompanyEntry } from "../src/jobs/targets.ts";
import { fetchWorkdaySite, workdaySitesNamed, type WorkdayClient, type WorkdayJob } from "../src/jobs/workday-source.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the Workday client and registry are exact copies of the Workday actor's", () => {
  const mine = read("../src/jobs/workday.ts");
  assert.equal(mine.slice(mine.indexOf("\n") + 1), read("../actors/workday-jobs/src/workday.ts"), "copy actors/workday-jobs/src/workday.ts over src/jobs/workday.ts (keep the first line)");
  assert.equal(read("../src/jobs/names.json"), read("../actors/workday-jobs/src/names.json"), "copy actors/workday-jobs/src/names.json to src/jobs/names.json");
  const theirs = (JSON.parse(read("../actors/workday-jobs/src/sites.json")) as Array<Record<string, unknown>>).map(({ host, tenant, site }) => ({ host, tenant, site }));
  assert.deepEqual(JSON.parse(read("../src/jobs/workday-sites.json")), theirs, "regenerate src/jobs/workday-sites.json from actors/workday-jobs/src/sites.json");
});

test("Workday companies: career-site links, names and Workday ids", () => {
  const link = parseCompanyEntry("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/123");
  assert.deepEqual(link, { ats: "workday", slug: "nvidia", sites: [{ host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" }] });
  const named = parseCompanyEntry({ slug: "NVIDIA", ats: "workday" });
  assert.ok("sites" in named && named.sites.length >= 1 && named.sites[0].tenant === "nvidia");
  assert.ok(workdaySitesNamed("Morgan Stanley").some((s) => s.tenant === "ms"));
  assert.ok(workdaySitesNamed("ms").some((s) => s.tenant === "ms"));
  // Exact names only: a word that is part of many names finds nothing.
  assert.deepEqual(workdaySitesNamed("bank"), []);
  // Not in the registry and no link: skipped with a reason.
  assert.ok("skip" in parseCompanyEntry({ slug: "no-such-company-xyz", ats: "workday" }));
  // Greenhouse-style entries are unchanged.
  assert.deepEqual(parseCompanyEntry("stripe"), { slug: "stripe" });
});

/** A Workday client that serves a fixed list, recording which details were fetched. */
function fakeClient(postings: Array<{ title: string; locationsText: string; postedOn: string; desc?: string }>) {
  const details: string[] = [];
  const client = {
    async collect(_site: unknown, o: { onPosting: (p: object, cat: string | null) => boolean | void }) {
      for (const [i, p] of postings.entries()) {
        if (o.onPosting({ ...p, externalPath: `/job/${i}`, bulletFields: [`R${i}`] }, "Engineering")) return;
      }
    },
    async detail(_site: unknown, path: string) {
      details.push(path);
      const p = postings[Number(path.split("/").pop())];
      return { title: p.title, location: p.locationsText, jobDescription: p.desc ?? "<p>Build things.</p>", startDate: "2026-10-20", jobReqId: path.split("/").pop() };
    },
  };
  return { client: client as unknown as WorkdayClient, details };
}

const site = { host: "acme.wd5.myworkdayjobs.com", tenant: "acme", site: "External" };
const filters = { titleKeywords: [] as string[], locationKeywords: [] as string[], remoteOnly: false, needSalary: false, includeDescription: true };

test("Workday site: filters on the list row, fetches details only for candidates, in this Actor's shape", async () => {
  const { client, details } = fakeClient([
    { title: "Software Engineer", locationsText: "Austin, TX", postedOn: "Posted Today", desc: "<p>Pay: $120,000 - $150,000 per year</p>" },
    { title: "Store Manager", locationsText: "Austin, TX", postedOn: "Posted Today" },
    { title: "Data Engineer", locationsText: "Denver, CO", postedOn: "Posted 30+ Days Ago" },
  ]);
  const got: WorkdayJob[] = [];
  const listed = await fetchWorkdaySite(client, site, { ...filters, titleKeywords: ["engineer"], postedWithinDays: 7 }, {
    wanted: () => 100,
    stopped: () => false,
    deliver: (j) => (got.push(j), true),
    afterBatch: async () => {},
  });
  assert.equal(listed, 3);
  assert.deepEqual(details, ["/job/0"], "only the one row that can match gets a detail call");
  assert.equal(got.length, 1);
  const j = got[0];
  assert.equal(j.ats, "workday");
  assert.equal(j.companySlug, "acme");
  assert.equal(j.department, "Engineering");
  assert.equal(j.url, "https://acme.wd5.myworkdayjobs.com/External/job/0");
  assert.equal(j.pay.salaryAnnualMax, 150000);
  assert.equal(j.pay.salarySource, "description");
});

test("Workday site: stops listing once the run has enough", async () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ title: `Engineer ${i}`, locationsText: "Remote", postedOn: "Posted Today" }));
  const { client, details } = fakeClient(many);
  let taken = 0;
  await fetchWorkdaySite(client, site, { ...filters, includeDescription: false }, {
    wanted: () => 5 - taken,
    stopped: () => taken >= 5,
    deliver: () => (taken++, true),
    afterBatch: async () => {},
  });
  assert.equal(taken, 5);
  assert.deepEqual(details, [], "no description wanted and nothing uncertain: no detail calls");
});
