const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { openDatabase } = require("../server/database.cjs");

function transactionSandbox(database) {
  const savepoints = [];
  let sequence = 0;
  const control =
    /(?:^|;)\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
  return {
    remote: true,
    prepare(sql) {
      if (control.test(sql))
        throw new Error("Transação não suportada na verificação.");
      return database.prepare(sql);
    },
    exec(sql) {
      const command = sql.trim().replace(/;\s*$/, "").toUpperCase();
      if (
        /^BEGIN(?: (?:DEFERRED|IMMEDIATE|EXCLUSIVE))?(?: TRANSACTION)?$/.test(
          command,
        )
      ) {
        const name = `nexo_check_${++sequence}`;
        database.exec(`SAVEPOINT ${name}`);
        savepoints.push(name);
        return;
      }
      if (/^(?:COMMIT|END)(?: TRANSACTION)?$/.test(command)) {
        const name = savepoints.pop();
        if (!name) throw new Error("Transação desbalanceada na verificação.");
        database.exec(`RELEASE SAVEPOINT ${name}`);
        return;
      }
      if (/^ROLLBACK(?: TRANSACTION)?$/.test(command)) {
        const name = savepoints.pop();
        if (!name) throw new Error("Transação desbalanceada na verificação.");
        database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
        database.exec(`RELEASE SAVEPOINT ${name}`);
        return;
      }
      if (control.test(sql))
        throw new Error("Transação não suportada na verificação.");
      return database.exec(sql);
    },
    close() {},
    assertBalanced() {
      if (savepoints.length)
        throw new Error("Transação incompleta na verificação.");
    },
  };
}

async function checkTurso({
  env = process.env,
  distDir = path.resolve(__dirname, "../.netlify/server-dist"),
  databaseFactory = openDatabase,
  appFactory,
} = {}) {
  let stage = "configuração";
  let database;
  let application;
  let transactionOpen = false;
  let temporaryDirectory;
  let failed;
  const checks = [];
  const probe = `_nexo_check_${randomUUID().replaceAll("-", "")}`;
  try {
    for (const key of [
      "TURSO_DATABASE_URL",
      "TURSO_AUTH_TOKEN",
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD",
      "CMS_ORIGIN",
    ])
      if (!env[key]) throw new Error("Configuração incompleta.");
    for (const file of ["index.html", "admin/index.html", "blog/template.html"])
      if (!fs.existsSync(path.join(distDir, file)))
        throw new Error("Compilação do site incompleta.");
    stage = "conexão";
    database = databaseFactory({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
    if (database.prepare("SELECT 1 AS ok").get()?.ok !== 1)
      throw new Error("Conexão inválida.");
    checks.push("conexão");
    stage = "transações";
    database.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    database.exec(`CREATE TABLE ${probe} (value TEXT NOT NULL)`);
    database.prepare(`INSERT INTO ${probe} VALUES (?)`).run("rollback-probe");
    const sandbox = transactionSandbox(database);
    sandbox.exec("BEGIN IMMEDIATE");
    sandbox.prepare(`UPDATE ${probe} SET value = ?`).run("nested-probe");
    sandbox.exec("ROLLBACK");
    if (
      database.prepare(`SELECT value FROM ${probe}`).get()?.value !==
      "rollback-probe"
    )
      throw new Error("Rollback interno inválido.");
    checks.push("transações");
    stage = "aplicação e esquema";
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "nexo-turso-check-"),
    );
    fs.chmodSync(temporaryDirectory, 0o700);
    const buildApp = appFactory || require("../server/app.cjs").buildApp;
    application = await buildApp({
      env: { ...env, NODE_ENV: "production", CMS_LOCAL_PREVIEW: "0" },
      database: sandbox,
      dataDir: temporaryDirectory,
      distDir,
      logger: false,
      // No media writes or external messages are part of a database check.
      storage: {
        remote: true,
        read: async () => null,
        write: async () => {
          throw new Error("Envio desativado na verificação.");
        },
        remove: async () => {
          throw new Error("Exclusão desativada na verificação.");
        },
      },
      resetEmailSender: { configured: false },
    });
    for (const table of [
      "content",
      "history",
      "sessions",
      "assets",
      "settings",
      "users",
      "login_attempts",
      "password_reset_tokens",
      "password_reset_limits",
      "blog_posts",
      "blog_revisions",
      "blog_categories",
    ])
      if (
        !database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get(table)
      )
        throw new Error("Esquema incompleto.");
    checks.push("esquema");
    stage = "rotas públicas e proteção do painel";
    for (const [url, expected] of [
      ["/", 200],
      ["/blog/", 200],
      ["/sitemap.xml", 200],
      ["/blog/sitemap.xml", 200],
      ["/blog/feed.xml", 200],
      ["/api/health", 200],
      ["/api/session", 200],
      ["/api/admin/content", 401],
      [`/blog/${probe}`, 404],
    ]) {
      const response = await application.inject({ url });
      if (response.statusCode !== expected)
        throw new Error("Resposta inesperada.");
      if (url === "/api/session" && response.json().authenticated !== false)
        throw new Error("Sessão inesperada.");
      if (
        url === "/blog/" &&
        (!response.body.includes(`href="${env.CMS_ORIGIN}/blog/"`) ||
          response.headers["x-robots-tag"] !==
            "index, follow, max-image-preview:large")
      )
        throw new Error("Metadados do blog inválidos.");
    }
    sandbox.assertBalanced();
    checks.push("rotas e proteção");
  } catch {
    // Drivers can include URLs, SQL or credentials in their errors. Report the
    // failing stage only; never echo configuration, payloads or raw exceptions.
    failed = new Error(`A verificação falhou na etapa: ${stage}.`);
  } finally {
    try {
      if (application) await application.close();
    } catch {
      failed ||= new Error("A verificação falhou ao encerrar a aplicação.");
    }
    if (database) {
      try {
        if (transactionOpen) {
          database.exec("ROLLBACK");
          transactionOpen = false;
          if (
            database
              .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
              )
              .get(probe)
          )
            throw new Error("Rollback não confirmado.");
          checks.push("rollback sem dados permanentes");
        }
      } catch {
        failed = new Error(
          "Não foi possível confirmar o rollback da verificação. Nenhum COMMIT foi solicitado.",
        );
      } finally {
        try {
          database.close();
        } catch {
          failed ||= new Error("Falha ao fechar a conexão de verificação.");
        }
      }
    }
    if (temporaryDirectory)
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  if (failed) throw failed;
  return { ok: true, checks };
}

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== "--check") {
    console.error(
      "Uso: node --env-file-if-exists=.env scripts/check-turso.cjs --check",
    );
    process.exitCode = 2;
  } else {
    checkTurso()
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}

module.exports = { checkTurso, transactionSandbox };
