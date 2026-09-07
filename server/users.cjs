const {
  randomUUID,
  randomBytes,
  scryptSync,
  scrypt,
  timingSafeEqual,
  createHash,
} = require("node:crypto");
const { promisify } = require("node:util");
const { ValidationError } = require("./validation.cjs");
const deriveAsync = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const columns =
  "id, name, email, role, active, created_at AS createdAt, bootstrap";
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: Boolean(user.active),
  createdAt: user.createdAt || user.created_at,
  bootstrap: Boolean(user.bootstrap),
});
const deny = (message, code = "FORBIDDEN", statusCode = 403) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
};
function validatePassword(value, field = "password") {
  if (typeof value !== "string" || value.length < 12 || value.length > 1024)
    throw new ValidationError(
      "Use uma senha com 12 a 1.024 caracteres.",
      field,
    );
}
function initializeUsers(db, config, now, bootstrapFingerprint) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin', 'editor')),
    active INTEGER NOT NULL DEFAULT 1, bootstrap INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_fingerprint TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );`);
  if (
    !db
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .some((column) => column.name === "user_id")
  )
    db.exec("ALTER TABLE sessions ADD COLUMN user_id TEXT");
  if (config.email) {
    const previous = db
      .prepare("SELECT value FROM settings WHERE key = 'bootstrap_fingerprint'")
      .get()?.value;
    const current = db.prepare("SELECT * FROM users WHERE bootstrap = 1").get();
    if (!current || previous !== bootstrapFingerprint) {
      const salt = randomBytes(32).toString("hex");
      const passwordHash = scryptSync(
        config.password,
        salt,
        64,
        options,
      ).toString("hex");
      db.exec("BEGIN IMMEDIATE");
      try {
        if (current) {
          db.prepare(
            "UPDATE users SET name = ?, email = ?, password_hash = ?, password_salt = ?, role = 'admin', active = 1 WHERE id = ?",
          ).run(config.name, config.email, passwordHash, salt, current.id);
          db.prepare(
            "DELETE FROM sessions WHERE user_id = ? OR user_id IS NULL",
          ).run(current.id);
          db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(
            current.id,
          );
        } else {
          db.prepare(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, ?)",
          ).run(
            randomUUID(),
            config.name,
            config.email,
            passwordHash,
            salt,
            now().toISOString(),
          );
          db.prepare(
            "DELETE FROM sessions WHERE preview = 0 AND user_id IS NULL",
          ).run();
        }
        db.prepare(
          "INSERT INTO settings VALUES ('bootstrap_fingerprint', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ).run(bootstrapFingerprint);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  }
  const dummySalt = randomBytes(32).toString("hex");
  const dummyHash = scryptSync(randomBytes(32), dummySalt, 64, options);
  const get = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const fingerprint = (user) =>
    hash(`${user.id}\0${user.email}\0${user.password_hash}\0${user.role}`);
  const hashPassword = async (password) => {
    validatePassword(password);
    const salt = randomBytes(32).toString("hex");
    const passwordHash = (
      await deriveAsync(password, salt, 64, options)
    ).toString("hex");
    return { salt, passwordHash };
  };
  const check = async (password, user) =>
    timingSafeEqual(
      await deriveAsync(
        password,
        user?.password_salt || dummySalt,
        64,
        options,
      ),
      user ? Buffer.from(user.password_hash, "hex") : dummyHash,
    );
  const requireAdmin = (request) => {
    if (request.cmsSession?.role !== "admin")
      deny("Somente administradores podem gerenciar os acessos.");
  };
  const login = async (email, password, ip) => {
    const timestamp = now().getTime();
    db.prepare("DELETE FROM login_attempts WHERE expires_at <= ?").run(
      timestamp,
    );
    const keys = [
      { key: hash(`pair\0${ip}\0${email}`), limit: 8 },
      { key: hash(`ip\0${ip}`), limit: 80 },
    ];
    for (const { key, limit } of keys)
      if (
        (db.prepare("SELECT count FROM login_attempts WHERE key = ?").get(key)
          ?.count || 0) >= limit
      )
        deny(
          "Muitas tentativas de acesso. Aguarde 15 minutos antes de tentar novamente.",
          "LOGIN_RATE_LIMIT",
          429,
        );
    const user = db
      .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
      .get(email);
    const matches = await check(password, user);
    if (!user?.active || !matches) {
      for (const { key } of keys)
        db.prepare(
          "INSERT INTO login_attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1",
        ).run(key, timestamp + 15 * 60 * 1000);
      deny("E-mail ou senha incorretos.", "INVALID_CREDENTIALS", 401);
    }
    const latest = get(user.id);
    if (!latest?.active || fingerprint(latest) !== fingerprint(user))
      deny("E-mail ou senha incorretos.", "INVALID_CREDENTIALS", 401);
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(keys[0].key);
    return latest;
  };
  function register(app, { requireAuth, requireMutation, issueSession }) {
    app.get(
      "/api/admin/users",
      { preHandler: requireAuth },
      async (request) => {
        requireAdmin(request);
        return {
          users: db
            .prepare(
              `SELECT ${columns} FROM users ORDER BY active DESC, name COLLATE NOCASE`,
            )
            .all()
            .map(publicUser),
        };
      },
    );
    app.post(
      "/api/admin/users",
      { preHandler: requireMutation },
      async (request, reply) => {
        requireAdmin(request);
        const body = request.body || {};
        if (
          Object.keys(body).some(
            (key) => !["name", "email", "password", "role"].includes(key),
          )
        )
          throw new ValidationError(
            "A solicitação contém campos não reconhecidos.",
          );
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 120 ||
          /[\u0000-\u001f]/.test(body.name)
        )
          throw new ValidationError(
            "Informe o nome da pessoa, com até 120 caracteres.",
            "name",
          );
        if (
          typeof body.email !== "string" ||
          body.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
        )
          throw new ValidationError("Informe um e-mail válido.", "email");
        validatePassword(body.password);
        const role = body.role || "editor";
        if (!["admin", "editor"].includes(role))
          throw new ValidationError("Escolha editor ou administrador.", "role");
        const email = body.email.trim().toLowerCase();
        if (db.prepare("SELECT id FROM users WHERE email = ?").get(email))
          deny("Já existe uma conta com este e-mail.", "EMAIL_IN_USE", 409);
        const salt = randomBytes(32).toString("hex");
        const passwordHash = (
          await deriveAsync(body.password, salt, 64, options)
        ).toString("hex");
        if (!request.cmsSession.preview) {
          const currentAdmin = get(request.cmsSession.user_id);
          if (
            !currentAdmin?.active ||
            currentAdmin.role !== "admin" ||
            fingerprint(currentAdmin) !==
              request.cmsSession.credential_fingerprint
          )
            deny(
              "Entre novamente para gerenciar os acessos.",
              "SESSION_EXPIRED",
              401,
            );
        }
        const id = randomUUID();
        try {
          db.prepare(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)",
          ).run(
            id,
            body.name.trim(),
            email,
            passwordHash,
            salt,
            role,
            now().toISOString(),
          );
        } catch (error) {
          if (error.code?.includes("SQLITE_CONSTRAINT"))
            deny("Já existe uma conta com este e-mail.", "EMAIL_IN_USE", 409);
          throw error;
        }
        return reply.code(201).send({ user: publicUser(get(id)) });
      },
    );
    app.patch(
      "/api/admin/users/:id",
      { preHandler: requireMutation },
      async (request) => {
        requireAdmin(request);
        const body = request.body;
        if (
          !body ||
          Object.keys(body).length !== 1 ||
          typeof body.active !== "boolean"
        )
          throw new ValidationError(
            "Informe se o acesso deve ficar ativo.",
            "active",
          );
        const user = get(request.params.id);
        if (!user) deny("Conta não encontrada.", "NOT_FOUND", 404);
        if (!body.active && user.id === request.cmsSession.user_id)
          deny(
            "Você não pode desativar o próprio acesso.",
            "SELF_DEACTIVATION",
          );
        if (
          !body.active &&
          user.active &&
          user.role === "admin" &&
          db
            .prepare(
              "SELECT count(*) AS count FROM users WHERE active = 1 AND role = 'admin'",
            )
            .get().count <= 1
        )
          deny("Mantenha pelo menos um administrador ativo.", "LAST_ADMIN");
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE users SET active = ? WHERE id = ?").run(
            Number(body.active),
            user.id,
          );
          db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
          db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(
            user.id,
          );
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return { user: publicUser(get(user.id)) };
      },
    );
    app.post(
      "/api/admin/password",
      {
        preHandler: requireMutation,
        config: {
          rateLimit: {
            hook: "preHandler",
            max: 8,
            timeWindow: "15 minutes",
            keyGenerator: (request) =>
              request.cmsSession?.user_id || request.ip,
          },
        },
      },
      async (request, reply) => {
        const user = get(request.cmsSession.user_id || "");
        if (!user)
          deny(
            "A prévia local não tem senha. Entre com uma conta individual para alterá-la.",
            "PREVIEW_PASSWORD",
            400,
          );
        const body = request.body || {};
        if (
          Object.keys(body).some(
            (key) => !["currentPassword", "newPassword"].includes(key),
          )
        )
          throw new ValidationError(
            "A solicitação contém campos não reconhecidos.",
          );
        if (
          typeof body.currentPassword !== "string" ||
          body.currentPassword.length > 1024
        )
          throw new ValidationError(
            "Informe a senha atual.",
            "currentPassword",
          );
        validatePassword(body.newPassword, "newPassword");
        if (!(await check(body.currentPassword, user)))
          throw new ValidationError(
            "A senha atual está incorreta.",
            "currentPassword",
            "INVALID_CREDENTIALS",
          );
        const salt = randomBytes(32).toString("hex");
        const passwordHash = (
          await deriveAsync(body.newPassword, salt, 64, options)
        ).toString("hex");
        // Recheck after the asynchronous hash so a revoked session cannot mutate its account.
        const latest = get(user.id);
        if (!latest?.active || fingerprint(latest) !== fingerprint(user))
          deny(
            "Entre novamente para alterar sua senha.",
            "SESSION_EXPIRED",
            401,
          );
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
          ).run(passwordHash, salt, user.id);
          db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
          db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(
            user.id,
          );
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return issueSession(reply, false, get(user.id));
      },
    );
  }
  return { get, fingerprint, login, register, hashPassword };
}
module.exports = { initializeUsers, validatePassword };
