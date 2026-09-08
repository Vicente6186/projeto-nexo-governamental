const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { buildApp } = require("../server/app.cjs");
const {
  emptyPost,
  CATEGORIES,
  slugify,
  renderMarkdown,
  readingMinutes,
  validatePost,
} = require("../shared/blog.cjs");

const origin = "http://localhost:8080";
async function fixture(t, env = { NODE_ENV: "test", CMS_LOCAL_PREVIEW: "1" }) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "nexo-blog-test-"));
  const distDir = path.join(dataDir, "dist");
  mkdirSync(path.join(distDir, "blog"), { recursive: true });
  writeFileSync(
    path.join(distDir, "blog/template.html"),
    '<!doctype html><html lang="pt-BR"><head><!--BLOG_META--></head><body><!--BLOG_CONTENT--></body></html>',
  );
  const apps = [];
  let instant = new Date("2026-09-07T12:00:00Z");
  const open = async (nextEnv = env) => {
    const app = await buildApp({
      env: nextEnv,
      logger: false,
      dataDir,
      distDir,
      now: () => instant,
    });
    apps.push(app);
    return app;
  };
  t.after(async () => {
    for (const app of apps) await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  const app = await open();
  const response = await app.inject({
    method: "POST",
    url: "/api/local-session",
    headers: { origin },
  });
  const headers =
    response.statusCode === 200
      ? {
          origin,
          cookie: `${response.cookies[0].name}=${response.cookies[0].value}`,
          "x-csrf-token": response.json().csrfToken,
        }
      : {};
  return {
    app,
    open,
    headers,
    tick: () => {
      instant = new Date(instant.getTime() + 10000);
    },
  };
}
const article = (overrides = {}) => ({
  ...emptyPost(),
  title: "Direito, universidade e sociedade",
  slug: "direito-universidade-e-sociedade",
  excerpt:
    "Uma reflexão sobre a aproximação entre a universidade e a sociedade.",
  body: "## Uma perspectiva aberta\n\nUm texto editorial para compartilhar conhecimento e incentivar perguntas sobre a vida em sociedade.",
  ...overrides,
});
async function create(app, headers, post = article()) {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/blog",
    headers,
    payload: { post },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().post;
}
async function action(app, headers, post, actionName) {
  const response = await app.inject({
    method: "POST",
    url: `/api/admin/blog/${post.id}/${actionName}`,
    headers,
    payload: { version: post.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().post;
}

test("blog previews are draft-only and seeded once without changing existing site content", async (t) => {
  const { app, open, headers } = await fixture(t);
  const before = (await app.inject("/api/content")).json();
  const list = (await app.inject({ url: "/api/admin/blog", headers })).json();
  assert.equal(list.posts.length, 3);
  assert.deepEqual(list.categories, CATEGORIES);
  for (const post of list.posts) {
    assert.equal(post.published, null);
    assert.match(post.draft.body, /Rascunho de exemplo/);
  }
  assert.equal((await app.inject("/api/blog")).json().total, 0);
  await app.close();
  const reopened = await open();
  assert.equal(
    (await reopened.inject({ url: "/api/admin/blog", headers })).json().posts
      .length,
    3,
  );
  assert.deepEqual((await reopened.inject("/api/content")).json(), before);
});

test("normal configuration starts an empty blog without demonstration drafts", async (t) => {
  const { app } = await fixture(t, { NODE_ENV: "test" });
  assert.deepEqual((await app.inject("/api/blog")).json(), {
    posts: [],
    total: 0,
    page: 1,
    pages: 1,
    categories: CATEGORIES,
  });
});

test("RSS keeps the newest publication visible when older featured posts fill the first page", async (t) => {
  const { app, headers, tick } = await fixture(t);
  for (let index = 0; index < 12; index++) {
    tick();
    await action(
      app,
      headers,
      await create(
        app,
        headers,
        article({ slug: `featured-${index}`, featured: true }),
      ),
      "publish",
    );
  }
  tick();
  const newest = await action(
    app,
    headers,
    await create(
      app,
      headers,
      article({ slug: "latest-publication", title: "Publicação mais recente" }),
    ),
    "publish",
  );
  assert.equal(
    (await app.inject("/api/blog"))
      .json()
      .posts.some((post) => post.id === newest.id),
    false,
  );
  const rss = await app.inject("/blog/feed.xml");
  assert.equal(rss.statusCode, 200);
  const { JSDOM } = require("jsdom");
  const feed = new JSDOM(rss.body, { contentType: "text/xml" });
  try {
    const items = [...feed.window.document.querySelectorAll("item")];
    assert.equal(items.length, 12);
    assert.equal(
      items[0].querySelector("title").textContent,
      newest.published.title,
    );
    const dates = items.map((item) =>
      Date.parse(item.querySelector("pubDate").textContent),
    );
    assert.deepEqual(
      dates,
      [...dates].sort((a, b) => b - a),
    );
  } finally {
    feed.window.close();
  }
});

test("all blog admin reads and mutations require a session, origin and CSRF", async (t) => {
  const { app, headers } = await fixture(t);
  const post = await create(app, headers);
  for (const url of ["/api/admin/blog", `/api/admin/blog/${post.id}`])
    assert.equal((await app.inject(url)).statusCode, 401);
  const requests = [
    { method: "POST", url: "/api/admin/blog", payload: { post: emptyPost() } },
    {
      method: "PUT",
      url: `/api/admin/blog/${post.id}`,
      payload: { post: post.draft, version: post.version },
    },
    ...["publish", "unpublish", "archive", "restore"].map((name) => ({
      method: "POST",
      url: `/api/admin/blog/${post.id}/${name}`,
      payload: { version: post.version },
    })),
  ];
  for (const request of requests) {
    assert.equal((await app.inject(request)).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          ...request,
          headers: { cookie: headers.cookie, origin },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          ...request,
          headers: { ...headers, origin: "https://foreign.example" },
        })
      ).statusCode,
      403,
    );
  }
});

test("drafts persist across restart; publication snapshots never expose later drafts", async (t) => {
  const { app, open, headers, tick } = await fixture(t);
  let post = await create(app, headers);
  assert.equal(
    (await app.inject(`/api/blog/${post.draft.slug}`)).statusCode,
    404,
  );
  post = await action(app, headers, post, "publish");
  const firstPublic = (await app.inject(`/api/blog/${post.draft.slug}`)).json()
    .post;
  assert.match(firstPublic.html, /<h2>Uma perspectiva aberta<\/h2>/);
  tick();
  const response = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    headers,
    payload: {
      version: post.version,
      post: {
        ...post.draft,
        title: "Texto privado em elaboração",
        body: "Segredo editorial exclusivo do rascunho.",
      },
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  post = response.json().post;
  assert.equal(post.version, 3);
  assert.deepEqual(
    (await app.inject(`/api/blog/${post.draft.slug}`)).json().post,
    firstPublic,
  );
  assert.equal((await app.inject("/api/blog?search=segredo")).json().total, 0);
  await app.close();
  const restarted = await open();
  const persisted = (
    await restarted.inject({ url: `/api/admin/blog/${post.id}`, headers })
  ).json().post;
  assert.equal(persisted.draft.title, "Texto privado em elaboração");
  assert.equal(persisted.published.title, article().title);
  post = await action(restarted, headers, persisted, "publish");
  const newPublic = (
    await restarted.inject(`/api/blog/${post.draft.slug}`)
  ).json().post;
  assert.equal(newPublic.title, post.draft.title);
  assert.equal(newPublic.publishedAt, firstPublic.publishedAt);
  assert.notEqual(newPublic.updatedAt, firstPublic.updatedAt);
});

test("optimistic versions reject stale saves and every stale publication action", async (t) => {
  const { app, headers } = await fixture(t);
  const original = await create(app, headers);
  const published = await action(app, headers, original, "publish");
  for (const name of ["publish", "unpublish", "archive", "restore"]) {
    const response = await app.inject({
      method: "POST",
      url: `/api/admin/blog/${original.id}/${name}`,
      headers,
      payload: { version: original.version },
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().currentVersion, published.version);
  }
  const response = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${original.id}`,
    headers,
    payload: { version: original.version, post: original.draft },
  });
  assert.equal(response.statusCode, 409);
});

test("article addresses cannot collide or silently change while published", async (t) => {
  const { app, headers } = await fixture(t);
  let first = await create(app, headers);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/admin/blog",
        headers,
        payload: { post: article() },
      })
    ).statusCode,
    409,
  );
  const second = await create(
    app,
    headers,
    article({ slug: "segundo-artigo" }),
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/admin/blog/${second.id}`,
        headers,
        payload: {
          version: second.version,
          post: { ...second.draft, slug: first.draft.slug },
        },
      })
    ).statusCode,
    409,
  );
  first = await action(app, headers, first, "publish");
  const attempt = {
    method: "PUT",
    url: `/api/admin/blog/${first.id}`,
    headers,
    payload: {
      version: first.version,
      post: { ...first.draft, slug: "novo-endereco" },
    },
  };
  assert.equal((await app.inject(attempt)).statusCode, 409);
  first = await action(app, headers, first, "unpublish");
  attempt.payload.version = first.version;
  assert.equal((await app.inject(attempt)).statusCode, 200);
  assert.equal(
    (await app.inject(`/api/blog/${article().slug}`)).statusCode,
    404,
  );
});

