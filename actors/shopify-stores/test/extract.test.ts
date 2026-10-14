import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEmails, extractPhones, extractSocials, mergePages, parseMeta, parsePage, parseProducts, robotsAllows } from "../crawler/extract.ts";

test("meta.json: Shopify's answer parses; other JSON or HTML does not", () => {
  const m = parseMeta(JSON.stringify({
    id: 1, name: " Acme Goods ", city: "Austin", province: "Texas", country: "us", currency: "usd", domain: "www.acme.test",
    url: "https://www.acme.test", myshopify_domain: "acme-goods.myshopify.com", description: "Things.", ships_to_countries: ["US", "CA"],
    published_products_count: 42, published_collections_count: 7,
  }));
  assert.ok(m);
  assert.equal(m.name, "Acme Goods");
  assert.equal(m.country, "US");
  assert.equal(m.currency, "USD");
  assert.deepEqual(m.shipsToCountries, ["US", "CA"]);
  assert.equal(m.productCount, 42);
  assert.equal(parseMeta("<!DOCTYPE html><html>"), null);
  assert.equal(parseMeta(JSON.stringify({ error: "not found" })), null);
});

test("emails: real addresses kept, code and placeholders dropped", () => {
  const html = `
    <a href="mailto:Hello@Acme.test?subject=Hi">Email us</a>
    <p>Wholesale: wholesale@acme.test</p>
    <img src="logo@2x.png"> <script>"https://abc@o123.ingest.sentry.io/1"</script>
    <input placeholder="your@email.com"> <p>noreply@acme.test</p> <p>do-not-reply@acme.test</p> <p>you@example.com</p> <p>name@domain.com</p>`;
  assert.deepEqual(extractEmails(html), ["hello@acme.test", "wholesale@acme.test"]);
  // Calling twice must give the same answer (no regex state carried over).
  assert.deepEqual(extractEmails(html), ["hello@acme.test", "wholesale@acme.test"]);
});

test("phones: tel: links, deduplicated, junk lengths dropped", () => {
  const html = `<a href="tel:+1%20512-555-0100">Call</a><a href="tel:15125550100">again</a><a href="tel:123">x</a><a href='tel:+44 20 7946 0000'>UK</a>`;
  assert.deepEqual(extractPhones(html), ["+1 512-555-0100", "+44 20 7946 0000"]);
  // Malformed percent-encoding (seen on a live store) must not throw.
  assert.doesNotThrow(() => extractPhones(`<a href="tel:%E0%A4%A">x</a>`));
  assert.doesNotThrow(() => extractEmails(`<a href="mailto:%E0%A4%A@x.test">x</a>`));
});

test("socials: profiles kept, share buttons and Shopify's own skipped", () => {
  const html = `
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
    <a href="https://www.facebook.com/AcmeGoods/">FB</a>
    <a href="https://instagram.com/p/abc123">post</a><a href="https://www.instagram.com/acme.goods">IG</a>
    <a href="https://twitter.com/intent/tweet?text=x">tweet</a><a href="https://x.com/acmegoods">X</a>
    <a href="https://www.tiktok.com/@acmegoods?lang=en">TT</a>
    <a href="https://www.youtube.com/@AcmeGoods">YT</a>
    <a href="https://pinterest.com/pin/create/button/">pin</a>
    <a href="https://www.linkedin.com/company/acme-goods/">LI</a>`;
  const s = extractSocials(html);
  assert.equal(s.facebook, "https://www.facebook.com/AcmeGoods");
  assert.equal(s.instagram, "https://www.instagram.com/acme.goods");
  assert.equal(s.twitter, "https://x.com/acmegoods");
  assert.equal(s.tiktok, "https://www.tiktok.com/@acmegoods");
  assert.equal(s.youtube, "https://www.youtube.com/@AcmeGoods");
  assert.equal(s.pinterest, null);
  assert.equal(s.linkedin, "https://www.linkedin.com/company/acme-goods");
});

test("page facts: theme, apps, language, password page", () => {
  const html = `<html class="no-js" lang="en-GB"><script>Shopify.theme = {"name":"LIVE - Theme 3.0","id":1,"schema_name":"Warehouse","role":"main"};</script>
    <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script><script src="https://cdn.judge.me/widget.js"></script>`;
  const p = parsePage(html, "https://acme.test/");
  assert.equal(p.theme, "Warehouse");
  assert.deepEqual(p.apps, ["Klaviyo", "Judge.me"]);
  assert.equal(p.language, "en-gb");
  assert.equal(p.passwordProtected, false);
  assert.equal(parsePage(`<script>Shopify.theme = {"name":"Custom\\/main","id":1};</script>`).theme, "Custom/main");
  assert.equal(parsePage("<html><body class='template-password'>", "https://acme.test/password").passwordProtected, true);
  const merged = mergePages(p, { ...p, emails: ["a@acme.test"], phones: ["+1 555 0100 000"] });
  assert.deepEqual(merged.emails, ["a@acme.test"]);
});

test("products.json page 1: price band, types, brands, recent activity", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const body = JSON.stringify({ products: [
    { product_type: "Tea", vendor: "Acme", published_at: "2026-10-10T09:00:00-05:00", variants: [{ price: "12.00" }, { price: "10.00" }] },
    { product_type: "Tea", vendor: "Acme", published_at: "2026-09-20T09:00:00Z", variants: [{ price: "20.00" }] },
    { product_type: "Mugs", vendor: "Other Co", published_at: "2026-05-01T09:00:00Z", variants: [{ price: "0" }, { price: "30.00" }] },
  ] });
  const c = parseProducts(body, now)!;
  assert.equal(c.priceMin, 10);
  assert.equal(c.priceMedian, 20);
  assert.equal(c.priceMax, 30);
  assert.deepEqual(c.productTypes, [{ name: "Tea", count: 2 }, { name: "Mugs", count: 1 }]);
  assert.deepEqual(c.vendors[0], { name: "Acme", count: 2 });
  assert.equal(c.newestProductAt, "2026-10-10T14:00:00.000Z");
  assert.equal(c.productsAddedLast30Days, 2);
  assert.equal(parseProducts("not json"), null);
});

test("robots.txt: Shopify's default allows our paths; specific rules are honoured", () => {
  const shopifyDefault = `User-agent: *\nDisallow: /admin\nDisallow: /cart\nDisallow: /checkout\nDisallow: /*/collections/*sort_by*\nDisallow: /search\n\nUser-agent: Nutch\nDisallow: /\n`;
  for (const p of ["/meta.json", "/", "/pages/contact", "/products.json"]) assert.equal(robotsAllows(shopifyDefault, p), true, p);
  assert.equal(robotsAllows(shopifyDefault, "/cart"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "/meta.json"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\nAllow: /meta.json$\n", "/meta.json"), true);
  // A group naming us wins over "*".
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\n\nUser-agent: CMMResearchBot\nDisallow: /private\n", "/meta.json"), true);
  assert.equal(robotsAllows("User-agent: CMMResearchBot\nDisallow: /\n", "/"), false);
  assert.equal(robotsAllows("", "/anything"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "/x"), true);
});
