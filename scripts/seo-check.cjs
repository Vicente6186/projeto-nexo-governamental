// Read-only verification of the HTML and discovery endpoints actually deployed.
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { args } = require("./cli.cjs");
const decode = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");

async function main() {
  const options = args(process.argv.slice(2), ["--url", "--canonical"]);
  const target = new URL(options["--url"] || "http://127.0.0.1:3001").origin;
  const canonicalOrigin = new URL(options["--canonical"] || target).origin;
  const checks = [];
  async function get(path, status = 200) {
    const response = await fetch(new URL(path, target), {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      response.status,
      status,
      `${path}: HTTP ${response.status}, esperado ${status}`,
    );
    return { response, text: await response.text() };
  }
  const locations = (xml, root) => {
    const dom = new JSDOM(xml, { contentType: "application/xml" });
    try {
      const document = dom.window.document;
      const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
      assert.equal(document.documentElement.localName, root);
      assert.equal(document.documentElement.namespaceURI, namespace);
      return [...document.getElementsByTagNameNS(namespace, "loc")].map(
        (element) => element.textContent,
      );
    } finally {
      dom.window.close();
    }
  };
  const indexable = (page) => {
    const dom = new JSDOM(page.text);
    try {
      const directives = [
        page.response.headers.get("x-robots-tag") || "",
        ...[
          ...dom.window.document.querySelectorAll(
            'meta[name="robots" i], meta[name="googlebot" i]',
          ),
        ].map((meta) => meta.content),
      ].join(", ");
      assert.doesNotMatch(
        directives,
        /\b(?:noindex|none)\b/i,
        "Página pública bloqueia indexação",
      );
    } finally {
      dom.window.close();
    }
  };
  const canonical = (html) =>
    decode(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || "");
  const robots = await get("/robots.txt");
  assert.deepEqual(
    robots.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      `Sitemap: ${canonicalOrigin}/sitemap.xml`,
    ],
    "robots.txt difere da política pública esperada",
  );
  checks.push(
    "robots.txt permite páginas públicas e aponta para o sitemap canônico",
  );
  const index = await get("/sitemap.xml");
  const maps = locations(index.text, "sitemapindex");
  assert.deepEqual(
    maps.sort(),
    [
      `${canonicalOrigin}/blog/sitemap.xml`,
      `${canonicalOrigin}/sitemap-pages.xml`,
    ].sort(),
  );
  const urls = [];
  for (const map of maps) {
    const document = await get(new URL(map).pathname);
    for (const url of locations(document.text, "urlset")) {
      assert.equal(new URL(url).origin, canonicalOrigin);
      assert.ok(!/[?&]preview=/.test(url));
      urls.push(url);
    }
  }
  checks.push("sitemaps válidos, no domínio público e sem prévias");
  for (const path of ["/", "/blog/"]) {
    const page = await get(path);
    indexable(page);
    assert.equal(canonical(page.text), `${canonicalOrigin}${path}`);
    assert.match(page.text, /<h1[\s>]/);
    assert.match(page.text, /<meta name="description" content="[^"]+"/);
  }
  checks.push(
    "página inicial e blog com HTML, título principal, descrição e canonical",
  );
  const search = await get("/blog/?search=verificacao-seo");
  assert.match(search.response.headers.get("x-robots-tag") || "", /noindex/);
  const missing = await get("/blog/verificacao-seo-artigo-inexistente", 404);
  assert.match(missing.response.headers.get("x-robots-tag") || "", /noindex/);
  assert.equal(canonical(missing.text), "");
  await get("/blog/?preview=1", 401);
  checks.push("buscas e erros fora do índice; prévias exigem autenticação");
  const articles = urls.filter(
    (url) =>
      /^\/blog\/[^/]+$/.test(new URL(url).pathname) && !new URL(url).search,
  );
  for (const url of articles.slice(0, 10)) {
    const page = await get(new URL(url).pathname);
    indexable(page);
    assert.equal(canonical(page.text), url);
    assert.match(
      page.response.headers.get("x-robots-tag") || "",
      /max-image-preview:large/,
    );
    const scripts = [
      ...page.text.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ];
    const graph = scripts.flatMap(
      (match) => JSON.parse(match[1])["@graph"] || [],
    );
    const article = graph.find((entry) => entry["@type"] === "BlogPosting");
    assert.ok(
      article?.headline && article?.author?.name && article?.datePublished,
    );
    assert.equal(article.url, url);
    assert.ok(graph.some((entry) => entry["@type"] === "BreadcrumbList"));
    assert.match(
      page.response.headers.get("content-security-policy") || "",
      /'sha256-/,
    );
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        target,
        canonicalOrigin,
        checks,
        publishedArticles: articles.length,
        sampledArticles: Math.min(articles.length, 10),
        note: articles.length
          ? "Verificação técnica; não comprova indexação nem posição no Google."
          : "Ainda não há artigos publicados para verificar no endereço público.",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
