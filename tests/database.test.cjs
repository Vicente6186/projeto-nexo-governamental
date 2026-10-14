const test = require("node:test");
const assert = require("node:assert/strict");
const { openDatabase } = require("../server/database.cjs");
const { migrateBlogIndex, registerBlog } = require("../server/blog.cjs");
const { emptyPost, readingMinutes } = require("../shared/blog.cjs");

test("database adapter preserves local commit and rollback without a remote credential", (t) => {
  const db = openDatabase({ filename: ":memory:" });
  t.after(() => db.close());
  assert.equal(db.remote, false);
  db.exec("CREATE TABLE records (id TEXT PRIMARY KEY, value INTEGER NOT NULL)");
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO records VALUES (?, ?)").run("published", 1);
  db.exec("COMMIT");
  db.exec("BEGIN IMMEDIATE");
  db.prepare("UPDATE records SET value = ? WHERE id = ?").run(2, "published");
  db.exec("ROLLBACK");
  assert.equal(
    db.prepare("SELECT value FROM records WHERE id = ?").get("published").value,
    1,
  );
});

test("incomplete or unsafe remote database settings never fall back to a local database", () => {
  for (const options of [
    { url: "libsql://example.turso.io" },
    { authToken: "private" },
    { url: "http://example.turso.io", authToken: "private" },
    { url: "file:local.db", authToken: "private" },
    { url: "https://user:private@example.turso.io", authToken: "private" },
    { url: "https://example.turso.io?token=private", authToken: "private" },
    { url: "https://example.turso.io/path", authToken: "private" },
  ]) {
    assert.throws(
      () => openDatabase({ filename: ":memory:", ...options }),
      (error) => {
        assert.doesNotMatch(error.message, /private/);
        return true;
      },
    );
  }
});

for (const driver of ["node:sqlite", "libsql"]) {
  test(`blog index migration preserves saved drafts and works without SQL functions (${driver})`, (t) => {
    const db =
      driver === "node:sqlite"
        ? openDatabase({ filename: ":memory:" })
        : new (require("libsql"))(":memory:");
    t.after(() => db.close());
    db.exec(
      "CREATE TABLE blog_posts (id TEXT PRIMARY KEY, draft TEXT NOT NULL)",
    );
    const draft = JSON.stringify({
      title: "Reflexão pública",
      excerpt: "Diálogo",
      author: "João",
      category: "Políticas públicas",
      tags: ["cidadania"],
      body: "palavra ".repeat(441),
    });
    db.prepare("INSERT INTO blog_posts VALUES (?, ?)").run("legacy", draft);
    migrateBlogIndex(db);
    const row = db
      .prepare("SELECT * FROM blog_posts WHERE instr(draft_search, ?) > 0")
      .get("reflexao publica");
    assert.equal(row.id, "legacy");
    assert.equal(row.draft, draft);
    assert.match(row.draft_search, /joao politicas publicas/);
    assert.match(row.draft_search, /cidadania/);
    assert.equal(row.draft_reading_minutes, 3);
    migrateBlogIndex(db);
    const { _metadata, ...content } = row;
    assert.deepEqual(
      db
        .prepare("SELECT * FROM blog_posts")
        .all()
        .map((item) => ({ ...item })),
      [content],
    );
  });
}

test("native libsql supports blog publication, indexed search and version conflicts with no UDFs", async (t) => {
  const Fastify = require("fastify");
  const Database = require("libsql");
  const db = new Database(":memory:");
  const app = Fastify();
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  registerBlog(app, {
    db,
    now: () => new Date("2026-10-14T00:00:00Z"),
    config: { localPreview: false },
    requireAuth: async () => {},
    requireMutation: async () => {},
  });
  t.after(async () => {
    await app.close();
    db.close();
  });
  const draft = {
    ...emptyPost(),
    title: "Reflexão pública",
    slug: "reflexao-publica",
    excerpt: "Uma reflexão sobre instituições e a participação da sociedade.",
    body: "Uma reflexão pública sobre instituições. ".repeat(100),
  };
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/blog",
    payload: { post: draft },
  });
  assert.equal(created.statusCode, 201, created.body);
  const post = created.json().post;
  const published = await app.inject({
    method: "POST",
    url: `/api/admin/blog/${post.id}/publish`,
    payload: { version: post.version },
  });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal((await app.inject("/api/blog")).json().total, 1);
  const summary = (
    await app.inject("/api/admin/blog?summary=1&search=reflexao%20publica")
  ).json();
  assert.equal(summary.total, 1);
  assert.equal(summary.posts[0].readingMinutes, readingMinutes(draft.body));
  assert.equal("body" in summary.posts[0].draft, false);
  const conflict = await app.inject({
    method: "PUT",
    url: `/api/admin/blog/${post.id}`,
    payload: {
      version: post.version,
      post: { ...draft, title: "Alteração antiga" },
    },
  });
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().code, "VERSION_CONFLICT");
  assert.equal(
    (await app.inject("/api/blog/reflexao-publica")).json().post.title,
    draft.title,
  );
});