test("archive is reversible and restore never republishes an article", async (t) => {
  const { app, headers } = await fixture(t);
  let post = await create(app, headers);
  post = await action(app, headers, post, "publish");
  post = await action(app, headers, post, "archive");
  assert.equal(post.archived, true);
  assert.equal(post.published, null);
  assert.equal(
    (await app.inject(`/api/blog/${post.draft.slug}`)).statusCode,
    404,
  );
  assert.equal((await app.inject("/api/blog")).json().total, 0);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/admin/blog/${post.id}/publish`,
        headers,
        payload: { version: post.version },
      })
    ).statusCode,
    409,
  );
  post = await action(app, headers, post, "restore");
  assert.equal(post.archived, false);
  assert.equal(post.published, null);
  assert.equal((await app.inject("/api/blog")).json().total, 0);
  post = await action(app, headers, post, "publish");
  assert.equal(
    (await app.inject(`/api/blog/${post.draft.slug}`)).statusCode,
    200,
  );
});

test("public listing supports accent-insensitive search, category filters and bounded pagination", async (t) => {
  const { app, headers, tick } = await fixture(t);
  for (let index = 0; index < 15; index++) {
    tick();
    let post = await create(
      app,
      headers,
      article({
        title: `Reflexão pública ${index}`,
        slug: `reflexao-${index}`,
        category: index < 3 ? CATEGORIES[1] : CATEGORIES[0],
        tags: index === 0 ? ["Cidadania"] : [],
        featured: index === 0,
      }),
    );
    await action(app, headers, post, "publish");
  }
  const list = (await app.inject("/api/blog")).json();
  assert.equal(list.total, 15);
  assert.equal(list.pages, 2);
  assert.equal(list.posts.length, 12);
  assert.equal(list.posts[0].featured, true);
  assert.equal("body" in list.posts[0], false);
  assert.equal("html" in list.posts[0], false);
  assert.equal("draft" in list.posts[0], false);
  const last = (await app.inject("/api/blog?page=999")).json();
  assert.equal(last.page, 2);
  assert.equal(last.posts.length, 3);
  assert.equal(
    new Set([...list.posts, ...last.posts].map((post) => post.id)).size,
    15,
  );
  assert.equal(
    (await app.inject("/api/blog?search=reflexao%20publica")).json().total,
    15,
  );
  assert.equal(
    (await app.inject("/api/blog?search=cidadania")).json().total,
    1,
  );
  assert.equal(
    (
      await app.inject(
        `/api/blog?category=${encodeURIComponent(CATEGORIES[1])}`,
      )
    ).json().total,
    3,
  );
  assert.equal(
    (await app.inject("/api/blog?category=Unknown")).json().total,
    0,
  );
  assert.equal((await app.inject("/api/blog?page=-4")).json().page, 1);
});

test("latest sorting precedes pagination without changing the featured default", async (t) => {
  const { app, headers, tick } = await fixture(t);
  for (let index = 0; index < 15; index++) {
    tick();
    const post = await create(
      app,
      headers,
      article({
        title: `Publicação ${index}`,
        slug: `publicacao-${index}`,
        featured: index < 13,
      }),
    );
    await action(app, headers, post, "publish");
  }
  const normal = (await app.inject("/api/blog")).json();
  assert(normal.posts.every((post) => post.featured));
  const latest = (await app.inject("/api/blog?sort=latest")).json();
  assert.deepEqual(
    latest.posts.slice(0, 2).map((post) => post.slug),
    ["publicacao-14", "publicacao-13"],
  );
  assert.equal(latest.total, 15);
  assert.equal(latest.pages, 2);
  const last = (await app.inject("/api/blog?sort=latest&page=2")).json();
  assert.equal(last.posts.length, 3);
  assert.equal(
    new Set([...latest.posts, ...last.posts].map((post) => post.id)).size,
    15,
  );
  assert.deepEqual((await app.inject("/api/blog?sort=unknown")).json(), normal);
});

test("incomplete drafts can be saved but publication validates metadata, content and image accessibility", async (t) => {
  const { app, headers } = await fixture(t);
  const post = await create(app, headers, emptyPost());
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/admin/blog/${post.id}/publish`,
        headers,
        payload: { version: post.version },
      })
    ).statusCode,
    400,
  );
  for (const value of [
    article({ slug: "Com Espaço" }),
    article({ slug: "preview" }),
    article({ category: "Arbitrária" }),
    article({ tags: ["Nexo", "nexo"] }),
    article({ featured: "true" }),
    article({ coverImage: "javascript:alert(1)" }),
    article({ coverImage: "/assets/../private.png" }),
    { ...article(), unknown: "value" },
  ])
    assert.throws(() => validatePost(value), { statusCode: 400 });
  assert.throws(
    () =>
      validatePost(article({ coverImage: "/assets/introduction/usp.webp" }), {
        publishing: true,
      }),
    { statusCode: 400 },
  );
  assert.doesNotThrow(() =>
    validatePost(
      article({
        coverImage: "/assets/introduction/usp.webp",
        coverAlt: "Fachada da Faculdade",
      }),
      { publishing: true },
    ),
  );
  const bad = await app.inject({
    method: "POST",
    url: `/api/admin/blog/${post.id}/publish`,
    headers,
    payload: { version: "1" },
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(
    (await app.inject({ url: "/api/admin/blog/missing", headers })).statusCode,
    404,
  );
});

