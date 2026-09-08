const { randomUUID } = require("node:crypto");
const { registerCategories } = require("./blog-categories.cjs");
const {
  validatePost,
  readingMinutes,
  renderMarkdown,
  previewPosts,
} = require("../shared/blog.cjs");

function problem(message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, details);
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
    problem("A solicitação contém campos ausentes ou não reconhecidos.", 400, {
      code: "INVALID_REQUEST",
    });
  if (version && (!Number.isSafeInteger(body.version) || body.version < 1))
    problem("Informe a versão do artigo.", 400, {
      code: "INVALID_VERSION",
      field: "version",
    });
}
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function registerBlog(
  app,
  {
    db,
    now,
    config,
    requireAuth,
    requireMutation,
    validateAssetReference = () => {},
  },
) {
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
    CREATE TABLE IF NOT EXISTS blog_revisions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES blog_posts(id),
      source TEXT NOT NULL CHECK (source IN ('draft', 'published')),
      action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      actor TEXT,
      UNIQUE(post_id, version, source)
    );
    CREATE INDEX IF NOT EXISTS blog_revision_history ON blog_revisions (post_id, created_at DESC);
  `);
  db.function("blog_normalize", { deterministic: true }, normalize);
  db.function("blog_reading_minutes", { deterministic: true }, readingMinutes);
  const timestamp = () => now().toISOString();
  const find = (id) =>
    typeof id === "string" && id.length <= 80
      ? db.prepare("SELECT * FROM blog_posts WHERE id = ?").get(id)
      : undefined;
  const record = (row) => {
    const draft = JSON.parse(row.draft);
    return {
      id: row.id,
      draft,
      published: row.published ? JSON.parse(row.published) : null,
      version: row.version,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      archived: Boolean(row.archived),
      hasChanges:
        row.has_changes === undefined
          ? Boolean(row.published && row.draft !== row.published)
          : Boolean(row.has_changes),
      readingMinutes: row.reading_minutes ?? readingMinutes(draft.body),
    };
  };
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
        { code: "SLUG_TAKEN", field: "slug" },
      );
  };
  const snapshot = (row, action, actor) => {
    const at = timestamp();
    for (const source of ["draft", "published"]) {
      if (!row[source]) continue;
      db.prepare(
        "INSERT OR IGNORE INTO blog_revisions (id, post_id, source, action, created_at, version, snapshot, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        randomUUID(),
        row.id,
        source,
        action,
        at,
        row.version,
        row[source],
        actor || null,
      );
    }
  };
  const actorFor = (request) => {
    const session = request.cmsSession;
    return (
      session?.email ||
      session?.name ||
      (session?.preview ? "Prévia local" : config.email || config.name || null)
    );
  };
  const categories = registerCategories(app, {
    db,
    transaction,
    timestamp,
    snapshot,
    actorFor,
    requireAuth,
    requireMutation,
  });
  const validateDraft = (value, options) => {
    const post = validatePost(value, {
      ...options,
      categories: categories.names(),
    });
    if (post.coverImage)
      validateAssetReference(post.coverImage, {
        kind: "image",
        field: "coverImage",
      });
    return post;
  };
  const insert = (post, actor) => {
    assertSlug(post.slug);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO blog_posts (id, draft, version, updated_at, draft_slug) VALUES (?, ?, 1, ?, ?)",
    ).run(id, JSON.stringify(post), timestamp(), post.slug || null);
    const row = find(id);
    snapshot(row, "create", actor);
    return record(row);
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

  // Preserve the current state of articles created before revision history existed.
  transaction(() => {
    for (const row of allRows()) snapshot(row, "baseline", null);
  });

  function adminList(query) {
    const search = normalize(
      typeof query.search === "string" ? query.search.trim().slice(0, 200) : "",
    );
    const category =
      typeof query.category === "string" ? query.category.slice(0, 80) : "";
    const filters = [];
    const values = [];
    if (category) {
      filters.push("json_extract(draft, '$.category') = ?");
      values.push(category);
    }
    if (search) {
      filters.push(
        "instr(blog_normalize(json_extract(draft, '$.title') || ' ' || json_extract(draft, '$.excerpt') || ' ' || json_extract(draft, '$.author') || ' ' || json_extract(draft, '$.category') || ' ' || json_extract(draft, '$.tags')), ?) > 0",
      );
      values.push(search);
    }
    const where = filters.length ? filters.join(" AND ") : "1 = 1";
    const statusFilters = {
      all: "archived = 0",
      draft: "archived = 0 AND published IS NULL",
      published: "archived = 0 AND published IS NOT NULL",
      pending: "archived = 0 AND published IS NOT NULL AND draft != published",
      archived: "archived = 1",
    };
    const counts = Object.fromEntries(
      Object.entries(statusFilters).map(([status, filter]) => [
        status,
        db
          .prepare(
            `SELECT COUNT(*) AS total FROM blog_posts WHERE ${where} AND ${filter}`,
          )
          .get(...values).total,
      ]),
    );
    const status = Object.hasOwn(statusFilters, query.status)
      ? query.status
      : "all";
    const total = counts[status];
    const pages = Math.max(1, Math.ceil(total / 12));
    const requestedPage = Number(query.page || 1);
    const page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, pages)
        : 1;
    const rows = db
      .prepare(
        `SELECT id, json_remove(draft, '$.body') AS draft,
      CASE WHEN published IS NULL THEN NULL ELSE json_remove(published, '$.body') END AS published,
      version, published_at, updated_at, archived,
      CASE WHEN published IS NOT NULL AND draft != published THEN 1 ELSE 0 END AS has_changes,
      blog_reading_minutes(json_extract(draft, '$.body')) AS reading_minutes
      FROM blog_posts WHERE ${where} AND ${statusFilters[status]}
      ORDER BY updated_at DESC, rowid DESC LIMIT 12 OFFSET ?`,
      )
      .all(...values, (page - 1) * 12);
    return {
      posts: rows.map(record),
      total,
      page,
      pages,
      counts,
      categories: categories.names(),
    };
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
          (query.sort === "latest"
            ? 0
            : Number(b.featured) - Number(a.featured)) ||
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
      categories: categories.names(),
    };
  }
  const service = {
    sitemapPosts: () =>
      db
        .prepare(
          "SELECT published_slug AS slug, published_updated_at AS updatedAt, published FROM blog_posts WHERE published IS NOT NULL AND archived = 0 ORDER BY published_slug",
        )
        .all()
        .map((row) => {
          const post = JSON.parse(row.published);
          return {
            slug: row.slug,
            updatedAt: row.updatedAt,
            category: post.category,
            coverImage: post.coverImage,
          };
        }),
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
      return row ? expand(row, true) : null;
    },
  };

  app.get("/api/blog", async (request) => service.readList(request.query));
  app.get("/api/blog/:slug", async (request) => {
    const post = service.readPublished(request.params.slug);
    if (!post)
      problem("Artigo não encontrado.", 404, { code: "ARTICLE_NOT_FOUND" });
    return { post };
  });
  app.get("/api/admin/blog", { preHandler: requireAuth }, async (request) =>
    request.query.summary === "1"
      ? adminList(request.query)
      : {
          posts: allRows().map(record),
          categories: categories.names(),
        },
  );
  app.get(
    "/api/admin/blog/:id",
    { preHandler: requireAuth },
    async (request) => {
      const row = find(request.params.id);
      if (!row)
        problem("Artigo não encontrado.", 404, { code: "ARTICLE_NOT_FOUND" });
      return { post: record(row), categories: categories.names() };
    },
  );
  app.post(
    "/api/admin/blog",
    { preHandler: requireMutation },
    async (request, reply) => {
      requestBody(request.body, ["post"]);
      return reply.code(201).send({
        post: transaction(() =>
          insert(validateDraft(request.body.post), actorFor(request)),
        ),
      });
    },
  );
  app.get(
    "/api/admin/blog/:id/revisions",
    { preHandler: requireAuth },
    async (request) => {
      if (!find(request.params.id))
        problem("Artigo não encontrado.", 404, { code: "ARTICLE_NOT_FOUND" });
      return {
        revisions: db
          .prepare(
            "SELECT id, source, action, created_at AS createdAt, version, json_extract(snapshot, '$.title') AS title, actor FROM blog_revisions WHERE post_id = ? ORDER BY created_at DESC, rowid DESC",
          )
          .all(request.params.id),
      };
    },
  );
  app.get(
    "/api/admin/blog/:id/revisions/:revisionId",
    { preHandler: requireAuth },
    async (request) => {
      const revision = db
        .prepare(
          "SELECT id, source, action, created_at AS createdAt, version, json_extract(snapshot, '$.title') AS title, actor, snapshot FROM blog_revisions WHERE post_id = ? AND id = ?",
        )
        .get(request.params.id, request.params.revisionId);
      if (!revision)
        problem("Versão do artigo não encontrada.", 404, {
          code: "REVISION_NOT_FOUND",
        });
      const { snapshot: saved, ...metadata } = revision;
      return { revision: { ...metadata, post: JSON.parse(saved) } };
    },
  );
  const mutate = (id, body, action, actor) => {
    requestBody(
      body,
      action === "save"
        ? ["post", "version"]
        : action === "restore-revision"
          ? ["revisionId", "version"]
          : ["version"],
      true,
    );
    return transaction(() => {
      const row = find(id);
      if (!row)
        problem("Artigo não encontrado.", 404, { code: "ARTICLE_NOT_FOUND" });
      if (row.version !== body.version)
        problem(
          "Este artigo mudou em outra sessão. Recarregue a versão mais recente antes de continuar.",
          409,
          {
            code: "VERSION_CONFLICT",
            field: "version",
            currentVersion: row.version,
          },
        );
      if (row.archived && action !== "restore")
        problem("Restaure este artigo antes de editar ou publicar.", 409, {
          code: "ARTICLE_ARCHIVED",
        });
      if (!row.archived && action === "restore")
        problem("Este artigo não está arquivado.", 409, {
          code: "ARTICLE_NOT_ARCHIVED",
        });
      const draft = JSON.parse(row.draft);
      const nextVersion = row.version + 1;
      const at = timestamp();
      snapshot(row, "before-" + action, actor);
      if (action === "save") {
        const post = validateDraft(body.post);
        if (row.published && post.slug !== row.published_slug)
          problem(
            "O endereço de um artigo publicado não pode mudar. Retire a publicação antes de alterar o endereço.",
            409,
            { code: "PUBLISHED_SLUG_LOCKED", field: "slug" },
          );
        assertSlug(post.slug, id);
        if (JSON.stringify(post) === row.draft) return { post: record(row) };
        db.prepare(
          "UPDATE blog_posts SET draft = ?, draft_slug = ?, version = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(post), post.slug || null, nextVersion, at, id);
      } else if (action === "publish") {
        const post = validateDraft(draft, { publishing: true });
        assertSlug(post.slug, id);
        if (JSON.stringify(post) === row.published)
          return { post: record(row) };
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
          problem("Este artigo já está fora do site.", 409, {
            code: "ARTICLE_NOT_PUBLISHED",
          });
        db.prepare(
          "UPDATE blog_posts SET published = NULL, published_slug = NULL, published_at = NULL, published_updated_at = NULL, archived = ?, version = ?, updated_at = ? WHERE id = ?",
        ).run(Number(action === "archive"), nextVersion, at, id);
      } else if (action === "restore-revision") {
        if (typeof body.revisionId !== "string" || body.revisionId.length > 80)
          problem("Selecione uma versão do artigo.", 400, {
            code: "INVALID_REVISION",
            field: "revisionId",
          });
        const revision = db
          .prepare(
            "SELECT snapshot FROM blog_revisions WHERE id = ? AND post_id = ?",
          )
          .get(body.revisionId, id);
        if (!revision)
          problem("Versão do artigo não encontrada.", 404, {
            code: "REVISION_NOT_FOUND",
          });
        const previous = JSON.parse(revision.snapshot);
        // Restoring a draft must never change the URL of the article that is live.
        if (row.published) previous.slug = row.published_slug;
        // Historical content can be restored without reviving a removed category.
        if (!categories.names().includes(previous.category))
          previous.category = draft.category;
        const post = validateDraft(previous);
        assertSlug(post.slug, id);
        if (JSON.stringify(post) === row.draft) return { post: record(row) };
        db.prepare(
          "UPDATE blog_posts SET draft = ?, draft_slug = ?, version = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(post), post.slug || null, nextVersion, at, id);
      } else {
        db.prepare(
          "UPDATE blog_posts SET archived = 0, version = ?, updated_at = ? WHERE id = ?",
        ).run(nextVersion, at, id);
      }
      const updated = find(id);
      snapshot(updated, action, actor);
      return { post: record(updated) };
    });
  };
  app.put(
    "/api/admin/blog/:id",
    { preHandler: requireMutation },
    async (request) =>
      mutate(request.params.id, request.body, "save", actorFor(request)),
  );
  for (const action of [
    "publish",
    "unpublish",
    "archive",
    "restore",
    "restore-revision",
  ])
    app.post(
      `/api/admin/blog/:id/${action}`,
      { preHandler: requireMutation },
      async (request) =>
        mutate(request.params.id, request.body, action, actorFor(request)),
    );
  return service;
}

module.exports = { registerBlog };
