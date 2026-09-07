const { randomUUID } = require("node:crypto");
const {
  CATEGORIES,
  validatePost,
  readingMinutes,
  renderMarkdown,
  previewPosts,
} = require("../shared/blog.cjs");

function problem(message, statusCode = 400, currentVersion) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (currentVersion) error.currentVersion = currentVersion;
  throw error;
}
function requestBody(body, keys, version = false) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== keys.length ||
    Object.keys(body).some((key) => !keys.includes(key))
  )
    problem("A solicitação contém campos ausentes ou não reconhecidos.");
  if (version && (!Number.isSafeInteger(body.version) || body.version < 1))
    problem("Informe a versão do artigo.");
}
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function registerBlog(app, { db, now, config, requireAuth, requireMutation }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      draft TEXT NOT NULL,
      published TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      published_at TEXT,
      published_updated_at TEXT,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      draft_slug TEXT UNIQUE,
      published_slug TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS blog_publication ON blog_posts (archived, published_at DESC);
  `);
  const timestamp = () => now().toISOString();
  const find = (id) =>
    typeof id === "string" && id.length <= 80
      ? db.prepare("SELECT * FROM blog_posts WHERE id = ?").get(id)
      : undefined;
  const record = (row) => ({
    id: row.id,
    draft: JSON.parse(row.draft),
    published: row.published ? JSON.parse(row.published) : null,
    version: row.version,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    archived: Boolean(row.archived),
  });
  const allRows = () =>
    db
      .prepare("SELECT * FROM blog_posts ORDER BY updated_at DESC, rowid DESC")
      .all();
  const transaction = (operation) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const assertSlug = (slug, id = "") => {
    if (!slug) return;
    if (
      db
        .prepare(
          "SELECT id FROM blog_posts WHERE id != ? AND (draft_slug = ? OR published_slug = ?)",
        )
        .get(id, slug, slug)
    )
      problem(
        "Este endereço já pertence a outro artigo. Escolha um endereço diferente.",
        409,
      );
  };
  const insert = (post) => {
    assertSlug(post.slug);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO blog_posts (id, draft, version, updated_at, draft_slug) VALUES (?, ?, 1, ?, ?)",
    ).run(id, JSON.stringify(post), timestamp(), post.slug || null);
    return record(find(id));
  };

  // The demonstration is restricted to explicitly enabled local preview and never publishes content.
  if (
    config.localPreview &&
    !db
      .prepare(
        "SELECT value FROM settings WHERE key = 'blog_preview_initialized'",
      )
      .get()
  ) {
    transaction(() => {
      if (!db.prepare("SELECT id FROM blog_posts LIMIT 1").get())
        for (const post of previewPosts()) insert(validatePost(post));
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('blog_preview_initialized', ?)",
      ).run(timestamp());
    });
  }

  const expand = (row, preview = false, includeBody = true) => {
    const post = JSON.parse(preview ? row.draft : row.published);
    const result = {
      ...post,
      id: row.id,
      readingMinutes: readingMinutes(post.body),
      publishedAt: row.published_at,
      updatedAt: preview ? row.updated_at : row.published_updated_at,
    };
    if (includeBody) result.html = renderMarkdown(post.body);
    else delete result.body;
    return result;
  };
  function list(query = {}, preview = false) {
    const search = normalize(
      typeof query.search === "string" ? query.search.trim().slice(0, 200) : "",
    );
    const category = typeof query.category === "string" ? query.category : "";
    const rows = allRows().filter(
      (row) => !row.archived && (preview || row.published),
    );
    const posts = rows
      .map((row) => expand(row, preview, false))
      .filter((post) => {
        if (category && post.category !== category) return false;
        if (!search) return true;
        return normalize(
          [
            post.title,
            post.excerpt,
            post.author,
            post.category,
            ...post.tags,
          ].join(" "),
        ).includes(search);
      })
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          String(b.publishedAt || b.updatedAt).localeCompare(
            String(a.publishedAt || a.updatedAt),
          ) ||
          b.id.localeCompare(a.id),
      );
    const pages = Math.max(1, Math.ceil(posts.length / 12));
    const requestedPage = Number(query.page || 1);
    const page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, pages)
        : 1;
    return {
      posts: posts.slice((page - 1) * 12, page * 12),
      total: posts.length,
      page,
      pages,
      categories: CATEGORIES,
    };
  }
  const service = {
    readList: (query) => list(query),
    readPreviewList: (query) => list(query, true),
    readPublished: (slug) => {
      if (typeof slug !== "string" || slug.length > 120) return null;
      const row = db
        .prepare(
          "SELECT * FROM blog_posts WHERE published_slug = ? AND published IS NOT NULL AND archived = 0",
        )
        .get(slug);
      return row ? expand(row) : null;
    },
    readPreview: (id) => {
      const row = find(id);
      return row && !row.archived ? expand(row, true) : null;
    },
  };

  app.get("/api/blog", async (request) => service.readList(request.query));
  app.get("/api/blog/:slug", async (request) => {
    const post = service.readPublished(request.params.slug);
    if (!post) problem("Artigo não encontrado.", 404);
    return { post };
  });
  app.get("/api/admin/blog", { preHandler: requireAuth }, async () => ({
    posts: allRows().map(record),
    categories: CATEGORIES,
  }));
  app.get(
    "/api/admin/blog/:id",
    { preHandler: requireAuth },
    async (request) => {
      const row = find(request.params.id);
      if (!row) problem("Artigo não encontrado.", 404);
      return { post: record(row) };
    },
  );
  app.post(
    "/api/admin/blog",
    { preHandler: requireMutation },
    async (request, reply) => {
      requestBody(request.body, ["post"]);
      const post = validatePost(request.body.post);
      return reply.code(201).send({ post: transaction(() => insert(post)) });
    },
  );
  const mutate = (id, body, action) => {
    requestBody(
      body,
      action === "save" ? ["post", "version"] : ["version"],
      true,
    );
    return transaction(() => {
      const row = find(id);
      if (!row) problem("Artigo não encontrado.", 404);
      if (row.version !== body.version)
        problem(
          "Este artigo mudou em outra sessão. Recarregue a versão mais recente antes de continuar.",
          409,
          row.version,
        );
      if (row.archived && action !== "restore")
        problem("Restaure este artigo antes de editar ou publicar.", 409);
      if (!row.archived && action === "restore")
        problem("Este artigo não está arquivado.", 409);
      const draft = JSON.parse(row.draft);
      const nextVersion = row.version + 1;
      const at = timestamp();
      if (action === "save") {
        const post = validatePost(body.post);
        if (row.published && post.slug !== row.published_slug)
          problem(
            "O endereço de um artigo publicado não pode mudar. Retire a publicação antes de alterar o endereço.",
            409,
          );
        assertSlug(post.slug, id);
        db.prepare(
          "UPDATE blog_posts SET draft = ?, draft_slug = ?, version = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(post), post.slug || null, nextVersion, at, id);
      } else if (action === "publish") {
        const post = validatePost(draft, { publishing: true });
        assertSlug(post.slug, id);
        db.prepare(
          "UPDATE blog_posts SET published = ?, published_slug = ?, published_at = ?, published_updated_at = ?, version = ?, updated_at = ? WHERE id = ?",
        ).run(
          JSON.stringify(post),
          post.slug,
          row.published_at || at,
          at,
          nextVersion,
          at,
          id,
        );
      } else if (action === "unpublish" || action === "archive") {
        if (action === "unpublish" && !row.published)
          problem("Este artigo já está fora do site.", 409);
        db.prepare(
          "UPDATE blog_posts SET published = NULL, published_slug = NULL, published_at = NULL, published_updated_at = NULL, archived = ?, version = ?, updated_at = ? WHERE id = ?",
        ).run(Number(action === "archive"), nextVersion, at, id);
      } else {
        db.prepare(
          "UPDATE blog_posts SET archived = 0, version = ?, updated_at = ? WHERE id = ?",
        ).run(nextVersion, at, id);
      }
      return { post: record(find(id)) };
    });
  };
  app.put(
    "/api/admin/blog/:id",
    { preHandler: requireMutation },
    async (request) => mutate(request.params.id, request.body, "save"),
  );
  for (const action of ["publish", "unpublish", "archive", "restore"])
    app.post(
      `/api/admin/blog/:id/${action}`,
      { preHandler: requireMutation },
      async (request) => mutate(request.params.id, request.body, action),
    );
  return service;
}

module.exports = { registerBlog };
