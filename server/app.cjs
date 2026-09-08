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
  readFileSync,
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
const {
  editableDraft,
  validateEditableContent,
  validateContact,
} = require("./site-policy.cjs");
const { registerBlog } = require("./blog.cjs");
const { registerBlogPages } = require("./blog-routes.cjs");
const { registerBlogImages } = require("./blog-images.cjs");
const { htmlCsp } = require("./blog-seo.cjs");

const { initializeUsers, isValidEmail } = require("./users.cjs");
const { registerPasswordReset } = require("./password-reset.cjs");
const { createResetEmailSender } = require("./reset-email.cjs");
const {
  createAssetValidator,
  prepareImage,
  migrateAssets,
} = require("./assets.cjs");
const { isIP } = require("node:net");

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
    (!isValidEmail(email) || password.length < 12 || password.length > 1024)
  )
    throw new Error(
      "Configure ADMIN_EMAIL válido e ADMIN_PASSWORD com 12 a 1.024 caracteres.",
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
  const trustedProxies = (env.CMS_TRUST_PROXY || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of trustedProxies) {
    const [address, prefix, ...extra] = value.split("/");
    const family = isIP(address);
    if (
      !family ||
      extra.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (family === 4 ? 32 : 128)))
    )
      throw new Error(
        "CMS_TRUST_PROXY exige IPs ou CIDRs explícitos de proxies confiáveis, sem curingas.",
      );
  }
  return {
    origin,
    trustedProxies: trustedProxies.length ? trustedProxies : false,
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
    trustProxy: config.trustedProxies,
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
  migrateAssets(db);
  const validateAssetReference = createAssetValidator(db, config);
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
  const users = initializeUsers(db, config, now, fingerprint);
  const resetEmailSender =
    options.resetEmailSender || createResetEmailSender({ env });
  let passwordReset = { available: false, close: async () => {} };
  // Disabling the demonstration access is a revocation, not a temporary pause.
  // Old local cookies must never become valid again if preview is enabled later.
  if (!config.localPreview)
    db.prepare("DELETE FROM sessions WHERE preview = 1").run();
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.production,
    maxAge: SESSION_MS / 1000,
  };
  const record = () => db.prepare("SELECT * FROM content WHERE id = 1").get();
  const projectedDraft = (row) =>
    editableDraft(JSON.parse(row.published), JSON.parse(row.draft));
  const assets = () =>
    db
      .prepare(
        "SELECT id, name, url, type, size, width, height, created_at AS createdAt FROM assets ORDER BY created_at DESC, rowid DESC",
      )
      .all();
  const state = () => {
    const row = record();
    return {
      draft: projectedDraft(row),
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
    user: session
      ? {
          id: session.user_id || "local-preview",
          name: session.name,
          email: session.email,
          role: session.role || "admin",
        }
      : null,
    localPreview: config.localPreview,
    passwordResetAvailable: passwordReset.available,
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
  const refreshSession = (request) => {
    request.cmsSession = null;
    const value = request.cookies[COOKIE_NAME];
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return;
    const session = db
      .prepare("SELECT * FROM sessions WHERE hash = ? AND expires_at > ?")
      .get(digest(value), now().getTime());
    if (session?.preview) {
      if (
        config.localPreview &&
        isLoopback(request.raw.socket.remoteAddress) &&
        isLoopback(request.ip) &&
        session.credential_fingerprint === fingerprint
      )
        request.cmsSession = { ...session, role: "admin" };
    } else if (session?.user_id) {
      const user = users.get(session.user_id);
      if (
        user?.active &&
        session.credential_fingerprint === users.fingerprint(user)
      )
        request.cmsSession = {
          ...session,
          role: user.role,
          name: user.name,
          email: user.email,
        };
    }
  };
  const requireCurrentSession = (request) => {
    // Request bodies, image decoding and password hashes can outlive a logout.
    // Re-read the persisted session before an authenticated operation proceeds.
    refreshSession(request);
    if (!request.cmsSession) {
      const error = new Error("Entre no painel para continuar.");
      error.statusCode = 401;
      throw error;
    }
  };
  const requireAuth = async (request) => requireCurrentSession(request);
  const requireMutation = async (request) => {
    requireCurrentSession(request);
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
        "Sua sessão de edição precisa ser atualizada. Entre novamente para continuar com a edição preservada.",
      );
      error.statusCode = 403;
      error.code = "CSRF_EXPIRED";
      throw error;
    }
  };
  const issueSession = (reply, preview = false, user = null) => {
    const value = token();
    const session = {
      csrf: token(),
      email: preview ? "" : user.email,
      name: preview ? config.name : user.name,
      user_id: preview ? null : user.id,
      role: preview ? "admin" : user.role,
    };
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
      now().getTime(),
    );
    db.prepare(
      "INSERT INTO sessions (hash, csrf, email, name, preview, expires_at, credential_fingerprint, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      digest(value),
      session.csrf,
      session.email,
      session.name,
      Number(preview),
      now().getTime() + SESSION_MS,
      preview ? fingerprint : users.fingerprint(user),
      session.user_id,
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
    const allowed = action === "save" ? ["content", "version"] : ["version"];
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
        error.code = "CONTENT_CONFLICT";
        error.currentVersion = row.version;
        throw error;
      }
      let content;
      if (action === "save")
        content = validateEditableContent(
          JSON.parse(row.published),
          body.content,
        );
      if (action === "publish") {
        content = validateContent(projectedDraft(row), {
          publishing: true,
          now: now(),
        });
        validateContact(content.site, { publishing: true });
        // Once the team publishes a structured schedule, retiring its stages
        // must not bring the historical schedule image back onto the site.
        if (
          content.selection.stages.length ||
          JSON.parse(row.published).selection.stages.length
        )
          content.selection.scheduleImage = "";
      }
      validateAssetReference(content.selection.noticeUrl, {
        kind: "pdf",
        field: "selection.noticeUrl",
      });
      validateAssetReference(content.selection.applicationUrl, {
        kind: "external",
        field: "selection.applicationUrl",
      });
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
          ? "Processo seletivo e contatos salvos no rascunho"
          : "Processo seletivo e contatos publicados no site";
      db.prepare("INSERT INTO history VALUES (?, ?, ?, ?, ?)").run(
        randomUUID(),
        action === "save" ? "draft.saved" : "published",
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
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      statusCode: 429,
      code: "RATE_LIMIT",
      error: "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
      message: "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
    }),
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0, parts: 1 },
  });
  app.decorateRequest("cmsSession", null);
  app.addHook("onRequest", async (request) => {
    refreshSession(request);
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (
      request.url.startsWith("/admin") ||
      request.url.startsWith("/api/password-reset/")
    )
      reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
    if (request.url.startsWith("/admin"))
      reply.header("X-Robots-Tag", "noindex, nofollow");
    if (
      config.production &&
      String(reply.getHeader("content-type") || "").startsWith("text/html")
    ) {
      reply.header("Content-Security-Policy", htmlCsp(payload));
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
    reply.code(statusCode).send({
      error: message,
      code:
        statusCode >= 500
          ? error.code === "PASSWORD_RESET_UNAVAILABLE"
            ? error.code
            : "INTERNAL_ERROR"
          : error.code ||
            {
              400: "VALIDATION_ERROR",
              401: "SESSION_EXPIRED",
              403: "FORBIDDEN",
              404: "NOT_FOUND",
              409: "CONTENT_CONFLICT",
              413: "PAYLOAD_TOO_LARGE",
              429: "RATE_LIMIT",
            }[statusCode] ||
            "REQUEST_ERROR",
      ...(statusCode < 500 && error.field ? { field: error.field } : {}),
      ...(error.currentVersion ? { currentVersion: error.currentVersion } : {}),
    });
  });
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/session", async (request) =>
    sessionResponse(request.cmsSession),
  );
  app.post("/api/login", {}, async (request, reply) => {
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
    const user = await users.login(
      body.email.trim().toLowerCase(),
      body.password,
      request.ip,
    );
    return issueSession(reply, false, user);
  });
  app.post(
    "/api/local-session",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (
        !config.localPreview ||
        !isLoopback(request.raw.socket.remoteAddress) ||
        !isLoopback(request.ip)
      )
        return reply
          .code(404)
          .send({ error: "Recurso indisponível.", code: "NOT_FOUND" });
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
  users.register(app, {
    requireAuth,
    requireMutation,
    requireCurrentSession,
    issueSession,
  });
  passwordReset = registerPasswordReset(app, {
    db,
    now,
    config,
    env,
    users,
    requireOrigin,
    sender: resetEmailSender,
  });
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
    content: projectedDraft(record()),
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
    async (_request, reply) =>
      reply.code(403).send({
        code: "FORBIDDEN",
        error:
          "A restauração de versões completas não está disponível. Atualize o processo seletivo ou os canais de contato no painel.",
      }),
  );
  app.post(
    "/api/admin/uploads",
    { preHandler: requireMutation },
    async (request, reply) => {
      let file;
      let buffer;
      try {
        // Finish parsing the request so extra or malformed parts cannot be
        // overlooked after the first file has already been persisted.
        for await (const part of request.parts()) {
          file = part;
          buffer = await part.toBuffer();
        }
      } catch (error) {
        if (error.code === "ERR_STREAM_PREMATURE_CLOSE")
          throw new ValidationError(
            "O envio está incompleto ou contém campos extras. Envie um arquivo por vez.",
            "file",
            "INVALID_UPLOAD",
          );
        throw error;
      }
      if (!file)
        throw new ValidationError(
          "Selecione um arquivo PNG, JPEG, WebP, AVIF ou PDF.",
        );
      const detected = detectFile(buffer);
      if (!detected || detected.type !== file.mimetype)
        throw new ValidationError(
          "Formato inválido. Envie uma imagem PNG, JPEG, WebP, AVIF ou um PDF válido.",
        );
      const prepared = detected.type.startsWith("image/")
        ? await prepareImage(buffer)
        : { buffer, ...detected, width: null, height: null };
      requireCurrentSession(request);
      const asset = {
        id: randomUUID(),
        name:
          path
            .basename(file.filename || "arquivo")
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 180) || "arquivo",
        type: prepared.type,
        size: prepared.buffer.length,
        width: prepared.width,
        height: prepared.height,
        createdAt: now().toISOString(),
      };
      const filename = `${asset.id}.${prepared.extension}`;
      asset.url = `/uploads/${filename}`;
      const destination = path.join(uploadsDir, filename);
      const originalRelative = detected.type.startsWith("image/")
        ? `originals/${asset.id}.${detected.extension}`
        : null;
      const originalDestination = originalRelative
        ? path.join(config.dataDir, originalRelative)
        : null;
      if (originalDestination)
        mkdirSync(path.dirname(originalDestination), {
          recursive: true,
          mode: 0o700,
        });
      writeFileSync(destination, prepared.buffer, { flag: "wx", mode: 0o600 });
      try {
        if (originalDestination)
          writeFileSync(originalDestination, buffer, {
            flag: "wx",
            mode: 0o600,
          });
        db.prepare(
          "INSERT INTO assets (id, name, url, type, size, created_at, width, height, original_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          asset.id,
          asset.name,
          asset.url,
          asset.type,
          asset.size,
          asset.createdAt,
          asset.width,
          asset.height,
          originalRelative,
        );
      } catch (error) {
        unlinkSync(destination);
        if (originalDestination && existsSync(originalDestination))
          unlinkSync(originalDestination);
        throw error;
      }
      return reply.code(201).send({ asset });
    },
  );
  const blog = registerBlog(app, {
    db,
    now,
    config,
    requireAuth,
    requireMutation,
    validateAssetReference,
  });
  const blogImages = registerBlogImages(app, { db, config });
  registerBlogPages(app, {
    blog,
    images: blogImages,
    config,
    requireAuth,
    record: () => {
      const row = record();
      return { ...row, draft: JSON.stringify(projectedDraft(row)) };
    },
  });
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
    if (existsSync(path.join(config.distDir, "index.html")))
      app.get("/", async (_, reply) =>
        reply
          .type("text/html; charset=utf-8")
          .header("Cache-Control", "no-cache")
          .send(
            readFileSync(
              path.join(config.distDir, "index.html"),
              "utf8",
            ).replaceAll(
              "https://nexo-governamental.netlify.app",
              config.origin || "https://nexo-governamental.netlify.app",
            ),
          ),
      );
  }
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send({ error: "Página ou recurso não encontrado.", code: "NOT_FOUND" }),
  );
  app.addHook("onClose", async () => {
    await passwordReset.close();
    db.close();
  });
  await app.ready();
  return app;
}

module.exports = { buildApp, detectFile };