test("Markdown output escapes raw HTML, rejects executable URLs and protects external links", () => {
  const html = renderMarkdown(
    "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[USP](https://www.usp.br)\n\n![Arquivo](/uploads/example.png)",
  );
  assert.doesNotMatch(html, /<script|<img src=x/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /loading="lazy"/);
  for (const body of [
    "[x](javascript:alert%281%29)",
    "[x](jav&#x61;script:alert%281%29)",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "[x](vbscript:alert)",
    "[x](//evil.example)",
    "[x][ref]\n\n[ref]: javascript:alert%281%29",
  ]) {
    assert.throws(() => validatePost(article({ body })), { statusCode: 400 });
    assert.doesNotMatch(
      renderMarkdown(body),
      /(?:href|src)="(?:javascript|data|vbscript|\/\/)/i,
    );
  }
  assert.match(
    renderMarkdown("[Contato](mailto:nexogov.usp@gmail.com)"),
    /href="mailto:/,
  );
  assert.match(renderMarkdown("[Artigos](/blog/)"), /href="\/blog\/"/);
  assert.equal(
    slugify("  Política Pública & São Francisco!  "),
    "politica-publica-sao-francisco",
  );
  assert.equal(readingMinutes("palavra ".repeat(441)), 3);
});

test("blog errors identify duplicate addresses, stale versions and invalid fields distinctly", async (t) => {
  const { app, headers } = await fixture(t);
  const post = await create(app, headers);
  const duplicate = await app.inject({
    method: "POST",
    url: "/api/admin/blog",
    headers,
    payload: { post: article() },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().code, "SLUG_TAKEN");
  assert.equal(duplicate.json().field, "slug");
  await action(app, headers, post, "publish");
  const conflict = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    headers,
    payload: { version: post.version, post: post.draft },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, "VERSION_CONFLICT");
  assert.equal(conflict.json().currentVersion, 2);
  const invalid = await app.inject({
    method: "POST",
    url: "/api/admin/blog",
    headers,
    payload: { post: article({ tags: ["Nexo", "nexo"] }) },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, "VALIDATION_ERROR");
  assert.equal(invalid.json().field, "tags");
});

test("identical saves and republications preserve version and publication dates", async (t) => {
  const { app, headers, tick } = await fixture(t);
  let post = await create(app, headers);
  post = await action(app, headers, post, "publish");
  const published = (await app.inject(`/api/blog/${post.draft.slug}`)).json()
    .post;
  const revisions = (
    await app.inject({ url: `/api/admin/blog/${post.id}/revisions`, headers })
  ).json().revisions;
  tick();
  const unchanged = await action(app, headers, post, "publish");
  assert.deepEqual(unchanged, post);
  const save = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    headers,
    payload: { post: post.draft, version: post.version },
  });
  assert.equal(save.statusCode, 200, save.body);
  assert.deepEqual(save.json().post, post);
  assert.deepEqual(
    (await app.inject(`/api/blog/${post.draft.slug}`)).json().post,
    published,
  );
  assert.deepEqual(
    (
      await app.inject({ url: `/api/admin/blog/${post.id}/revisions`, headers })
    ).json().revisions,
    revisions,
  );
});

