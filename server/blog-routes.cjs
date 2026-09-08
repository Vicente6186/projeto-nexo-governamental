const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const {
  renderBlogIndex,
  renderBlogArticle,
  renderBlogNotFound,
} = require("./blog-pages.cjs");

const escape = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const { articleSchema, jsonLd } = require("./blog-seo.cjs");

function registerBlogPages(app, { blog, images, config, requireAuth, record }) {
  const origin = [...config.origins][0] || "http://127.0.0.1:3001";
  const templatePath = path.join(config.distDir, "blog/template.html");
  const siteInfo = (preview = false) =>
    JSON.parse(record()[preview ? "draft" : "published"]).site;

  function sendPage(
    reply,
    page,
    { preview = false, status = 200, article = null, noindex = false } = {},
  ) {
    if (!existsSync(templatePath))
      return reply
        .code(503)
        .type("text/plain; charset=utf-8")
        .send("O blog está sendo preparado. Tente novamente em instantes.");
    const canonical = new URL(page.canonicalPath || "/blog/", origin).href;
    const cover = new URL(
      page.ogImage || "/assets/brand-with-background.webp",
      origin,
    ).href;
    const robots =
      preview || status !== 200
        ? "noindex, nofollow"
        : noindex
          ? "noindex, follow"
          : "index, follow, max-image-preview:large";
    const meta = [
      `<title>${escape(page.title)}</title>`,
      `<meta name="description" content="${escape(page.description)}">`,
      `<meta name="robots" content="${robots}">`,
      ...(status === 200
        ? [`<link rel="canonical" href="${escape(canonical)}">`]
        : []),
      `<link rel="alternate" type="application/rss+xml" title="Blog do Nexo Governamental" href="${escape(origin)}/blog/feed.xml">`,
      `<meta property="og:type" content="${article ? "article" : "website"}">`,
      `<meta property="og:locale" content="pt_BR">`,
      `<meta property="og:site_name" content="Nexo Governamental XI de Agosto">`,
      `<meta property="og:title" content="${escape(page.title)}">`,
      `<meta property="og:description" content="${escape(page.description)}">`,
      `<meta property="og:url" content="${escape(canonical)}">`,
      `<meta property="og:image" content="${escape(cover)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escape(page.title)}">`,
      `<meta name="twitter:description" content="${escape(page.description)}">`,
      `<meta name="twitter:image" content="${escape(cover)}">`,
      ...(article?.coverAlt
        ? [
            `<meta property="og:image:alt" content="${escape(article.coverAlt)}">`,
            `<meta name="twitter:image:alt" content="${escape(article.coverAlt)}">`,
          ]
        : []),
      ...(article?.coverMedia
        ? [
            `<meta property="og:image:width" content="${article.coverMedia.width}">`,
            `<meta property="og:image:height" content="${article.coverMedia.height}">`,
          ]
        : []),
      ...(article?.publishedAt && !preview && status === 200
        ? [
            `<script type="application/ld+json">${jsonLd(articleSchema(article, origin))}</script>`,
          ]
        : []),
      ...(article?.publishedAt && !preview
        ? [
            `<meta property="article:published_time" content="${escape(article.publishedAt)}">`,
            `<meta property="article:modified_time" content="${escape(article.updatedAt)}">`,
          ]
        : []),
    ].join("\n");
    const html = readFileSync(templatePath, "utf8")
      .replace("<!--BLOG_META-->", () => meta)
      .replace("<!--BLOG_CONTENT-->", () => page.html);
    reply.header("Cache-Control", preview ? "private, no-store" : "no-cache");
    reply.header("X-Robots-Tag", robots);
    return reply.code(status).type("text/html; charset=utf-8").send(html);
  }

  app.get("/blog", async (request, reply) =>
    reply.code(301).redirect(request.url.replace(/^\/blog(?=\?|$)/, "/blog/")),
  );
  app.get("/blog/", async (request, reply) => {
    const preview = request.query.preview === "1";
    if (preview) await requireAuth(request);
    const search =
      typeof request.query.search === "string"
        ? request.query.search.trim().slice(0, 200)
        : "";
    const category =
      typeof request.query.category === "string"
        ? request.query.category.trim().slice(0, 80)
        : "";
    const candidate = Number(request.query.page || 1);
    const page =
      Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 1;
    const result = (preview ? blog.readPreviewList : blog.readList)({
      search,
      category,
      page,
    });
    if (
      !preview &&
      ((category && !result.categories.includes(category)) ||
        page > result.pages)
    )
      return sendPage(reply, renderBlogNotFound({ site: siteInfo() }), {
        status: 404,
      });
    const parameters = new URLSearchParams();
    if (category) parameters.set("category", category);
    if (search) parameters.set("search", search);
    if (page > 1) parameters.set("page", String(page));
    if (preview) parameters.set("preview", "1");
    const normalized = `/blog/${parameters.size ? `?${parameters}` : ""}`;
    // Keep tracking parameters for analytics; canonical excludes them.
    const input = new URL(request.url, origin);
    const known = new URLSearchParams(input.search);
    for (const name of [...known.keys()])
      if (!["category", "search", "page", "preview"].includes(name))
        known.delete(name);
    const needsNormalization = ["page", "search", "category", "preview"].some(
      (name) =>
        known.getAll(name).length > 1 ||
        (known.get(name) || "") !== (parameters.get(name) || ""),
    );
    if (!preview && needsNormalization)
      return reply.code(301).redirect(normalized);
    return sendPage(
      reply,
      renderBlogIndex({
        ...result,
        posts: await Promise.all(result.posts.map(images.enrich)),
        search,
        category,
        site: siteInfo(preview),
        preview,
      }),
      { preview, noindex: Boolean(search || (category && !result.total)) },
    );
  });
  app.get(
    "/blog/preview/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      let post = blog.readPreview(request.params.id);
      if (!post)
        return sendPage(
          reply,
          renderBlogNotFound({ site: siteInfo(true), preview: true }),
          { status: 404, preview: true },
        );
      post = await images.enrich(post);
      const related = blog
        .readPreviewList()
        .posts.filter((item) => item.id !== post.id)
        .slice(0, 3);
      return sendPage(
        reply,
        renderBlogArticle({
          post,
          related: await Promise.all(related.map(images.enrich)),
          site: siteInfo(true),
          preview: true,
        }),
        { preview: true, article: post },
      );
    },
  );
  app.get("/blog/:slug", async (request, reply) => {
    let post = blog.readPublished(request.params.slug);
    if (!post)
      return sendPage(reply, renderBlogNotFound({ site: siteInfo() }), {
        status: 404,
      });
    post = await images.enrich(post);
    const sameCategory = blog.readList({ category: post.category }).posts;
    const recent = blog.readList().posts;
    const related = [
      ...new Map(
        [...sameCategory, ...recent]
          .filter((item) => item.id !== post.id)
          .map((item) => [item.id, item]),
      ).values(),
    ].slice(0, 3);
    return sendPage(
      reply,
      renderBlogArticle({
        post,
        related: await Promise.all(related.map(images.enrich)),
        site: siteInfo(),
        preview: false,
      }),
      { article: post },
    );
  });
  app.get("/blog/:slug/", async (request, reply) =>
    reply
      .code(301)
      .redirect(
        `/blog/${encodeURIComponent(request.params.slug)}${new URL(request.url, origin).search}`,
      ),
  );
  app.get("/robots.txt", async (_, reply) =>
    reply
      .type("text/plain; charset=utf-8")
      .send(
        `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`,
      ),
  );
  app.get("/sitemap.xml", async (_, reply) =>
    reply
      .type("application/xml; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${escape(origin)}/sitemap-pages.xml</loc></sitemap><sitemap><loc>${escape(origin)}/blog/sitemap.xml</loc></sitemap></sitemapindex>`,
      ),
  );
  app.get("/sitemap-pages.xml", async (_, reply) =>
    reply
      .type("application/xml; charset=utf-8")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(origin)}/</loc></url></urlset>`,
      ),
  );
  app.get("/blog/sitemap.xml", async (_, reply) => {
    const posts = blog.sitemapPosts();
    const urls = [
      `<url><loc>${escape(origin)}/blog/</loc></url>`,
      ...[...new Set(posts.map((post) => post.category))]
        .sort()
        .map(
          (category) =>
            `<url><loc>${escape(origin)}/blog/?${escape(new URLSearchParams({ category }).toString())}</loc></url>`,
        ),
      ...posts.map(
        (post) =>
          `<url><loc>${escape(origin)}/blog/${escape(post.slug)}</loc><lastmod>${escape(post.updatedAt)}</lastmod>${post.coverImage ? `<image:image><image:loc>${escape(new URL(post.coverImage, origin).href)}</image:loc></image:image>` : ""}</url>`,
      ),
    ];
    return reply
      .header("Cache-Control", "no-cache")
      .type("application/xml; charset=utf-8")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("")}</urlset>`,
      );
  });
  app.get("/blog/feed.xml", async (_, reply) => {
    const posts = blog.readList({ sort: "latest" }).posts;
    const items = posts.map(
      (post) =>
        `<item><title>${escape(post.title)}</title><link>${escape(origin)}/blog/${escape(post.slug)}</link><guid isPermaLink="true">${escape(origin)}/blog/${escape(post.slug)}</guid><description>${escape(post.excerpt)}</description><category>${escape(post.category)}</category><pubDate>${escape(new Date(post.publishedAt).toUTCString())}</pubDate></item>`,
    );
    return reply
      .header("Cache-Control", "no-cache")
      .type("application/rss+xml; charset=utf-8")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog do Nexo Governamental</title><link>${escape(origin)}/blog/</link><description>Perspectivas sobre universidade, instituições e vida pública.</description><language>pt-BR</language>${items.join("")}</channel></rss>`,
      );
  });
}

module.exports = { registerBlogPages };
