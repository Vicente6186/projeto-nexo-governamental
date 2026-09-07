const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { ValidationError } = require("./validation.cjs");
const { validatePassword } = require("./users.cjs");

const TTL_MS = 30 * 60 * 1000;
const REQUEST_MESSAGE =
  "Se houver uma conta ativa com esse e-mail, enviaremos as instruções de redefinição. Confira também a caixa de spam.";
const INVALID_TOKEN_MESSAGE =
  "Este link é inválido ou expirou. Solicite uma nova redefinição de senha.";
const digest = (value) => createHash("sha256").update(value).digest("hex");
function requestError(message, statusCode, code, field) {
  const error = new Error(message);
  Object.assign(error, { statusCode, code, ...(field ? { field } : {}) });
  return error;
}
function exactBody(body, fields) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== fields.length ||
    Object.keys(body).some((key) => !fields.includes(key))
  )
    throw new ValidationError(
      "A solicitação contém campos ausentes ou não reconhecidos.",
    );
}
function validOrigin(config) {
  try {
    const parsed = new URL(config.origin);
    return (
      parsed.origin === config.origin &&
      !parsed.username &&
      !parsed.password &&
      (parsed.protocol === "https:" ||
        (!config.production &&
          parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)))
    );
  } catch {
    return false;
  }
}
function registerPasswordReset(
  app,
  { db, now, config, env, users, requireOrigin, sender },
) {
  const dailyLimit = Number(env.RESET_EMAIL_DAILY_LIMIT || 20);
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 90)
    throw new Error(
      "RESET_EMAIL_DAILY_LIMIT deve estar entre 1 e 90 envios por dia.",
    );
  const available = Boolean(
    sender?.configured &&
    typeof sender.sendReset === "function" &&
    validOrigin(config),
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS password_reset_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  );
  const jobs = new Set();
  const cleanup = (timestamp) => {
    db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ?").run(
      timestamp,
    );
    db.prepare("DELETE FROM password_reset_limits WHERE expires_at <= ?").run(
      timestamp,
    );
  };
  const used = (key) =>
    db.prepare("SELECT count FROM password_reset_limits WHERE key = ?").get(key)
      ?.count || 0;
  const take = (key, expiresAt) =>
    db
      .prepare(
        "INSERT INTO password_reset_limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1",
      )
      .run(key, expiresAt);
  const takeBounded = (key, expiresAt, maximum) =>
    Boolean(
      db
        .prepare(
          "INSERT INTO password_reset_limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count",
        )
        .get(key, expiresAt, maximum),
    );
  function reserveDaily(timestamp) {
    const instant = new Date(timestamp);
    const key = `email-day:${instant.toISOString().slice(0, 10)}`;
    return takeBounded(
      key,
      Date.UTC(
        instant.getUTCFullYear(),
        instant.getUTCMonth(),
        instant.getUTCDate() + 1,
      ),
      dailyLimit,
    );
  }
  function queued(work) {
    // No raw reset token is persisted or logged. Sending starts after the generic
    // response and is intentionally independent of provider latency.
    const job = new Promise((resolve) => setImmediate(resolve))
      .then(work)
      .finally(() => jobs.delete(job));
    jobs.add(job);
    return job;
  }
  async function deliver(task) {
    const user = users.get(task.userId);
    const stored = db
      .prepare(
        "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?",
      )
      .get(task.hash, now().getTime());
    if (
      !user?.active ||
      !stored ||
      users.fingerprint(user) !== stored.credential_fingerprint
    )
      return;
    try {
      await sender.sendReset({
        to: user.email,
        name: user.name,
        resetUrl: `${config.origin}/admin/#redefinir-senha?token=${task.token}`,
        expiresMinutes: 30,
        idempotencyKey: task.idempotencyKey,
      });
    } catch {
      db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(
        task.hash,
      );
      app.log.warn(
        { event: "password_reset_email_failed" },
        "Não foi possível enviar uma mensagem de redefinição.",
      );
    }
  }
  app.decorateRequest("passwordResetDelivery", null);
  app.post(
    "/api/password-reset/request",
    {
      onResponse: async (request) => {
        if (request.passwordResetDelivery)
          queued(() => deliver(request.passwordResetDelivery)).catch(() =>
            app.log.error(
              { event: "password_reset_delivery_failed" },
              "Falha interna no processamento de uma redefinição.",
            ),
          );
      },
    },
    async (request, reply) => {
      requireOrigin(request);
      if (!available)
        throw requestError(
          "A redefinição por e-mail está temporariamente indisponível. Entre em contato com a equipe responsável pelo painel.",
          503,
          "PASSWORD_RESET_UNAVAILABLE",
        );
      exactBody(request.body, ["email"]);
      const value = request.body.email;
      if (
        typeof value !== "string" ||
        value.length > 254 ||
        !/^[^\s@<>"\\\u0000-\u001f]+@[^\s@<>"\\\u0000-\u001f]+\.[^\s@<>"\\\u0000-\u001f]+$/.test(
          value.trim(),
        )
      )
        throw new ValidationError("Informe um e-mail válido.", "email");
      const email = value.trim().toLowerCase();
      const timestamp = now().getTime();
      // Generate the same random material for every syntactically valid request.
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = digest(rawToken);
      const accountKey = digest(email);
      const ipKey = digest(request.ip);
      db.exec("BEGIN IMMEDIATE");
      try {
        cleanup(timestamp);
        const globalKey = `requests-day:${new Date(timestamp).toISOString().slice(0, 10)}`;
        const ipWindow = `request-ip:${ipKey}`;
        if (used(ipWindow) < 10) {
          const accountCooldown = `account-cooldown:${accountKey}`;
          const accountHour = `account-hour:${accountKey}`;
          if (used(globalKey) < 1000) {
            take(ipWindow, timestamp + 15 * 60 * 1000);
            take(globalKey, timestamp + 24 * 60 * 60 * 1000);
            if (!used(accountCooldown) && used(accountHour) < 3) {
              take(accountCooldown, timestamp + 60 * 1000);
              take(accountHour, timestamp + 60 * 60 * 1000);
              const user = db
                .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
                .get(email);
              if (user?.active && reserveDaily(timestamp)) {
                // A valid newer request supersedes earlier reset links for this user.
                db.prepare(
                  "DELETE FROM password_reset_tokens WHERE user_id = ?",
                ).run(user.id);
                db.prepare(
                  "INSERT INTO password_reset_tokens VALUES (?, ?, ?, ?, ?)",
                ).run(
                  tokenHash,
                  user.id,
                  users.fingerprint(user),
                  timestamp,
                  timestamp + TTL_MS,
                );
                request.passwordResetDelivery = {
                  userId: user.id,
                  token: rawToken,
                  hash: tokenHash,
                  idempotencyKey: `password-reset/${randomUUID()}`,
                };
              }
            }
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      // A short uniform response floor further masks the tiny local database work;
      // delivery itself never changes the response or this delay.
      await delay(125);
      return reply.code(202).send({ ok: true, message: REQUEST_MESSAGE });
    },
  );
  app.post("/api/password-reset/confirm", async (request) => {
    requireOrigin(request);
    exactBody(request.body, ["token", "password"]);
    const { token, password } = request.body;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw requestError(
        INVALID_TOKEN_MESSAGE,
        400,
        "RESET_TOKEN_INVALID",
        "token",
      );
    validatePassword(password);
    const timestamp = now().getTime();
    cleanup(timestamp);
    const ipKey = `confirm-ip:${digest(request.ip)}`;
    if (!takeBounded(ipKey, timestamp + 15 * 60 * 1000, 10))
      throw requestError(
        "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.",
        429,
        "PASSWORD_RESET_RATE_LIMIT",
      );
    const tokenHash = digest(token);
    const row = db
      .prepare(
        "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?",
      )
      .get(tokenHash, timestamp);
    const user = row ? users.get(row.user_id) : null;
    if (
      !user?.active ||
      !row ||
      row.credential_fingerprint !== users.fingerprint(user)
    )
      throw requestError(
        INVALID_TOKEN_MESSAGE,
        400,
        "RESET_TOKEN_INVALID",
        "token",
      );
    const { salt, passwordHash } = await users.hashPassword(password);
    db.exec("BEGIN IMMEDIATE");
    try {
      const latestToken = db
        .prepare(
          "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?",
        )
        .get(tokenHash, now().getTime());
      const latestUser = users.get(user.id);
      if (
        !latestToken ||
        !latestUser?.active ||
        latestToken.credential_fingerprint !== users.fingerprint(latestUser)
      )
        throw requestError(
          INVALID_TOKEN_MESSAGE,
          400,
          "RESET_TOKEN_INVALID",
          "token",
        );
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
    if (available && typeof sender.sendPasswordChanged === "function") {
      if (reserveDaily(now().getTime())) {
        queued(async () => {
          try {
            await sender.sendPasswordChanged({
              to: user.email,
              name: user.name,
              idempotencyKey: `password-changed/${randomUUID()}`,
            });
          } catch {
            app.log.warn(
              { event: "password_changed_email_failed" },
              "Não foi possível enviar o aviso de alteração de senha.",
            );
          }
        }).catch(() =>
          app.log.error(
            { event: "password_changed_notification_failed" },
            "Falha interna no processamento de um aviso de alteração.",
          ),
        );
      } else
        app.log.info(
          { event: "password_changed_email_quota" },
          "Aviso de alteração não enviado porque a cota diária foi atingida.",
        );
    }
    return { ok: true };
  });
  return {
    available,
    close: async () => {
      while (jobs.size) await Promise.allSettled([...jobs]);
    },
  };
}
module.exports = { registerPasswordReset };