test("archived article previews remain authenticated, private and readable", async (t) => {
  const { app, headers } = await fixture(t);
  let post = await create(app, headers);
  post = await action(app, headers, post, "publish");
  post = await action(app, headers, post, "archive");
  const previewUrl = `/blog/preview/${post.id}`;
  assert.equal((await app.inject(previewUrl)).statusCode, 401);
  const preview = await app.inject({ url: previewUrl, headers });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.match(preview.body, /Uma perspectiva aberta/);
  assert.equal(preview.headers["cache-control"], "private, no-store");
  assert.equal(preview.headers["x-robots-tag"], "noindex, nofollow");
  assert.equal(
    (await app.inject(`/api/blog/${post.draft.slug}`)).statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ url: "/blog/?preview=1", headers })).body.includes(
      `/blog/preview/${post.id}`,
    ),
    false,
  );
});

test("article revisions persist after withdrawal and restart and restore only a draft", async (t) => {
  const { app, open, headers, tick } = await fixture(t);
  let post = await create(app, headers);
  post = await action(app, headers, post, "publish");
  tick();
  let response = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    headers,
    payload: {
      version: post.version,
      post: {
        ...post.draft,
        title: "Outro rascunho privado",
        body: "Um texto que nunca foi publicado.",
      },
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  post = response.json().post;
  post = await action(app, headers, post, "unpublish");
  assert.equal(post.published, null);
  await app.close();
  const reopened = await open();
  const historyUrl = `/api/admin/blog/${post.id}/revisions`;
  assert.equal((await reopened.inject(historyUrl)).statusCode, 401);
  const revisions = (await reopened.inject({ url: historyUrl, headers })).json()
    .revisions;
  assert.ok(
    revisions.some(
      (revision) =>
        revision.source === "draft" &&
        revision.title === "Outro rascunho privado",
    ),
  );
  const lastPublication = revisions.find(
    (revision) => revision.source === "published",
  );
  assert.equal(lastPublication.title, article().title);
  assert.ok(lastPublication.actor);
  assert.equal("post" in lastPublication, false);
  const revisionUrl = `${historyUrl}/${lastPublication.id}`;
  assert.equal((await reopened.inject(revisionUrl)).statusCode, 401);
  const revision = (await reopened.inject({ url: revisionUrl, headers })).json()
    .revision;
  assert.equal(revision.post.body, article().body);
  const restoreRequest = {
    method: "POST",
    url: `/api/admin/blog/${post.id}/restore-revision`,
    headers,
    payload: { revisionId: lastPublication.id, version: post.version },
  };
  assert.equal(
    (await reopened.inject({ ...restoreRequest, headers: {} })).statusCode,
    401,
  );
  assert.equal(
    (
      await reopened.inject({
        ...restoreRequest,
        headers: { origin, cookie: headers.cookie },
      })
    ).statusCode,
    403,
  );
  const foreign = await create(
    reopened,
    headers,
    article({ slug: "outro-artigo" }),
  );
  const wrongArticle = await reopened.inject({
    ...restoreRequest,
    url: `/api/admin/blog/${foreign.id}/restore-revision`,
    payload: { ...restoreRequest.payload, version: foreign.version },
  });
  assert.equal(wrongArticle.statusCode, 404);
  response = await reopened.inject(restoreRequest);
  assert.equal(response.statusCode, 200, response.body);
  post = response.json().post;
  assert.equal(post.draft.body, article().body);
  assert.equal(post.published, null);
  assert.equal(
    (await reopened.inject(`/api/blog/${post.draft.slug}`)).statusCode,
    404,
  );
  assert.equal((await reopened.inject(restoreRequest)).statusCode, 409);
  assert.equal(
    (await reopened.inject({ url: historyUrl, headers }))
      .json()
      .revisions.some((r) => r.title === "Outro rascunho privado"),
    true,
  );
});

test("revision restoration preserves the live address and live content", async (t) => {
  const { app, headers } = await fixture(t);
  let post = await create(
    app,
    headers,
    article({ slug: "endereco-anterior", title: "Texto anterior" }),
  );
  const revisions = (
    await app.inject({ url: `/api/admin/blog/${post.id}/revisions`, headers })
  ).json().revisions;
  const response = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    headers,
    payload: {
      version: post.version,
      post: {
        ...post.draft,
        slug: "endereco-publicado",
        title: "Texto publicado",
      },
    },
  });
  post = await action(app, headers, response.json().post, "publish");
  const restored = await app.inject({
    method: "POST",
    url: `/api/admin/blog/${post.id}/restore-revision`,
    headers,
    payload: { revisionId: revisions[0].id, version: post.version },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(restored.json().post.draft.slug, "endereco-publicado");
  assert.equal(restored.json().post.draft.title, "Texto anterior");
  assert.equal(restored.json().post.published.title, "Texto publicado");
  assert.equal(
    (await app.inject("/api/blog/endereco-publicado")).json().post.title,
    "Texto publicado",
  );
});

test("admin summaries paginate metadata and filter draft, pending and archived articles", async (t) => {
  const { app, headers, tick } = await fixture(t);
  let pending;
  for (let index = 0; index < 15; index++) {
    tick();
    let post = await create(
      app,
      headers,
      article({
        title: `Reflexão pública ${index}`,
        slug: `reflexao-${index}`,
        body: "termo-secreto-do-corpo ".repeat(500),
        category: index < 4 ? CATEGORIES[1] : CATEGORIES[0],
      }),
    );
    if (index < 5) post = await action(app, headers, post, "publish");
    if (index === 0) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/admin/blog/${post.id}`,
        headers,
        payload: {
          version: post.version,
          post: { ...post.draft, title: "Reflexão pública revisada" },
        },
      });
      pending = response.json().post;
    }
    if (index === 1) await action(app, headers, post, "archive");
  }
  const query = "/api/admin/blog?summary=1&search=reflexao%20publica";
  const response = await app.inject({ url: query, headers });
  const first = response.json();
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(first.counts, {
    all: 14,
    draft: 10,
    published: 4,
    pending: 1,
    archived: 1,
  });
  assert.equal(first.total, 14);
  assert.equal(first.pages, 2);
  assert.equal(first.posts.length, 12);
  assert.doesNotMatch(response.body, /termo-secreto-do-corpo/);
  for (const post of first.posts) {
    assert.equal("body" in post.draft, false);
    if (post.published) assert.equal("body" in post.published, false);
    assert.ok(post.readingMinutes > 1);
  }
  const second = (
    await app.inject({ url: `${query}&page=999`, headers })
  ).json();
  assert.equal(second.page, 2);
  assert.equal(second.posts.length, 2);
  assert.equal(
    new Set([...first.posts, ...second.posts].map((post) => post.id)).size,
    14,
  );
  const changes = (
    await app.inject({ url: `${query}&status=pending`, headers })
  ).json();
  assert.equal(changes.posts.length, 1);
  assert.equal(changes.posts[0].id, pending.id);
  assert.equal(changes.posts[0].hasChanges, true);
  assert.equal(
    (await app.inject({ url: `${query}&status=archived`, headers })).json()
      .posts[0].archived,
    true,
  );
  assert.equal(
    (
      await app.inject({
        url: `${query}&category=${encodeURIComponent(CATEGORIES[1])}`,
        headers,
      })
    ).json().total,
    3,
  );
  assert.equal(
    (
      await app.inject({ url: `${query}&status=published&page=-3`, headers })
    ).json().page,
    1,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/admin/blog?summary=1&search=naoexiste",
        headers,
      })
    ).json().total,
    0,
  );
  assert.equal(
    (await app.inject({ url: `/api/admin/blog/${pending.id}`, headers }))
      .json()
      .post.draft.body.includes("termo-secreto-do-corpo"),
    true,
  );
});
