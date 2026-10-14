const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("libsql");
const {
  checkTurso,
  transactionSandbox,
} = require("../scripts/check-turso.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-check-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "database.sqlite");
  const initial = new Database(filename);
  initial.exec("CREATE TABLE existing_data (value TEXT NOT NULL)");
  initial
    .prepare("INSERT INTO existing_data VALUES (?)")
    .run("unchanged-private-data");
  initial.close();
  const distDir = path.join(directory, "dist");
  for (const folder of ["", "admin", "blog"])
    fs.mkdirSync(path.join(distDir, folder), { recursive: true });
  fs.writeFileSync(
    path.join(distDir, "index.html"),
    "<!doctype html><html><head><title>Nexo</title></head><body><h1>Nexo</h1></body></html>",
  );
  fs.writeFileSync(
    path.join(distDir, "admin/index.html"),
    "<!doctype html><html><body>Painel</body></html>",
  );
  fs.writeFileSync(
    path.join(distDir, "blog/template.html"),
    "<!doctype html><html><head><!--BLOG_META--></head><body><!--BLOG_CONTENT--></body></html>",
  );
  return {
    filename,
    options: {
      env: {
        TURSO_DATABASE_URL: "libsql://check.example.test",
        TURSO_AUTH_TOKEN: "secret-auth-token",
        ADMIN_EMAIL: "admin@example.test",
        ADMIN_PASSWORD: "private-admin-password",
        CMS_ORIGIN: "https://nexo.example.test",
      },
      distDir,
      databaseFactory: () => new Database(filename),
    },
  };
}

function assertUnchanged(filename) {
  const database = new Database(filename);
  try {
    assert.deepEqual(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
      [{ name: "existing_data" }],
    );
    assert.equal(
      database.prepare("SELECT value FROM existing_data").get().value,
      "unchanged-private-data",
    );
  } finally {
    database.close();
  }
}

test("Turso check initializes and exercises the real app then rolls back all schema and data", async (t) => {
  const { filename, options } = fixture(t);
  const result = await checkTurso(options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks, [
    "conexão",
    "transações",
    "esquema",
    "rotas e proteção",
    "rollback sem dados permanentes",
  ]);
  assertUnchanged(filename);
});

test("Turso check rolls back application failures and does not reveal raw errors or credentials", async (t) => {
  const { filename, options } = fixture(t);
  await assert.rejects(
    checkTurso({
      ...options,
      appFactory: async ({ database }) => {
        database.exec("BEGIN IMMEDIATE");
        database
          .prepare("UPDATE existing_data SET value = ?")
          .run("temporary-change");
        database.exec("COMMIT");
        throw new Error(
          "secret-auth-token private-admin-password admin@example.test",
        );
      },
    }),
    (error) => {
      assert.equal(
        error.message,
        "A verificação falhou na etapa: aplicação e esquema.",
      );
      return true;
    },
  );
  assertUnchanged(filename);
});

test("transaction sandbox rejects attempts to commit its outer transaction", () => {
  const database = new Database(":memory:");
  try {
    database.exec("BEGIN IMMEDIATE");
    const sandbox = transactionSandbox(database);
    assert.throws(() => sandbox.exec("COMMIT"), /desbalanceada/);
    assert.throws(() => sandbox.exec("SELECT 1; COMMIT;"), /não suportada/);
    assert.throws(() => sandbox.prepare("COMMIT"), /não suportada/);
    database.exec("ROLLBACK");
  } finally {
    database.close();
  }
});
