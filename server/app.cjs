const Fastify = require("fastify");
const cookie = require("@fastify/cookie");
const rateLimit = require("@fastify/rate-limit");
const multipart = require("@fastify/multipart");
const staticFiles = require("@fastify/static");
const { DatabaseSync } = require("node:sqlite");
const {
  mkdirSync,
  existsSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
} = require("node:fs");
const path = require("node:path");
const {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} = require("node:crypto");
const { DEFAULT_CONTENT } = require("../shared/content.cjs");
const { validateContent, ValidationError } = require("./validation.cjs");

const COOKIE_NAME = "nexo_session";
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("hex");
const isLoopback = (address) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);

function configuration(env, options) {
  const production = env.NODE_ENV === "production";
  const localPreview = env.CMS_LOCAL_PREVIEW === "1";
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || "";
  const origin = env.CMS_ORIGIN || "";
  if (localPreview && production)
    throw new Error("CMS_LOCAL_PREVIEW não pode ser habilitado em produção.");
  if (
    localPreview &&
    env.HOST &&
    !["localhost", "127.0.0.1", "::1"].includes(env.HOST)
  )
    throw new Error("A prévia local exige HOST de loopback.");
  if (
    (email || password) &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12)
  )
    throw new Error(
      "Configure ADMIN_EMAIL válido e ADMIN_PASSWORD com pelo menos 12 caracteres.",
    );
  if (origin) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CMS_ORIGIN inválida.");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    )
      throw new Error(
        "CMS_ORIGIN deve conter apenas protocolo, domínio e porta, sem barra final.",
      );
    if (production && parsed.protocol !== "https:")
      throw new Error("Produção exige CMS_ORIGIN com HTTPS.");
  }
  if (production && (!email || !password || !origin))
    throw new Error(
      "Produção exige ADMIN_EMAIL, ADMIN_PASSWORD e CMS_ORIGIN HTTPS.",
    );
  return {
    production,
    localPreview,
    email,
    password,
    name: env.ADMIN_NAME || "Equipe Nexo",
    origins: new Set(
      production
        ? [origin]
        : [
            origin,
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
          ].filter(Boolean),
    ),
    dataDir: path.resolve(
      options.dataDir || env.DATA_DIR || path.join(__dirname, "..", "data"),
    ),
    distDir: path.resolve(
      options.distDir || path.join(__dirname, "..", "dist"),
    ),
  };
}

function detectFile(buffer) {
  if (
    buffer.length >= 24 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.toString("ascii", 12, 16) === "IHDR"
  )
    return { type: "image/png", extension: "png" };
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return { type: "image/jpeg", extension: "jpg" };
  if (
    buffer.length >= 16 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return { type: "image/webp", extension: "webp" };
  if (
    buffer.length >= 24 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    /avif|avis/.test(buffer.toString("ascii", 8, Math.min(64, buffer.length)))
  )
    return { type: "image/avif", extension: "avif" };
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 5) === "%PDF-" &&
    buffer.subarray(-1024).includes(Buffer.from("%%EOF"))
  )
    return { type: "application/pdf", extension: "pdf" };
  return null;
}

