const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  createBackup,
  verifyBackup,
  restoreBackup,
  startBackupSchedule,
} = require("../server/backup.cjs");
const { updateInstitutional } = require("../scripts/update-institutional.cjs");
const { readiness } = require("../scripts/readiness.cjs");
const { DEFAULT_CONTENT } = require("../shared/content.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-ops-"));
  const dataDir = path.join(root, "data");
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "originals"));
  fs.writeFileSync(path.join(dataDir, "uploads", "cover.webp"), "public-image");
  fs.writeFileSync(
    path.join(dataDir, "originals", "cover.jpg"),
    "private-original",
  );
  const db = new DatabaseSync(path.join(dataDir, "nexo.sqlite"));
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE content (id INTEGER PRIMARY KEY, draft TEXT, published TEXT, version INTEGER, published_version INTEGER, updated_at TEXT, published_at TEXT);
    CREATE TABLE history (id TEXT, action TEXT, created_at TEXT, summary TEXT, content TEXT);
    CREATE TABLE assets (url TEXT, original_path TEXT);
    CREATE TABLE sessions (hash TEXT);
    CREATE TABLE password_reset_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT, credential_fingerprint TEXT, created_at INTEGER, expires_at INTEGER);
    CREATE TABLE password_reset_limits (key TEXT PRIMARY KEY, count INTEGER, expires_at INTEGER);
    CREATE TABLE users (email TEXT, password_hash TEXT);
    CREATE TABLE blog_posts (body TEXT);
    INSERT INTO assets VALUES ('/uploads/cover.webp', 'originals/cover.jpg');
    INSERT INTO sessions VALUES ('obsolete-session');
    INSERT INTO password_reset_tokens VALUES ('obsolete-reset-token', 'user-id', 'credential-hash', 1, 9999999999999);
    INSERT INTO password_reset_limits VALUES ('daily-budget', 20, 9999999999999);
    INSERT INTO users VALUES ('editor@example.org', 'salted-hash');
    INSERT INTO blog_posts VALUES ('artigo e histórico editorial');`);
  const content = JSON.stringify(DEFAULT_CONTENT);
  db.prepare("INSERT INTO content VALUES (1, ?, ?, 1, 1, ?, ?)").run(
    content,
    content,
    "2026-09-07T00:00:00.000Z",
    "2026-09-07T00:00:00.000Z",
  );
  t.after(() => {
    try {
      db.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, dataDir, db, outputRoot: path.join(root, "backups") };
}

test("consistent online backup and restoration preserve committed content, users, articles and media", async (t) => {
  const f = fixture(t);
  f.db.exec("BEGIN; UPDATE content SET version = 99 WHERE id = 1;");
  const saved = await createBackup(f);
  f.db.exec("ROLLBACK");
  assert.equal(saved.files, 3);
  const manifest = verifyBackup(saved.directory);
  assert.equal(manifest.format, "nexo-backup/v1");
  const snapshot = new DatabaseSync(path.join(saved.directory, "nexo.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    snapshot.prepare("SELECT version FROM content").get().version,
    1,
  );
  snapshot.close();
  assert.equal(restoreBackup({ backupDir: saved.directory }).applied, false);
  const destination = path.join(f.root, "restored");
  assert.equal(
    restoreBackup({ backupDir: saved.directory, destination, apply: true })
      .sessionsRevoked,
    true,
  );
  const restored = new DatabaseSync(path.join(destination, "nexo.sqlite"), {
    readOnly: true,
  });
  try {
    assert.deepEqual(
      JSON.parse(
        restored.prepare("SELECT published FROM content").get().published,
      ),
      DEFAULT_CONTENT,
    );
    assert.equal(
      restored.prepare("SELECT COUNT(*) AS count FROM sessions").get().count,
      0,
    );
    assert.equal(
      restored
        .prepare("SELECT COUNT(*) AS count FROM password_reset_tokens")
        .get().count,
      0,
    );
    assert.equal(
      restored
        .prepare(
          "SELECT count FROM password_reset_limits WHERE key = 'daily-budget'",
        )
        .get().count,
      20,
    );
    assert.equal(
      restored.prepare("SELECT password_hash FROM users").get().password_hash,
      "salted-hash",
    );
    assert.equal(
      restored.prepare("SELECT body FROM blog_posts").get().body,
      "artigo e histórico editorial",
    );
  } finally {
    restored.close();
  }
  assert.equal(
    fs.readFileSync(path.join(destination, "uploads", "cover.webp"), "utf8"),
    "public-image",
  );
  assert.equal(
    fs.readFileSync(path.join(destination, "originals", "cover.jpg"), "utf8"),
    "private-original",
  );
  assert.equal(fs.statSync(saved.directory).mode & 0o777, 0o700);
});

test("restore refuses occupied destination and damaged media without touching live data", async (t) => {
  const f = fixture(t);
  const saved = await createBackup(f);
  assert.throws(
    () =>
      restoreBackup({
        backupDir: saved.directory,
        destination: f.dataDir,
        apply: true,
      }),
    /novo ou vazio/,
  );
  assert.equal(f.db.prepare("SELECT version FROM content").get().version, 1);
  fs.writeFileSync(
    path.join(saved.directory, "uploads", "cover.webp"),
    "corrupt",
  );
  assert.throws(
    () => restoreBackup({ backupDir: saved.directory }),
    /verificação/,
  );
});

test("retention removes only recognized backups and excludes originals, manual folders and unrelated backups", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.outputRoot, "manual"), { recursive: true });
  fs.writeFileSync(path.join(f.outputRoot, "manual", "keep.txt"), "preserve");
  const a = await createBackup({
    ...f,
    keep: 1,
    now: new Date("2026-09-06T00:00:00Z"),
  });
  const b = await createBackup({
    ...f,
    keep: 1,
    now: new Date("2026-09-07T00:00:00Z"),
  });
  assert.equal(fs.existsSync(a.directory), false);
  assert.equal(fs.existsSync(b.directory), true);
  assert.equal(
    fs.existsSync(path.join(f.outputRoot, "manual", "keep.txt")),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(f.dataDir, "originals", "cover.jpg")),
    true,
  );
  assert.equal(b.removed, 1);
});

test("backup aborts on missing registered files and never prunes a prior good backup", async (t) => {
  const f = fixture(t);
  const saved = await createBackup({ ...f, keep: 1 });
  fs.unlinkSync(path.join(f.dataDir, "uploads", "cover.webp"));
  await assert.rejects(createBackup({ ...f, keep: 1 }), /ausente/);
  assert.equal(verifyBackup(saved.directory).files.length, 3);
  assert.equal(
    fs.existsSync(path.join(f.outputRoot, ".nexo-backup.lock")),
    false,
  );
});

test("backup releases its lock after temporary-directory setup failures and permits retry", async (t) => {
  for (const method of ["mkdtempSync", "chmodSync"]) {
    await t.test(method, async (t) => {
      const f = fixture(t);
      const original = fs[method];
      t.mock.method(fs, method, (...args) => {
        if (
          String(args[0]).startsWith(path.join(f.outputRoot, ".nexo-backup-"))
        )
          throw Object.assign(new Error("temporary directory unavailable"), {
            code: "EACCES",
          });
        return original(...args);
      });
      await assert.rejects(createBackup(f), /temporary directory unavailable/);
      assert.deepEqual(fs.readdirSync(f.outputRoot), []);
      t.mock.restoreAll();
      const saved = await createBackup(f);
      assert.equal(verifyBackup(saved.directory).files.length, 3);
    });
  }
});

test("backup releases its lock even when removal of an incomplete copy fails", async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.dataDir, "uploads", "cover.webp"));
  const original = fs.rmSync;
  t.mock.method(fs, "rmSync", (...args) => {
    if (String(args[0]).startsWith(path.join(f.outputRoot, ".nexo-backup-")))
      throw Object.assign(new Error("temporary directory cleanup failed"), {
        code: "EACCES",
      });
    return original(...args);
  });
  await assert.rejects(createBackup(f), /temporary directory cleanup failed/);
  assert.equal(
    fs.existsSync(path.join(f.outputRoot, ".nexo-backup.lock")),
    false,
  );
  t.mock.restoreAll();
  fs.writeFileSync(
    path.join(f.dataDir, "uploads", "cover.webp"),
    "public-image",
  );
  const saved = await createBackup(f);
  assert.equal(verifyBackup(saved.directory).files.length, 3);
});

test("backup releases its lock after an invalid timestamp", async (t) => {
  const f = fixture(t);
  await assert.rejects(createBackup({ ...f, now: new Date(NaN) }), RangeError);
  assert.deepEqual(fs.readdirSync(f.outputRoot), []);
  assert.equal((await createBackup(f)).files, 3);
});

test("restore removes its staging directory after a permissions failure and permits retry", async (t) => {
  const f = fixture(t);
  const saved = await createBackup(f);
  const destination = path.join(f.root, "restored");
  const original = fs.chmodSync;
  t.mock.method(fs, "chmodSync", (...args) => {
    if (String(args[0]).startsWith(path.join(f.root, ".nexo-restore-")))
      throw Object.assign(new Error("restoration directory unavailable"), {
        code: "EACCES",
      });
    return original(...args);
  });
  assert.throws(
    () =>
      restoreBackup({ backupDir: saved.directory, destination, apply: true }),
    /restoration directory unavailable/,
  );
  assert.equal(fs.existsSync(destination), false);
  assert.equal(
    fs.readdirSync(f.root).some((entry) => entry.startsWith(".nexo-restore-")),
    false,
  );
  t.mock.restoreAll();
  assert.equal(
    restoreBackup({ backupDir: saved.directory, destination, apply: true })
      .applied,
    true,
  );
});

test("backup rejects symlinks and restore rejects traversal in a modified manifest", async (t) => {
  const f = fixture(t);
  const saved = await createBackup(f);
  fs.symlinkSync(
    path.join(f.root, "outside"),
    path.join(f.dataDir, "uploads", "linked"),
  );
  await assert.rejects(createBackup(f), /simbólicos/);
  const filename = path.join(saved.directory, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filename));
  manifest.files[0].path = "uploads/../../outside";
  fs.writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(() => verifyBackup(saved.directory), /caminho inválido/);
});

test("institutional update defaults to dry run and preserves published and draft operational fields", async (t) => {
  const f = fixture(t);
  const published = structuredClone(DEFAULT_CONTENT);
  published.site.email = "published@nexo.org";
  published.selection.edition = "2026.2";
  published.selection.scheduleImage = "";
  const draft = structuredClone(published);
  draft.site.email = "draft@nexo.org";
  draft.selection.edition = "2027.1";
  draft.selection.stages = [
    {
      id: "interview",
      title: "Entrevista",
      date: "2027-01-12",
      description: "Preservar esta etapa",
    },
  ];
  f.db
    .prepare("UPDATE content SET draft = ?, published = ?")
    .run(JSON.stringify(draft), JSON.stringify(published));
  const template = structuredClone(DEFAULT_CONTENT);
  template.site.name = "Nexo Governamental • novo texto institucional";
  const dry = await updateInstitutional({ ...f, template });
  assert.equal(dry.applied, false);
  assert(dry.changes.published.includes("site.name"));
  assert.equal(fs.existsSync(f.outputRoot), false);
  assert.equal(
    JSON.parse(f.db.prepare("SELECT published FROM content").get().published)
      .site.name,
    DEFAULT_CONTENT.site.name,
  );
  const applied = await updateInstitutional({ ...f, template, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(verifyBackup(applied.backup).files.length, 3);
  const row = f.db.prepare("SELECT * FROM content").get();
  const nextPublished = JSON.parse(row.published);
  const nextDraft = JSON.parse(row.draft);
  assert.equal(nextPublished.site.name, template.site.name);
  assert.equal(nextPublished.site.email, "published@nexo.org");
  assert.equal(nextDraft.site.email, "draft@nexo.org");
  assert.equal(nextPublished.selection.edition, "2026.2");
  assert.equal(nextDraft.selection.edition, "2027.1");
  assert.deepEqual(nextDraft.selection.stages, draft.selection.stages);
  assert.equal(nextPublished.selection.scheduleImage, "");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS count FROM blog_posts").get().count,
    1,
  );
});

test("readiness distinguishes local HTTP success from production and never prints passwords", async (t) => {
  const f = fixture(t);
  const distDir = path.join(f.root, "dist");
  fs.mkdirSync(path.join(distDir, "admin"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "ok");
  fs.writeFileSync(path.join(distDir, "admin", "index.html"), "ok");
  const fetchFn = async (url) => {
    if (url.pathname === "/api/health") return Response.json({ ok: true });
    if (url.pathname === "/api/content")
      return Response.json({ content: DEFAULT_CONTENT });
    if (url.pathname === "/blog/")
      return new Response("<!doctype html><h1>Blog do <em>Nexo.</em></h1>", {
        headers: { "content-type": "text/html" },
      });
    return new Response("<!doctype html><title>Nexo Governamental</title>", {
      headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
    });
  };
  const report = await readiness({ env: {}, distDir, fetchFn });
  assert.equal(report.ok, true);
  assert.equal(report.publicGoLiveConfirmed, false);
  assert.equal(report.scope, "local-readiness");
  const production = await readiness({
    env: { ADMIN_PASSWORD: "never-print-me", CMS_LOCAL_PREVIEW: "1" },
    production: true,
    baseUrl: "http://localhost:3001",
    distDir,
    fetchFn,
  });
  assert.equal(production.ok, false);
  assert.equal(JSON.stringify(production).includes("never-print-me"), false);
  assert(
    production.checks.some(
      (check) => check.name === "Prévia local" && check.state === "fail",
    ),
  );
  assert(
    production.checks.some(
      (check) => check.name === "HTTPS público" && check.state === "fail",
    ),
  );
});

test("backup schedule is disabled outside production and validates intervals without timer overflow", async () => {
  await startBackupSchedule({ env: {}, dataDir: "/missing" })();
  assert.throws(
    () =>
      startBackupSchedule({
        env: { CMS_BACKUP_INTERVAL_HOURS: "9999" },
        dataDir: "/missing",
      }),
    /entre 0 e 168/,
  );
});

test("production readiness requires the configured origin, valid proxy networks and authenticated access only", async (t) => {
  const f = fixture(t);
  const distDir = path.join(f.root, "dist");
  fs.mkdirSync(path.join(distDir, "admin"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "ok");
  fs.writeFileSync(path.join(distDir, "admin", "index.html"), "ok");
  const env = {
    NODE_ENV: "production",
    CMS_LOCAL_PREVIEW: "0",
    CMS_ORIGIN: "https://nexo.example.org",
    ADMIN_EMAIL: "admin@example.org",
    ADMIN_PASSWORD: "test-only-private-password",
    RESEND_API_KEY: "re_fixture_only_private_key",
    RESEND_FROM: "Nexo Governamental <acesso@nexo.example.org>",
    DATA_DIR: f.dataDir,
    CMS_TRUST_PROXY: "127.0.0.1,10.42.0.0/24,::1,fd00::/64",
  };
  let session = {
    authenticated: false,
    user: null,
    localPreview: false,
    passwordResetAvailable: true,
  };
  let requests = 0;
  const fetchFn = async (url) => {
    requests++;
    if (url.pathname === "/api/session") return Response.json(session);
    if (url.pathname === "/api/health") return Response.json({ ok: true });
    if (url.pathname === "/api/content")
      return Response.json({ content: DEFAULT_CONTENT });
    if (url.pathname === "/blog/")
      return new Response("<!doctype html><h1>Blog do <em>Nexo.</em></h1>", {
        headers: { "content-type": "text/html" },
      });
    return new Response("<!doctype html><title>Nexo Governamental</title>", {
      headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
    });
  };
  const inspect = (options = {}) =>
    readiness({ env, distDir, fetchFn, ...options });
  const correct = await inspect();
  assert.equal(correct.ok, true);
  assert.equal(correct.publicGoLiveConfirmed, false);
  for (const credentials of [
    { ADMIN_EMAIL: "admin\u0000@example.org" },
    { ADMIN_EMAIL: "admin@-invalid.org" },
    { ADMIN_PASSWORD: "x".repeat(1025) },
  ]) {
    const report = await inspect({ env: { ...env, ...credentials } });
    assert.equal(
      report.checks.find((check) => check.name === "Acesso inicial").state,
      "fail",
    );
  }
  assert(
    correct.checks.some(
      (check) => check.name === "Acesso autenticado" && check.state === "pass",
    ),
  );
  const otherDomain = await inspect({ baseUrl: "https://outro.example.org" });
  assert(
    otherDomain.checks.some(
      (check) => check.name === "Domínio verificado" && check.state === "fail",
    ),
  );
  for (const invalid of [
    "true",
    "*",
    "0.0.0.0/0",
    "::/0",
    "proxy.example.org",
    "10.42.0.0/99",
    "::1/129",
    "127.0.0.1/32/32",
  ]) {
    const badProxy = await inspect({
      env: { ...env, CMS_TRUST_PROXY: invalid },
    });
    assert(
      badProxy.checks.some(
        (check) => check.name === "Proxy" && check.state === "fail",
      ),
      invalid,
    );
  }
  for (const invalidSession of [
    { authenticated: false, user: null, localPreview: true },
    { authenticated: true, user: { name: "Open access" }, localPreview: false },
    { authenticated: false, user: null },
  ]) {
    session = invalidSession;
    const unsafe = await inspect();
    assert(
      unsafe.checks.some(
        (check) =>
          check.name === "Acesso autenticado" && check.state === "fail",
      ),
    );
  }
  session = {
    authenticated: false,
    user: null,
    localPreview: false,
    passwordResetAvailable: false,
  };
  const resetUnavailable = await inspect();
  assert(
    resetUnavailable.checks.some(
      (check) =>
        check.name === "Recuperação disponível" && check.state === "fail",
    ),
  );
  session.passwordResetAvailable = true;
  const missingResend = await inspect({ env: { ...env, RESEND_API_KEY: "" } });
  assert(
    missingResend.checks.some(
      (check) =>
        check.name === "E-mail de recuperação" && check.state === "fail",
    ),
  );
  assert.equal(
    JSON.stringify(missingResend).includes(env.RESEND_API_KEY),
    false,
  );
  for (const limit of ["0", "91", "1.5", "abc"]) {
    const invalidLimit = await inspect({
      env: { ...env, RESET_EMAIL_DAILY_LIMIT: limit },
    });
    assert(
      invalidLimit.checks.some(
        (check) =>
          check.name === "Limite de recuperação" && check.state === "fail",
      ),
    );
  }
  requests = 0;
  const badUrl = await inspect({
    baseUrl: "https://user:private@nexo.example.org",
  });
  assert.equal(badUrl.ok, false);
  assert.equal(requests, 0, "URLs inválidas não devem gerar requisições");
  assert.equal(JSON.stringify(badUrl).includes("private@nexo"), false);
});

test("restoration accepts historical backups created before password recovery existed", async (t) => {
  const f = fixture(t);
  f.db.exec(
    "DROP TABLE password_reset_tokens; DROP TABLE password_reset_limits;",
  );
  const saved = await createBackup(f);
  const result = restoreBackup({
    backupDir: saved.directory,
    destination: path.join(f.root, "historical-restored"),
    apply: true,
  });
  assert.equal(result.sessionsRevoked, true);
  assert.equal(result.resetTokensRevoked, true);
  assert.equal(f.db.prepare("SELECT version FROM content").get().version, 1);
});

test("readiness rejects a homepage fallback and an unrendered blog template", async (t) => {
  const f = fixture(t);
  for (const html of [
    "<!doctype html><title>Nexo Governamental</title><h1>Seja Nexo.</h1>",
    "<!doctype html><title>Blog do Nexo</title><!--BLOG_CONTENT-->",
  ]) {
    const report = await readiness({
      env: {},
      distDir: f.root,
      fetchFn: async (url) => {
        if (url.pathname === "/api/health") return Response.json({ ok: true });
        if (url.pathname === "/api/content")
          return Response.json({ content: DEFAULT_CONTENT });
        return new Response(html, {
          headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
        });
      },
    });
    assert.equal(
      report.checks.find((check) => check.name === "Blog").state,
      "fail",
    );
  }
});
