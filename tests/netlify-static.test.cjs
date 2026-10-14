const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { JSDOM } = require("jsdom");
const {
  SITE_ORIGIN,
  renderRecoveryHtml,
  buildNetlifyStatic,
} = require("../scripts/build-netlify-static.cjs");

const source = fs.readFileSync(
  path.join(__dirname, "../src/index.html"),
  "utf8",
);

function documentOf(t, html, options = {}) {
  const dom = new JSDOM(html, { url: `${SITE_ORIGIN}/`, ...options });
  t.after(() => dom.window.close());
  return dom.window.document;
}

test("static recovery preserves indexable institutional HTML, metadata and public navigation", (t) => {
  const before = documentOf(t, source);
  const after = documentOf(t, renderRecoveryHtml(source));
  assert.equal(after.head.innerHTML, before.head.innerHTML);
  assert.equal(
    after.querySelector('link[rel="canonical"]').href,
    `${SITE_ORIGIN}/`,
  );
  assert.equal(after.querySelector('meta[name="robots"]'), null);
  assert.equal(
    after.querySelector("h1").textContent,
    before.querySelector("h1").textContent,
  );
  assert.equal(
    after.querySelector('script[type="application/ld+json"]').textContent,
    before.querySelector('script[type="application/ld+json"]').textContent,
  );
  for (const selector of [
    "#introduction",
    "#about",
    "#objective",
    "#recognize",
    "#more",
    "#instagram",
    "#contact",
    "footer",
  ])
    assert.equal(
      after.querySelector(selector).outerHTML,
      before.querySelector(selector).outerHTML,
    );
  assert.ok(after.querySelector('a[href="/blog/"]'));
  assert.ok(after.querySelector('a[href="/admin/"]'));
  assert.equal(
    after.querySelector("#contact-form").getAttribute("action"),
    "mailto:nexogov.usp@gmail.com",
  );
});

test("recovery does not present unknown selection status, historical calls to action or invented blog contents", (t) => {
  const before = documentOf(t, source);
  const selection = before.querySelector("#selective-process");
  selection.insertAdjacentHTML(
    "beforeend",
    '<a href="https://example.test/application">Inscreva-se</a><p>RASCUNHO_PRIVADO_PROCESSO</p>',
  );
  before.querySelector("#journal-latest").innerHTML =
    '<a href="/blog/rascunho-nao-publicado">RASCUNHO_PRIVADO_ARTIGO</a>';
  const html = renderRecoveryHtml(before.documentElement.outerHTML);
  const after = documentOf(t, html);
  const recovered = after.querySelector("#selective-process");
  assert.match(recovered.textContent, /confirmar as informações atuais/);
  assert.equal(recovered.querySelectorAll("a").length, 1);
  assert.equal(recovered.querySelector("a").getAttribute("href"), "#contact");
  assert.equal(
    recovered.querySelector("img, time, #selective-process-schedule"),
    null,
  );
  assert.doesNotMatch(
    recovered.textContent,
    /fechado|abertas|edital|Cronograma|Inscreva-se/,
  );
  assert.doesNotMatch(
    html,
    /RASCUNHO_PRIVADO|example\.test\/application|rascunho-nao-publicado/,
  );
  assert.equal(
    after.querySelector("[data-journal-message]").textContent,
    "Publicações temporariamente indisponíveis.",
  );
  assert.equal(
    after.querySelectorAll("#journal-latest a, #journal-latest time").length,
    0,
  );
  assert.doesNotMatch(
    after.querySelector("#journal-latest").textContent,
    /Novas publicações em breve|Carregando|Nenhuma publicação/,
  );
});

