import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { openDb } from "../crawler/db.ts";
import { discover, domainFromLine } from "../crawler/discover.ts";
import { Throttle, checkStore, enrich, type Http } from "../crawler/enrich.ts";
import type { Manifest } from "../src/format.ts";
import { httpFetcher, search } from "../src/search.ts";
import { monitorKey } from "../src/monitor.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "shopify-test-"));

test("domain lists: Tranco CSV and Common Crawl reversed vertices", () => {
  assert.equal(domainFromLine("17,Example.COM\r", "tranco"), "example.com");
  assert.equal(domainFromLine("123\tuk.co.acme\t4", "cc"), "acme.co.uk");
  assert.equal(domainFromLine("5,shopify.com", "tranco"), null);
  assert.equal(domainFromLine("9\tcom.myshopify.foo\t1", "cc"), null);
  assert.equal(domainFromLine("garbage", "tranco"), null);
});

/** Fake web: each store answers like Shopify does in the case it represents. */
function fakeWeb(): Http & { calls: string[] } {
  const meta = (name: string, extra = {}) => JSON.stringify({ name, myshopify_domain: `${name.toLowerCase().replace(/\W/g, "")}.myshopify.com`, currency: "USD", country: "US", city: "Austin", province: "Texas", ships_to_countries: ["US"], published_products_count: 12, published_collections_count: 2, ...extra });
  const home = `<html lang="en"><a href="mailto:hi@shop.test">mail</a><a href="https://www.instagram.com/shoptest">ig</a><script>Shopify.theme = {"name":"x","schema_name":"Dawn"};</script><script src="https://static.klaviyo.com/a.js"></script>`;
  const products = JSON.stringify({ products: [{ product_type: "Tea", vendor: "Leaf", published_at: new Date().toISOString(), variants: [{ price: "15.00" }] }] });
  const pages: Record<string, { status: number | "ERR"; body?: string; finalUrl?: string }> = {
    "https://live.test/meta.json": { status: 200, body: meta("Live Tea") },
    "https://live.test/": { status: 200, body: home },
    "https://live.test/pages/contact": { status: 200, body: `<a href="tel:+15125550100">call</a>` },
    "https://live.test/products.json?limit=250": { status: 200, body: products },
    // Same shop on a second domain: published once.
    "https://alias.test/meta.json": { status: 200, body: meta("Live Tea") },
    "https://alias.test/": { status: 200, body: home },
    "https://alias.test/products.json?limit=250": { status: 200, body: products },
    "https://pw.test/meta.json": { status: 200, body: meta("Soon") },
    "https://pw.test/": { status: 200, body: "<body class='template-password'>", finalUrl: "https://pw.test/password" },
    "https://closed.test/meta.json": { status: 402 },
    "https://headless.test/meta.json": { status: 200, body: "<!DOCTYPE html>" },
    "https://noread.test/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" },
    "https://slow.test/meta.json": { status: 429 },
    "https://gone.test/meta.json": { status: "ERR" },
  };
  const calls: string[] = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      const p = pages[url] ?? { status: 404 };
      return { status: p.status, body: p.body ?? "", finalUrl: p.finalUrl ?? url };
    },
  };
}

test("checkStore: each outcome", async () => {
  const web = fakeWeb();
  const go = (d: string) => checkStore(d, "2026-10-01T00:00:00.000Z", web, () => {});
  const live = await go("live.test");
  assert.equal(live.status, "live");
  assert.equal(live.record?.name, "Live Tea");
  assert.deepEqual(live.record?.emails, ["hi@shop.test"]);
  assert.deepEqual(live.record?.phones, ["+15125550100"]);
  assert.equal(live.record?.instagram, "https://www.instagram.com/shoptest");
  assert.equal(live.record?.theme, "Dawn");
  assert.deepEqual(live.record?.apps, ["Klaviyo"]);
  assert.equal(live.record?.productsAddedLast30Days, 1);
  assert.equal((await go("pw.test")).status, "password");
  assert.equal((await go("closed.test")).status, "closed");
  assert.equal((await go("headless.test")).status, "not_shopify");
  assert.equal((await go("noread.test")).status, "robots");
  assert.ok(!web.calls.includes("https://noread.test/meta.json"), "robots.txt said no, so meta.json is never requested");
  // A refusal on the catalog page retries the whole store rather than saving it half-empty.
  const half = fakeWeb();
  const realGet = half.get;
  half.get = async (u) => (u.endsWith("/products.json?limit=250") ? { status: 429, body: "", finalUrl: u } : realGet(u));
  assert.equal((await checkStore("live.test", "2026-10-01T00:00:00.000Z", half, () => {})).refused, true);
  // A cached robots.txt saves the request.
  const cached = fakeWeb();
  await checkStore("live.test", "2026-10-01T00:00:00.000Z", cached, () => {}, Date.now(), "User-agent: *\nDisallow: /admin\n");
  assert.ok(!cached.calls.includes("https://live.test/robots.txt"));
  assert.equal((await checkStore("live.test", "x", cached, () => {}, Date.now(), "User-agent: *\nDisallow: /\n")).status, "robots");
  const slow = await go("slow.test");
  assert.equal(slow.refused, true);
  assert.equal((await go("gone.test")).status, "error");
});

