#!/usr/bin/env node
/**
 * Production smoke test — read-only, no dependencies, no credentials.
 *
 *   node scripts/smoke-test.mjs https://your-store.example
 *
 * Crawls every sitemap URL plus internal links and checks the pre-launch
 * safeguards: no public prices, no purchase buttons, no newsletter, correct
 * canonical/robots/sitemap, closed checkout/payments, safe forms, protected
 * internal endpoints. Prints one compact JSON report; exits 1 on failure.
 * It never submits a real message: contact/order-status requests are only
 * sent while delivery is unconfigured (they are refused, nothing is stored).
 */
const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/smoke-test.mjs https://host");
  process.exit(2);
}
const host = new URL(base).host;
const failures = [];
const fail = (msg) => failures.push(msg);
const get = (path) => fetch(base + path, { redirect: "manual" });
const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: base, ...headers },
    body: JSON.stringify(body),
  });

// --- robots + sitemap
const robots = await (await get("/robots.txt")).text();
if (!robots.includes(`Sitemap: ${base}/sitemap.xml`)) fail("robots.txt sitemap line");
const sitemap = await (await get("/sitemap.xml")).text();
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length < 20) fail(`sitemap has only ${locs.length} URLs`);
for (const u of locs) if (new URL(u).host !== host) fail(`sitemap URL on wrong host: ${u}`);

// --- crawl
const seen = new Set();
const queue = ["/", ...locs.map((u) => new URL(u).pathname)];
const pageStats = { pages: 0 };
while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const res = await get(path);
  pageStats.pages++;
  if (res.status !== 200) {
    fail(`${path} -> HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
  if (/\$\s?\d/.test(text)) fail(`${path}: shows a dollar amount`);
  if (/Add to cart|Quick add|Buy now/i.test(text)) fail(`${path}: purchase button visible`);
  if (/newsletter/i.test(text)) fail(`${path}: newsletter text`);
  if (/to be confirmed|lorem ipsum|example\.com/i.test(text)) fail(`${path}: placeholder text`);
  if (/DATABASE_URL|CRON_SECRET|mysql:\/\/|sk_live|sk_test|whsec_/.test(html)) fail(`${path}: secret-like string in HTML`);
  if (html.includes("priceCents")) fail(`${path}: catalog price data present in page payload`);
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!["/cart", "/checkout", "/search", "/account"].includes(path) && (!canonical || new URL(canonical).host !== host)) {
    fail(`${path}: canonical ${canonical ?? "missing"}`);
  }
  for (const ld of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    if (/"Offer"|"price"/.test(ld[1])) fail(`${path}: Offer/price in structured data`);
  }
  if (!/CRESTMONT HOLDINGS LLC/.test(text) || !/231 S Bemiston Ave/.test(text) || !/Ste 850 PMB 332707/.test(text) || !/Saint Louis, MO 63105/.test(text)) {
    fail(`${path}: business identity/address missing from page`);
  }
  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const p = m[1];
    if (!p.startsWith("/_next") && !p.startsWith("/api") && !/\.(svg|png|ico|xml|txt)$/.test(p) && !seen.has(p)) queue.push(p);
  }
}
const notFound = await get("/this-page-does-not-exist");
if (notFound.status !== 404) fail(`404 page returned ${notFound.status}`);

// --- APIs and safeguards
const results = {};
const checkout = await post("/api/checkout", { lines: [{ sku: "CH-KIT-SCALE-BLK", quantity: 1 }] });
results.checkout = checkout.status;
if (checkout.status !== 503) fail(`checkout returned ${checkout.status}`);

const webhook = await fetch(base + "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" });
results.stripeWebhook = webhook.status;
if (webhook.status !== 503) fail(`stripe webhook returned ${webhook.status} (expected 503: Stripe not initialized)`);

const crossOrigin = await post("/api/contact", {}, { Origin: "https://evil.invalid" });
results.contactCrossOrigin = crossOrigin.status;
if (crossOrigin.status !== 403) fail(`cross-origin contact returned ${crossOrigin.status}`);

const contact = await post("/api/contact", { name: "Smoke Test", email: "smoke@test.invalid", subject: "other", message: "Automated smoke test - no delivery expected." });
results.contact = contact.status;
if (contact.status !== 503) fail(`contact returned ${contact.status} (expected 503 until email delivery is configured)`);

const tracking = await post("/api/order-tracking", { orderNumber: "CH-ZZZZ-ZZZZ", email: "nobody@test.invalid" });
const trackingBody = await tracking.json().catch(() => ({}));
results.orderLookup = tracking.status;
if (tracking.status !== 404 || !/couldn't find an order/i.test(trackingBody.error ?? "")) fail(`order lookup returned ${tracking.status}`);

for (const path of ["/api/internal/release-reservations", "/api/internal/db-health"]) {
  const r = await fetch(base + path, { method: "POST", headers: { Authorization: "Bearer wrong-wrong-wrong-wrong-wrong-wrong-wrong" } });
  results[`unauthorized ${path}`] = r.status;
  if (r.status !== 404) fail(`${path} without valid token returned ${r.status}`);
}

const head = await get("/");
for (const h of ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options"]) {
  if (!head.headers.get(h)) fail(`missing header ${h}`);
}
if (head.headers.get("x-powered-by")) fail("x-powered-by exposed");

console.log(JSON.stringify({ ok: failures.length === 0, base, crawled: pageStats.pages, sitemapUrls: locs.length, results, failures: failures.slice(0, 25) }));
process.exit(failures.length ? 1 : 0);