async function buildApp(options = {}) {
  const env = options.env || process.env;
  const config = configuration(env, options);
  const now = options.now || (() => new Date());
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 512 * 1024,
    trustProxy: false,
  });
  const uploadsDir = path.join(config.dataDir, "uploads");
  mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
  const databasePath = path.join(config.dataDir, "nexo.sqlite");
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS content (
      id INTEGER PRIMARY KEY CHECK (id = 1), draft TEXT NOT NULL, published TEXT NOT NULL,
      version INTEGER NOT NULL, published_version INTEGER NOT NULL, updated_at TEXT NOT NULL, published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY, action TEXT NOT NULL, created_at TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
      preview INTEGER NOT NULL, expires_at INTEGER NOT NULL, credential_fingerprint TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const initial = JSON.stringify(validateContent(DEFAULT_CONTENT));
  const initialAt = now().toISOString();
  if (!db.prepare("SELECT id FROM content WHERE id = 1").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO content VALUES (1, ?, ?, 1, 1, ?, ?)").run(
        initial,
        initial,
        initialAt,
        initialAt,
      );
      db.prepare("INSERT INTO history VALUES (?, ?, ?, ?, ?)").run(
        randomUUID(),
        "initialized",
        initialAt,
        "Conteúdo original do site",
        initial,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  let savedSalt = db
    .prepare("SELECT value FROM settings WHERE key = 'credential_salt'")
    .get()?.value;
  if (!savedSalt) {
    savedSalt = randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('credential_salt', ?)",
    ).run(savedSalt);
  }
  const salt = Buffer.from(savedSalt, "hex");
  const derivePassword = (password) =>
    scryptSync(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  const expectedPassword = derivePassword(config.password);
  // A persisted session must never create a fast, unsalted password verifier in the database.
  const fingerprint = digest(
    Buffer.concat([Buffer.from(`${config.email}\0`), expectedPassword]),
  );
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.production,
    maxAge: SESSION_MS / 1000,
  };
  const record = () => db.prepare("SELECT * FROM content WHERE id = 1").get();
  const assets = () =>
    db
      .prepare(
        "SELECT id, name, url, type, size FROM assets ORDER BY created_at DESC, rowid DESC",
      )
      .all();
  const state = () => {
    const row = record();
    return {
      draft: JSON.parse(row.draft),
      published: JSON.parse(row.published),
      version: row.version,
      publishedVersion: row.published_version,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      history: db
        .prepare(
          "SELECT id, action, created_at AS createdAt, summary FROM history ORDER BY created_at DESC, rowid DESC LIMIT 50",
        )
        .all(),
      assets: assets(),
    };
  };
  const sessionResponse = (session) => ({
    authenticated: Boolean(session),
    user: session ? { name: session.name, email: session.email } : null,
    localPreview: config.localPreview,
    ...(session ? { csrfToken: session.csrf } : {}),
  });
  const requireOrigin = (request) => {
    if (
      !request.headers.origin ||
      !config.origins.has(request.headers.origin)
    ) {
      const error = new Error("Origem da solicitação não autorizada.");
      error.statusCode = 403;
      throw error;
    }
  };
  const requireAuth = async (request) => {
    if (!request.cmsSession) {
      const error = new Error("Entre no painel para continuar.");
      error.statusCode = 401;
      throw error;
    }
  };
  const requireMutation = async (request) => {
    await requireAuth(request);
    requireOrigin(request);
    const provided = request.headers["x-csrf-token"];
    if (
      typeof provided !== "string" ||
      !/^[a-f0-9]{64}$/.test(provided) ||
      !timingSafeEqual(
        Buffer.from(provided),
        Buffer.from(request.cmsSession.csrf),
      )
    ) {
      const error = new Error(
        "Sua sessão de edição precisa ser atualizada. Recarregue o painel.",
      );
      error.statusCode = 403;
      throw error;
    }
  };
  const issueSession = (reply, preview = false) => {
    const value = token();
    const session = {
      csrf: token(),
      email: preview ? "" : config.email,
      name: config.name,
    };
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
      now().getTime(),
    );
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      digest(value),
      session.csrf,
      session.email,
      session.name,
      Number(preview),
      now().getTime() + SESSION_MS,
      fingerprint,
    );
    reply.setCookie(COOKIE_NAME, value, cookieOptions);
    return sessionResponse(session);
  };
  const update = (body, action) => {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !Number.isSafeInteger(body.version) ||
      body.version < 1
    )
      throw new ValidationError("Informe a versão do conteúdo.");
    const allowed =
      action === "save"
        ? ["content", "version"]
        : action === "restore"
          ? ["id", "version"]
          : ["version"];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      throw new ValidationError(
        "A solicitação contém campos não reconhecidos.",
      );
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = record();
      if (row.version !== body.version) {
        const error = new Error(
          "O conteúdo mudou em outra sessão. Recarregue a versão mais recente antes de salvar.",
        );
        error.statusCode = 409;
        error.currentVersion = row.version;
        throw error;
      }
      let content;
      if (action === "save") content = validateContent(body.content);
      if (action === "publish")
        content = validateContent(JSON.parse(row.draft), {
          publishing: true,
          now: now(),
        });
      if (action === "restore") {
        if (typeof body.id !== "string" || body.id.length > 80)
          throw new ValidationError("Versão do histórico inválida.");
        const historical = db
          .prepare("SELECT content FROM history WHERE id = ?")
          .get(body.id);
        if (!historical) {
          const error = new Error("Versão não encontrada no histórico.");
          error.statusCode = 404;
          throw error;
        }
        content = validateContent(JSON.parse(historical.content));
      }
      const serialized = JSON.stringify(content);
      const timestamp = now().toISOString();
      const nextVersion = row.version + 1;
      if (action === "publish")
        db.prepare(
          "UPDATE content SET published = ?, version = ?, published_version = ?, updated_at = ?, published_at = ? WHERE id = 1",
        ).run(serialized, nextVersion, nextVersion, timestamp, timestamp);
      else
        db.prepare(
          "UPDATE content SET draft = ?, version = ?, updated_at = ? WHERE id = 1",
        ).run(serialized, nextVersion, timestamp);
      const summary =
        action === "save"
          ? "Alterações salvas no rascunho"
          : action === "publish"
            ? "Conteúdo publicado no site"
            : "Versão anterior restaurada no rascunho";
      db.prepare("INSERT INTO history VALUES (?, ?, ?, ?, ?)").run(
        randomUUID(),
        action === "save"
          ? "draft.saved"
          : action === "publish"
            ? "published"
            : "draft.restored",
        timestamp,
        summary,
        serialized,
      );
      db.exec("COMMIT");
      return state();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0, parts: 1 },
  });
  app.decorateRequest("cmsSession", null);
  app.addHook("onRequest", async (request) => {
    const value = request.cookies[COOKIE_NAME];
    if (value && /^[a-f0-9]{64}$/.test(value)) {
      const session = db
        .prepare("SELECT * FROM sessions WHERE hash = ? AND expires_at > ?")
        .get(digest(value), now().getTime());
      if (
        session &&
        session.credential_fingerprint === fingerprint &&
        (!session.preview || config.localPreview)
      )
        request.cmsSession = session;
    }
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
    if (request.url.startsWith("/admin"))
      reply.header("X-Robots-Tag", "noindex, nofollow");
    if (
      config.production &&
      String(reply.getHeader("content-type") || "").startsWith("text/html")
    ) {
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'self'",
      );
    }
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;
    if (statusCode >= 500) request.log.error(error);
    const message =
      statusCode === 500
        ? "Não foi possível concluir a operação. Tente novamente."
        : statusCode === 413
          ? "O arquivo excede o limite de 8 MB ou o conteúdo é muito grande."
          : error.message;
    reply
      .code(statusCode)
      .send({
        error: message,
        ...(error.currentVersion
          ? { currentVersion: error.currentVersion }
          : {}),
      });
  });
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/session", async (request) =>
    sessionResponse(request.cmsSession),
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      requireOrigin(request);
      const body = request.body;
      if (
        !body ||
        typeof body.email !== "string" ||
        typeof body.password !== "string" ||
        body.email.length > 254 ||
        body.password.length > 1024
      )
        throw new ValidationError("Informe e-mail e senha válidos.");
      const passwordMatches = timingSafeEqual(
        derivePassword(body.password),
        expectedPassword,
      );
      if (
        !config.email ||
        body.email.trim().toLowerCase() !== config.email ||
        !passwordMatches
      )
        return reply.code(401).send({ error: "E-mail ou senha incorretos." });
      return issueSession(reply);
    },
  );
  app.post(
    "/api/local-session",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (!config.localPreview || !isLoopback(request.ip))
        return reply.code(404).send({ error: "Recurso indisponível." });
      requireOrigin(request);
      return issueSession(reply, true);
    },
  );
  app.post(
    "/api/logout",
    { preHandler: requireMutation },
    async (request, reply) => {
      db.prepare("DELETE FROM sessions WHERE hash = ?").run(
        digest(request.cookies[COOKIE_NAME]),
      );
      reply.clearCookie(COOKIE_NAME, cookieOptions);
      return sessionResponse(null);
    },
  );
  app.get("/api/content", async () => {
    const row = record();
    return {
      content: JSON.parse(row.published),
      publishedAt: row.published_at,
      version: row.published_version,
    };
  });
  app.get("/api/admin/content", { preHandler: requireAuth }, async () =>
    state(),
  );
  app.get("/api/admin/preview", { preHandler: requireAuth }, async () => ({
    content: JSON.parse(record().draft),
  }));
  app.get("/api/admin/assets", { preHandler: requireAuth }, async () => ({
    assets: assets(),
  }));
  app.put(
    "/api/admin/content",
    { preHandler: requireMutation },
    async (request) => update(request.body, "save"),
  );
  app.post(
    "/api/admin/publish",
    { preHandler: requireMutation },
    async (request) => update(request.body, "publish"),
  );
  app.post(
    "/api/admin/restore",
    { preHandler: requireMutation },
    async (request) => update(request.body, "restore"),
  );
  app.post(
    "/api/admin/uploads",
    { preHandler: requireMutation },
    async (request, reply) => {
      const file = await request.file();
      if (!file)
        throw new ValidationError(
          "Selecione um arquivo PNG, JPEG, WebP, AVIF ou PDF.",
        );
      const buffer = await file.toBuffer();
      const detected = detectFile(buffer);
      if (!detected || detected.type !== file.mimetype)
        throw new ValidationError(
          "Formato inválido. Envie uma imagem PNG, JPEG, WebP, AVIF ou um PDF válido.",
        );
      const asset = {
        id: randomUUID(),
        name:
          path
            .basename(file.filename || "arquivo")
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 180) || "arquivo",
        type: detected.type,
        size: buffer.length,
      };
      const filename = `${asset.id}.${detected.extension}`;
      asset.url = `/uploads/${filename}`;
      const destination = path.join(uploadsDir, filename);
      writeFileSync(destination, buffer, { flag: "wx", mode: 0o600 });
      try {
        db.prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)").run(
          asset.id,
          asset.name,
          asset.url,
          asset.type,
          asset.size,
          now().toISOString(),
        );
      } catch (error) {
        unlinkSync(destination);
        throw error;
      }
      return reply.code(201).send({ asset });
    },
  );
  await app.register(staticFiles, {
    root: uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    index: false,
    setHeaders(reply, filePath) {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Content-Security-Policy", "default-src 'none'; sandbox");
      if (filePath.endsWith(".pdf"))
        reply.header("Content-Disposition", "attachment");
    },
  });
  if (existsSync(config.distDir)) {
    await app.register(staticFiles, {
      root: config.distDir,
      prefix: "/",
      index: ["index.html"],
    });
    app.get("/admin", async (_, reply) => reply.redirect("/admin/"));
    app.get("/admin/", async (_, reply) => reply.sendFile("admin/index.html"));
  }
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: "Página ou recurso não encontrado." }),
  );
  app.addHook("onClose", async () => db.close());
  await app.ready();
  return app;
}

module.exports = { buildApp, detectFile };
