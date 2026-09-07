const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
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
  const apps = [];
  let instant = new Date("2026-09-07T12:00:00Z");
  const open = async (nextEnv = env) => {
    const app = await buildApp({
      env: nextEnv,
      logger: false,
      dataDir,
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
