const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { buildApp } = require("../server/app.cjs");
const { emptyPost } = require("../shared/blog.cjs");

const ORIGIN = "http://localhost:8080";
async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-blog-pages-"));
  const distDir = path.join(directory, "dist");
  mkdirSync(path.join(distDir, "blog"), { recursive: true });
  writeFileSync(
    path.join(distDir, "blog/template.html"),
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><!--BLOG_META--></head><body><!--BLOG_CONTENT--></body></html>',
  );
  const app = await buildApp({
    dataDir: path.join(directory, "data"),
    distDir,
    logger: false,
    env: { NODE_ENV: "test", CMS_LOCAL_PREVIEW: "1", CMS_ORIGIN: ORIGIN },
    now: () => new Date("2026-09-07T15:00:00Z"),
  });
  t.after(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/local-session",
    headers: { origin: ORIGIN },
  });
  assert.equal(login.statusCode, 200, login.body);
  const headers = {
    origin: ORIGIN,
    cookie: `${login.cookies[0].name}=${login.cookies[0].value}`,
    "x-csrf-token": login.json().csrfToken,
  };
  async function create(overrides = {}) {
    const post = {
      ...emptyPost(),
      title: "Pesquisa e universidade em diálogo",
      slug: "pesquisa-e-universidade-em-dialogo",
      excerpt:
        "Uma reflexão sobre as relações entre a universidade e a vida pública.",
      body: "## Conhecimento compartilhado\n\nUma perspectiva editorial sobre **universidade e sociedade**.\n\n## Conversas abertas\n\nA construção do conhecimento convida ao diálogo.",
      ...overrides,
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/blog",
      headers,
      payload: { post },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json().post;
  }
  async function action(post, name) {
    const response = await app.inject({
      method: "POST",
      url: `/api/admin/blog/${post.id}/${name}`,
      headers,
      payload: { version: post.version },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().post;
  }
  return { app, headers, create, action };
}

function document(response) {
  assert.match(response.headers["content-type"], /text\/html/);
  return new JSDOM(response.body, { url: ORIGIN }).window.document;
}
function xml(response) {
  return new JSDOM(response.body, { contentType: "text/xml" }).window.document;
}

test("SSR pages, RSS and sitemap never expose unpublished drafts", async (t) => {
  const { app, create } = await fixture(t);
  const post = await create({
    title: "MARCADOR PRIVADO EDITORIAL",
    slug: "marcador-privado-editorial",
    body: "## Conteúdo reservado\n\nSEGREDO DO RASCUNHO",
  });
  const listing = await app.inject("/blog/");
  assert.equal(listing.statusCode, 200, listing.body);
  const page = document(listing);
  assert.equal(
    page.querySelectorAll('a[href="/blog/marcador-privado-editorial"]').length,
    0,
  );
  assert.doesNotMatch(
    listing.body,
    /MARCADOR PRIVADO EDITORIAL|SEGREDO DO RASCUNHO|Rascunho de exemplo/,
  );
  const article = await app.inject(`/blog/${post.draft.slug}`);
  assert.equal(article.statusCode, 404, article.body);
  assert.match(article.headers["x-robots-tag"], /noindex/);
  assert.doesNotMatch(
    article.body,
    /MARCADOR PRIVADO EDITORIAL|SEGREDO DO RASCUNHO/,
  );
  for (const endpoint of ["/blog/feed.xml", "/blog/sitemap.xml"]) {
    const result = await app.inject(endpoint);
    assert.equal(result.statusCode, 200, result.body);
    assert.doesNotMatch(
      result.body,
      /marcador-privado-editorial|MARCADOR PRIVADO EDITORIAL|SEGREDO DO RASCUNHO|conheca-o-nexo/,
    );
  }
  assert.equal(
    xml(await app.inject("/blog/feed.xml")).querySelectorAll("item").length,
    0,
  );
  assert.deepEqual(
    Array.from(
      xml(await app.inject("/blog/sitemap.xml")).querySelectorAll("loc"),
      (element) => element.textContent,
    ),
    [`${ORIGIN}/blog/`],
  );
  const redirect = await app.inject("/blog?search=universidade");
  assert.equal(redirect.statusCode, 302);
  assert.equal(redirect.headers.location, "/blog/?search=universidade");
});

test("editorial previews require authentication and remain private, unindexed and navigable", async (t) => {
  const { app, headers, create } = await fixture(t);
  const post = await create({ title: "Prévia editorial reservada" });
  const second = await create({
    title: "Outra reflexão reservada",
    slug: "outra-reflexao-reservada",
    featured: true,
  });
  for (const url of ["/blog/?preview=1", `/blog/preview/${post.id}`]) {
    const denied = await app.inject(url);
    assert.equal(denied.statusCode, 401, denied.body);
    assert.doesNotMatch(denied.body, /Prévia editorial reservada/);
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.headers["cache-control"], /private.*no-store/);
    assert.match(response.headers["x-robots-tag"], /noindex/);
    const page = document(response);
    assert.match(page.querySelector('meta[name="robots"]').content, /noindex/);
    assert.match(page.body.textContent, /Prévia editorial/);
    assert.match(page.body.textContent, /Prévia editorial reservada/);
    assert.ok(
      page.querySelector(`a[href="/blog/preview/${second.id}"]`),
      "Related draft links must stay inside authenticated preview routes",
    );
    assert.equal(
      page.querySelectorAll(`a[href="/blog/${second.draft.slug}"]`).length,
      0,
    );
  }
  const missing = await app.inject({ url: "/blog/preview/unknown", headers });
  assert.equal(missing.statusCode, 404, missing.body);
  assert.match(missing.headers["cache-control"], /no-store/);
  assert.match(missing.headers["x-robots-tag"], /noindex/);
});

test("published articles render complete HTML and metadata without JavaScript, escaping editorial input", async (t) => {
  const { app, create, action } = await fixture(t);
  const unsafeTitle = 'Direito <img src=x onerror="alert(1)"> & sociedade';
  const unsafeExcerpt =
    'Um resumo "><meta name="injected" content="yes"> com precisão editorial.';
  let post = await create({
    title: unsafeTitle,
    excerpt: unsafeExcerpt,
    author: 'Equipe <svg onload="alert(1)">',
    authorRole: 'Pesquisa & "Extensão"',
    tags: ["<script>alert(1)</script>"],
    body: '## Conhecimento em diálogo\n\nUma análise **acessível** com [referência](https://www.usp.br).\n\n<script>alert("x")</script>\n\n## Outra perspectiva\n\nPerguntas para a comunidade.',
  });
  post = await action(post, "publish");
  let related = await create({
    title: "Uma leitura relacionada",
    slug: "uma-leitura-relacionada",
  });
  related = await action(related, "publish");
  await create({
    title: "Texto privado fora das recomendações",
    slug: "texto-privado-fora-das-recomendacoes",
  });
  const response = await app.inject(`/blog/${post.draft.slug}`);
  assert.equal(response.statusCode, 200, response.body);
  assert.match(response.headers["cache-control"], /no-cache/);
  const page = document(response);
  assert.equal(page.querySelector("h1").textContent, unsafeTitle);
  assert.ok(page.title.startsWith(unsafeTitle));
  assert.equal(
    page.querySelector('meta[name="description"]').content,
    unsafeExcerpt,
  );
  assert.equal(
    page.querySelector('link[rel="canonical"]').href,
    `${ORIGIN}/blog/${post.draft.slug}`,
  );
  assert.equal(
    page.querySelector('meta[property="og:type"]').content,
    "article",
  );
  assert.equal(
    page.querySelector('meta[property="og:url"]').content,
    `${ORIGIN}/blog/${post.draft.slug}`,
  );
  assert.equal(
    page.querySelector('meta[property="article:published_time"]').content,
    post.publishedAt,
  );
  assert.equal(page.querySelector('meta[name="injected"]'), null);
  assert.equal(page.querySelectorAll("script, [onload], [onerror]").length, 0);
  assert.equal(
    page.querySelector(".article-body strong").textContent,
    "acessível",
  );
  assert.match(
    page.querySelector(".article-body").textContent,
    /<script>alert\(["“]x["”]\)<\/script>/,
  );
  const reference = page.querySelector(
    '.article-body a[href="https://www.usp.br"]',
  );
  assert.match(reference.rel, /noopener/);
  assert.ok(page.querySelector(`a[href="/blog/${related.draft.slug}"]`));
  assert.equal(
    page.querySelector('a[href="/blog/texto-privado-fora-das-recomendacoes"]'),
    null,
  );
  for (const link of page.querySelectorAll('.table-of-contents a[href^="#"]'))
    assert.ok(
      page.getElementById(link.getAttribute("href").slice(1)),
      "Every table-of-contents item points to an existing heading",
    );
  const search = await app.inject(
    `/blog/?search=${encodeURIComponent('\"><svg onload="alert(1)">')}`,
  );
  const searchPage = document(search);
  assert.equal(
    searchPage.querySelectorAll("[onload], [onerror], script").length,
    0,
  );
});

test("RSS and sitemap include only published snapshots and update immediately after withdrawal", async (t) => {
  const { app, headers, create, action } = await fixture(t);
  let post = await create({
    title: "Direito & pesquisa <em>aberta</em>",
    excerpt: "Conhecimento & sociedade: um debate <aberto>.",
  });
  post = await action(post, "publish");
  const canonical = `${ORIGIN}/blog/${post.draft.slug}`;
  const rss = await app.inject("/blog/feed.xml");
  assert.equal(rss.statusCode, 200, rss.body);
  assert.match(rss.headers["content-type"], /application\/rss\+xml/);
  const feed = xml(rss);
  assert.equal(feed.querySelectorAll("item").length, 1);
  assert.equal(feed.querySelector("item title").textContent, post.draft.title);
  assert.equal(
    feed.querySelector("item description").textContent,
    post.draft.excerpt,
  );
  assert.equal(feed.querySelector("item link").textContent, canonical);
  assert.equal(feed.querySelector("item guid").textContent, canonical);
  assert.equal(feed.querySelector("item em"), null);
  const sitemap = xml(await app.inject("/blog/sitemap.xml"));
  assert.ok(
    Array.from(
      sitemap.querySelectorAll("loc"),
      (element) => element.textContent,
    ).includes(canonical),
  );
  const saved = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    headers,
    payload: {
      version: post.version,
      post: { ...post.draft, title: "Um novo rascunho ainda privado" },
    },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  post = saved.json().post;
  assert.equal(
    xml(await app.inject("/blog/feed.xml")).querySelector("item title")
      .textContent,
    post.published.title,
  );
  post = await action(post, "unpublish");
  assert.equal(
    xml(await app.inject("/blog/feed.xml")).querySelectorAll("item").length,
    0,
  );
  assert.equal(
    xml(await app.inject("/blog/sitemap.xml")).querySelectorAll("url").length,
    1,
  );
  assert.equal((await app.inject(`/blog/${post.draft.slug}`)).statusCode, 404);
});
