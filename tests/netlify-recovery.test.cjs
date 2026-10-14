const test = require("node:test");
const assert = require("node:assert/strict");

const recoveryModule = import("../server/unavailable.mjs");
const origin = "https://nexo-governamental.netlify.app";

async function request(path, options) {
  const { default: recovery } = await recoveryModule;
  return recovery(new Request(`${origin}${path}`, options));
}

test("public pages and media signal a temporary failure without deindexing URLs", async () => {
  for (const path of [
    "/blog",
    "/blog/",
    "/blog/artigo-existente?source=/admin/",
    "/uploads/capa.webp",
    "/media/480/uploads/capa.webp",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get("retry-after"), "3600", path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal(response.headers.get("x-robots-tag"), null, path);
    const html = await response.text();
    assert.match(html, /Esta área está temporariamente indisponível/);
    assert.match(html, /href="\/"/);
    assert.match(html, /mailto:nexogov\.usp@gmail\.com/);
    assert.doesNotMatch(html, /noindex|rel="canonical"|railway|sqlite/i);
  }
});

test("administrative pages remain excluded from indexing", async () => {
  for (const path of ["/admin", "/admin/", "/admin/equipe"]) {
    const response = await request(path);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(
      await response.text(),
      /<meta name="robots" content="noindex, nofollow">/,
    );
  }
});

test("API operations return only an unavailable error and never echo supplied data", async () => {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await request("/api/admin/content?token=private-value", {
      method,
      ...(method === "GET" ? {} : { body: "private-request-body" }),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("retry-after"), "3600");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), {
      error: "Esta área está temporariamente indisponível",
      code: "TEMPORARILY_UNAVAILABLE",
    });
  }
});

test("sitemap and feed failures are not replaced with an empty successful document", async () => {
  for (const path of ["/blog/sitemap.xml", "/blog/feed.xml"]) {
    const response = await request(path);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.match(response.headers.get("content-type"), /^text\/plain/);
    assert.doesNotMatch(
      await response.text(),
      /canonical|noindex|<urlset|<rss/,
    );
  }
});

test("HEAD responses preserve GET status and headers with no body", async () => {
  for (const path of ["/blog/", "/admin/", "/api/session", "/blog/feed.xml"]) {
    const get = await request(path);
    const head = await request(path, { method: "HEAD" });
    assert.equal(head.status, get.status);
    assert.deepEqual([...head.headers], [...get.headers]);
    assert.equal(head.body, null);
    assert.equal(await head.text(), "");
  }
});