test("throttle: pauses on refusals, stops if they persist, recovers when clean", () => {
  const t = new Throttle(20);
  for (let i = 0; i < 200; i++) t.record(i < 30 ? 429 : 200, 0);
  assert.equal(t.limit, 10);
  assert.ok(t.pausedUntil > 0);
  for (let w = 0; w < 2; w++) for (let i = 0; i < 200; i++) t.record(i < 30 ? 430 : 200, 0);
  assert.equal(t.stopped, true);
  const ok = new Throttle(20);
  ok.limit = 5;
  for (let i = 0; i < 200; i++) ok.record(200, 0);
  assert.equal(ok.limit, 6);
});

test("discover -> enrich -> publish -> search, end to end", async () => {
  const dir = tmp();
  const db = openDb(join(dir, "t.db"));
  const list = join(dir, "vertices.txt.gz");
  const domains = ["live.test", "alias.test", "pw.test", "closed.test", "headless.test", "noread.test", "slow.test", "gone.test", "notshop.test"];
  writeFileSync(list, gzipSync(domains.map((d, i) => `${i}\t${d.split(".").reverse().join(".")}\t1`).join("\n")));
  const fakeDns = async (h: string) => (h.replace(/^www\./, "") === "notshop.test" ? ["93.184.216.34"] : ["23.227.38.32"]);

  // Two short runs: the second resumes where the first stopped.
  const first = await discover(db, { file: list, kind: "cc", budgetMs: Infinity, maxDomains: Infinity, concurrency: 4, resolve4: fakeDns });
  assert.equal(first.found, 8);
  assert.equal(first.finished, true);
  const again = await discover(db, { file: list, kind: "cc", budgetMs: Infinity, maxDomains: Infinity, concurrency: 4, resolve4: fakeDns });
  assert.equal(again.checked, 0, "a Common Crawl list is read once");

  const stats = await enrich(db, { budgetMs: Infinity, maxStores: Infinity, concurrency: 3, requestsPerSecond: 1000, http: fakeWeb() });
  assert.equal(stats.checked, 8);
  assert.equal(stats.outcomes.live, 2);
  assert.equal(stats.refusedStores, 1);
  const statuses = Object.fromEntries((db.prepare("SELECT domain, status FROM stores").all() as Array<{ domain: string; status: string }>).map((r) => [r.domain, r.status]));
  assert.equal(statuses["slow.test"], "new", "a refused store is retried later, not marked");
  assert.equal((db.prepare("SELECT fails FROM stores WHERE domain = 'slow.test'").get() as { fails: number }).fails, 1);
  assert.equal(statuses["pw.test"], "password");

  process.env.PUBLISH_LOCAL_DIR = join(dir, "kv");
  const { publish } = await import("../crawler/publish.ts");
  const pub = await publish(db);
  assert.equal(pub.totalStores, 1, "two domains of one shop are published once");
  delete process.env.PUBLISH_LOCAL_DIR;

  const manifest = JSON.parse(readFileSync(join(dir, "kv", "MANIFEST"), "utf8")) as Manifest;
  const all = await search(manifest, { maxResults: 10 }, httpFetcher);
  assert.equal(all.stores.length, 1);
  assert.equal((await search(manifest, { keywords: ["tea"], countries: ["us"], requireEmail: true, apps: ["klaviyo"], maxResults: 10 })).stores.length, 1);
  assert.equal((await search(manifest, { keywords: ["coffee"], maxResults: 10 })).stores.length, 0);
  assert.equal((await search(manifest, { requireSocials: ["tiktok"], maxResults: 10 })).stores.length, 0);
  assert.equal((await search(manifest, { seenAfter: "2999-01-01T00:00:00Z", maxResults: 10 })).stores.length, 0);
  assert.equal((await search(manifest, { sortBy: "mostProducts", minProducts: 10, maxProducts: 20, maxResults: 10 })).stores.length, 1);
  db.close();
});

test("search keeps only the top results for non-default sorts", async () => {
  const dir = tmp();
  const recs = Array.from({ length: 50 }, (_, i) => ({ domain: `s${i}.test`, name: `Store ${i}`, productCount: i, firstSeenAt: `2026-10-${String(1 + (i % 9)).padStart(2, "0")}T00:00:00Z`, productTypes: [], vendors: [], shipsToCountries: [], emails: [], phones: [], apps: [], productsAddedLast30Days: 0 }));
  writeFileSync(join(dir, "s0"), gzipSync(recs.map((r) => JSON.stringify(r)).join("\n")));
  const m: Manifest = { version: 1, indexedAt: "x", totalStores: 50, byCountry: {}, shards: [{ key: "s0", url: `file://${join(dir, "s0")}`, count: 50, newestFirstSeen: "2026-10-09", oldestFirstSeen: "2026-10-01" }] };
  const r = await search(m, { sortBy: "mostProducts", maxResults: 3 });
  assert.deepEqual(r.stores.map((s) => s.productCount), [49, 48, 47]);
  assert.equal(r.matched, 50);
});

test("monitor key ignores order and case", () => {
  assert.equal(monitorKey({ countries: ["US", "gb"] }, undefined), monitorKey({ countries: ["GB", "us"] }, undefined));
});
