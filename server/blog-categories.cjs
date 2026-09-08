const { randomUUID } = require("node:crypto");
const { CATEGORIES } = require("../shared/blog.cjs");

const categoryKey = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
function problem(message, statusCode = 400, code = "INVALID_CATEGORY") {
  throw Object.assign(new Error(message), { statusCode, code });
}
function categoryName(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value))
    problem("Informe um nome de até 80 caracteres.");
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80)
    problem("Informe um nome de até 80 caracteres.");
  return name;
}

function registerCategories(
  app,
  {
    db,
    transaction,
    timestamp,
    snapshot,
    actorFor,
    requireAuth,
    requireMutation,
  },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS blog_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1
  );`);
  // Seed once, including any categories already referenced by existing articles.
  transaction(() => {
    if (
      db
        .prepare(
          "SELECT value FROM settings WHERE key = 'blog_categories_initialized'",
        )
        .get()
    )
      return;
    const names = new Set(CATEGORIES);
    for (const row of db
      .prepare("SELECT draft, published FROM blog_posts")
      .all())
      for (const source of [row.draft, row.published])
        if (source) names.add(JSON.parse(source).category);
    for (const name of names)
      db.prepare(
        "INSERT OR IGNORE INTO blog_categories (id, name, name_key) VALUES (?, ?, ?)",
      ).run(randomUUID(), name, categoryKey(name));
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('blog_categories_initialized', ?)",
    ).run(timestamp());
  });
  const all = () =>
    db
      .prepare("SELECT id, name, version FROM blog_categories ORDER BY rowid")
      .all();
  const names = () => all().map((item) => item.name);
  const find = (id) =>
    typeof id === "string" && id.length <= 80
      ? db
          .prepare("SELECT id, name, version FROM blog_categories WHERE id = ?")
          .get(id)
      : null;
  const linkedRows = (name) =>
    db
      .prepare(
        "SELECT * FROM blog_posts WHERE json_extract(draft, '$.category') = ? OR json_extract(published, '$.category') = ?",
      )
      .all(name, name);
  const list = () =>
    all().map((item) => {
      const rows = linkedRows(item.name);
      return {
        ...item,
        articleCount: rows.length,
        publishedCount: rows.filter(
          (row) =>
            !row.archived &&
            row.published &&
            JSON.parse(row.published).category === item.name,
        ).length,
      };
    });
  const result = (change = null) => ({ categories: list(), change });
  const body = (value, keys) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key))
    )
      problem("A solicitação contém campos ausentes ou não reconhecidos.");
  };
  const current = (id, version) => {
    const item = find(id);
    if (!item)
      problem(
        "Categoria não encontrada. Atualize a lista.",
        404,
        "CATEGORY_NOT_FOUND",
      );
    if (!Number.isSafeInteger(version) || version < 1)
      problem("Informe a versão da categoria.");
    if (item.version !== version)
      problem(
        "Esta categoria mudou em outra sessão. Atualize a lista.",
        409,
        "CATEGORY_VERSION_CONFLICT",
      );
    return item;
  };
  const unique = (name, id = "") => {
    if (
      db
        .prepare(
          "SELECT id FROM blog_categories WHERE name_key = ? AND id != ?",
        )
        .get(categoryKey(name), id)
    )
      problem(
        "Já existe uma categoria com esse nome.",
        409,
        "CATEGORY_NAME_TAKEN",
      );
  };
  const moveArticles = (from, to, actor, action) => {
    for (const row of linkedRows(from)) {
      snapshot(row, `before-${action}`, actor);
      const draft = JSON.parse(row.draft);
      const published = row.published ? JSON.parse(row.published) : null;
      if (draft.category === from) draft.category = to;
      const publicChanged = published?.category === from;
      if (publicChanged) published.category = to;
      // Only replace the category in each snapshot; pending edits stay unpublished.
      db.prepare(
        "UPDATE blog_posts SET draft = ?, published = ?, version = version + 1, updated_at = ?, published_updated_at = ? WHERE id = ?",
      ).run(
        JSON.stringify(draft),
        published ? JSON.stringify(published) : null,
        timestamp(),
        publicChanged ? timestamp() : row.published_updated_at,
        row.id,
      );
      snapshot(
        db.prepare("SELECT * FROM blog_posts WHERE id = ?").get(row.id),
        action,
        actor,
      );
    }
  };
  app.get("/api/admin/blog-categories", { preHandler: requireAuth }, async () =>
    result(),
  );
  app.post(
    "/api/admin/blog-categories",
    { preHandler: requireMutation },
    async (request, reply) => {
      body(request.body, ["name"]);
      const name = categoryName(request.body.name);
      return reply.code(201).send(
        transaction(() => {
          unique(name);
          db.prepare(
            "INSERT INTO blog_categories (id, name, name_key) VALUES (?, ?, ?)",
          ).run(randomUUID(), name, categoryKey(name));
          return result();
        }),
      );
    },
  );
  app.put(
    "/api/admin/blog-categories/:id",
    { preHandler: requireMutation },
    async (request) => {
      body(request.body, ["name", "version"]);
      const name = categoryName(request.body.name);
      return transaction(() => {
        const item = current(request.params.id, request.body.version);
        unique(name, item.id);
        if (item.name === name) return result();
        moveArticles(item.name, name, actorFor(request), "rename-category");
        db.prepare(
          "UPDATE blog_categories SET name = ?, name_key = ?, version = version + 1 WHERE id = ?",
        ).run(name, categoryKey(name), item.id);
        return result({ from: item.name, to: name });
      });
    },
  );
  app.delete(
    "/api/admin/blog-categories/:id",
    { preHandler: requireMutation },
    async (request) => {
      body(request.body, ["version", "replacementId"]);
      return transaction(() => {
        const item = current(request.params.id, request.body.version);
        if (all().length === 1)
          problem(
            "Mantenha pelo menos uma categoria para organizar os artigos.",
            409,
            "LAST_CATEGORY",
          );
        const target =
          request.body.replacementId === null
            ? null
            : find(request.body.replacementId);
        if (
          request.body.replacementId !== null &&
          (!target || target.id === item.id)
        )
          problem("Escolha outra categoria para receber os artigos.");
        if (linkedRows(item.name).length && !target)
          problem(
            "Escolha a categoria que receberá os artigos antes de excluir.",
            409,
            "CATEGORY_IN_USE",
          );
        if (target)
          moveArticles(
            item.name,
            target.name,
            actorFor(request),
            "move-category",
          );
        db.prepare("DELETE FROM blog_categories WHERE id = ?").run(item.id);
        return result({ from: item.name, to: target?.name || null });
      });
    },
  );
  return { names };
}

module.exports = { registerCategories };