test("recovery output preserves discovery endpoints without fabricating publication dates or a blog snapshot", (t) => {
  const distDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "nexo-static-recovery-"),
  );
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(distDir, "index.html"), source);
  fs.mkdirSync(path.join(distDir, "blog"));
  fs.writeFileSync(
    path.join(distDir, "blog/sitemap.xml"),
    "existing-blog-response",
  );
  fs.writeFileSync(
    path.join(distDir, "google42b90ef871b3befd.html"),
    "existing-verification",
  );
  const output = buildNetlifyStatic({ distDir });
  assert.deepEqual(output.sort(), [
    "404.html",
    "_headers",
    "index.html",
    "robots.txt",
    "sitemap-pages.xml",
    "sitemap.xml",
  ]);
  const robots = fs.readFileSync(path.join(distDir, "robots.txt"), "utf8");
  assert.equal(
    robots,
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  );
  const sitemapText = fs.readFileSync(
    path.join(distDir, "sitemap.xml"),
    "utf8",
  );
  const sitemap = documentOf(t, sitemapText, {
    contentType: "application/xml",
  });
  assert.equal(sitemap.documentElement.localName, "sitemapindex");
  assert.deepEqual(
    [...sitemap.querySelectorAll("loc")].map((node) => node.textContent),
    [`${SITE_ORIGIN}/sitemap-pages.xml`, `${SITE_ORIGIN}/blog/sitemap.xml`],
  );
  const pagesText = fs.readFileSync(
    path.join(distDir, "sitemap-pages.xml"),
    "utf8",
  );
  const pages = documentOf(t, pagesText, { contentType: "application/xml" });
  assert.deepEqual(
    [...pages.querySelectorAll("loc")].map((node) => node.textContent),
    [`${SITE_ORIGIN}/`],
  );
  assert.doesNotMatch(sitemapText + pagesText, /lastmod|preview|draft|railway/);
  assert.equal(
    fs.readFileSync(path.join(distDir, "blog/sitemap.xml"), "utf8"),
    "existing-blog-response",
  );
  assert.equal(
    fs.readFileSync(path.join(distDir, "google42b90ef871b3befd.html"), "utf8"),
    "existing-verification",
  );
  assert.equal(fs.existsSync(path.join(distDir, "api")), false);
  const notFound = documentOf(
    t,
    fs.readFileSync(path.join(distDir, "404.html"), "utf8"),
  );
  assert.equal(
    notFound.querySelector("h1").textContent,
    "Página não encontrada",
  );
  assert.match(
    notFound.querySelector('meta[name="robots"]').content,
    /noindex/,
  );
  assert.equal(notFound.querySelector('link[rel="canonical"]'), null);
  assert.equal(notFound.querySelector("a").getAttribute("href"), "/");
  assert.equal(notFound.querySelector("script"), null);
  const publicHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const publicPage = documentOf(t, publicHtml);
  const schemaHash = createHash("sha256")
    .update(
      publicPage.querySelector('script[type="application/ld+json"]')
        .textContent,
    )
    .digest("base64");
  const headers = fs.readFileSync(path.join(distDir, "_headers"), "utf8");
  assert.equal(headers.split(`'sha256-${schemaHash}'`).length - 1, 2);
  assert.match(headers, /^\/\n  Content-Security-Policy:/);
  assert.match(headers, /\n\/index\.html\n  Content-Security-Policy:/);
  for (const endpoint of [
    "/",
    "/index.html",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap-pages.xml",
  ]) {
    const rule = headers
      .split("\n")
      .slice(headers.split("\n").indexOf(endpoint) + 1);
    const nextPath = rule.findIndex((line) => line.startsWith("/"));
    assert.ok(
      rule
        .slice(0, nextPath === -1 ? undefined : nextPath)
        .includes("  Cache-Control: public, max-age=0, must-revalidate"),
    );
  }
});

test("recovery refuses a different canonical instead of publishing against the wrong domain", () => {
  assert.throws(
    () =>
      renderRecoveryHtml(
        source.replace(
          'rel="canonical" href="https://nexo-governamental.netlify.app/"',
          'rel="canonical" href="https://wrong.example/"',
        ),
      ),
    /endereço canônico público/,
  );
});
