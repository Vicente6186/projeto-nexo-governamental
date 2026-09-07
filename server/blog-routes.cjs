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

function registerBlogPages(app, { blog, config, requireAuth, record }) {
  const origin = [...config.origins][0] || "http://127.0.0.1:3001";
  const templatePath = path.join(config.distDir, "blog/template.html");
  const siteInfo = (preview = false) =>
    JSON.parse(record()[preview ? "draft" : "published"]).site;

  function sendPage(
    reply,
    page,
    { preview = false, status = 200, article = null } = {},
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
    const meta = [
      `<title>${escape(page.title)}</title>`,
      `<meta name="description" content="${escape(page.description)}">`,
      `<meta name="robots" content="${preview || status !== 200 ? "noindex, nofollow" : "index, follow"}">`,
      `<link rel="canonical" href="${escape(canonical)}">`,
      `<link rel="alternate" type="application/rss+xml" title="Blog do Nexo Governamental" href="${escape(origin)}/blog/feed.xml">`,
      `<meta property="og:type" content="${article ? "article" : "website"}">`,
      `<meta property="og:locale" content="pt_BR">`,
      `<meta property="og:site_name" content="Nexo Governamental XI de Agosto">`,
      `<meta property="og:title" content="${escape(page.title)}">`,
      `<meta property="og:description" content="${escape(page.description)}">`,
      `<meta property="og:url" content="${escape(canonical)}">`,
      `<meta property="og:image" content="${escape(cover)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
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
    if (preview || status !== 200)
      reply.header("X-Robots-Tag", "noindex, nofollow");
    return reply.code(status).type("text/html; charset=utf-8").send(html);
  }

  app.get("/blog", async (request, reply) =>
    reply.redirect(request.url.replace(/^\/blog(?=\?|$)/, "/blog/")),
  );
  app.get("/blog/", async (request, reply) => {
    const preview = request.query.preview === "1";
    if (preview) await requireAuth(request);
    const result = (preview ? blog.readPreviewList : blog.readList)(
      request.query,
    );
    return sendPage(
      reply,
      renderBlogIndex({
        ...result,
        search:
          typeof request.query.search === "string"
            ? request.query.search.slice(0, 200)
            : "",
        category:
          typeof request.query.category === "string"
            ? request.query.category.slice(0, 80)
            : "",
        site: siteInfo(preview),
        preview,
      }),
      { preview },
    );
  });
  app.get(
    "/blog/preview/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const post = blog.readPreview(request.params.id);
      if (!post)
        return sendPage(reply, renderBlogNotFound({ site: siteInfo(true) }), {
          status: 404,
          preview: true,
        });
      const related = blog
        .readPreviewList()
        .posts.filter((item) => item.id !== post.id)
        .slice(0, 3);
      return sendPage(
        reply,
        renderBlogArticle({
          post,
          related,
          site: siteInfo(true),
          preview: true,
        }),
        { preview: true, article: post },
      );
    },
  );
  app.get("/blog/:slug", async (request, reply) => {
    const post = blog.readPublished(request.params.slug);
    if (!post)
      return sendPage(reply, renderBlogNotFound({ site: siteInfo() }), {
        status: 404,
      });
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
      renderBlogArticle({ post, related, site: siteInfo(), preview: false }),
      { article: post },
    );
  });
  app.get("/blog/:slug/", async (request, reply) =>
    reply
      .code(301)
      .redirect(`/blog/${encodeURIComponent(request.params.slug)}`),
  );
  app.get("/blog/sitemap.xml", async (_, reply) => {
    const first = blog.readList();
    const posts = [...first.posts];
    for (let page = 2; page <= first.pages; page++)
      posts.push(...blog.readList({ page }).posts);
    const urls = [
      `<url><loc>${escape(origin)}/blog/</loc></url>`,
      ...posts.map(
        (post) =>
          `<url><loc>${escape(origin)}/blog/${escape(post.slug)}</loc><lastmod>${escape(post.updatedAt)}</lastmod></url>`,
      ),
    ];
    return reply
      .header("Cache-Control", "no-cache")
      .type("application/xml; charset=utf-8")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
      );
  });
  app.get("/blog/feed.xml", async (_, reply) => {
    const posts = blog.readList().posts;
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
