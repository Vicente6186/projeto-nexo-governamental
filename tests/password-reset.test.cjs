const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { buildApp } = require("../server/app.cjs");
const ORIGIN = "http://localhost:8080";
const EMAIL = "admin@nexo.example.com";
const PASSWORD = "initial-private-password";
const NEW_PASSWORD = "new-independent-private-password";
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(
  t,
  { env: extraEnv = {}, sender: customSender, logger = false } = {},
) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "nexo-password-reset-"));
  let instant = Date.parse("2026-09-07T12:00:00Z");
  const env = {
    NODE_ENV: "test",
    ADMIN_EMAIL: EMAIL,
    ADMIN_PASSWORD: PASSWORD,
    CMS_ORIGIN: ORIGIN,
    ...extraEnv,
  };
  const messages = [];
  const sender = customSender || {
    configured: true,
    async sendReset(message) {
      messages.push(message);
      return { id: "fixture-message" };
    },
  };
  const apps = [];
  const open = async (nextEnv = env) => {
    const app = await buildApp({
      env: nextEnv,
      dataDir,
      logger,
      now: () => new Date(instant),
      resetEmailSender: sender,
    });
    apps.push(app);
    return app;
  };
  t.after(async () => {
    for (const app of apps) await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return {
    app: await open(),
    open,
    dataDir,
    env,
    sender,
    messages,
    tick: (amount) => {
      instant += amount;
    },
  };
}
function request(
  app,
  email = EMAIL,
  remoteAddress = "127.0.0.1",
  headers = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/password-reset/request",
    remoteAddress,
    headers: { origin: ORIGIN, ...headers },
    payload: { email },
  });
}
function token(message) {
  return new URLSearchParams(new URL(message.resetUrl).hash.split("?")[1]).get(
    "token",
  );
}
function confirm(
  app,
  value,
  password = NEW_PASSWORD,
  remoteAddress = "127.0.0.1",
) {
  return app.inject({
    method: "POST",
    url: "/api/password-reset/confirm",
    remoteAddress,
    headers: { origin: ORIGIN },
    payload: { token: value, password },
  });
}
async function login(app, password = PASSWORD, email = EMAIL) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin: ORIGIN },
    payload: { email, password },
  });
  return {
    response,
    headers: {
      origin: ORIGIN,
      cookie: response.cookies[0]
        ? `${response.cookies[0].name}=${response.cookies[0].value}`
        : "",
      "x-csrf-token": response.json().csrfToken || "",
    },
  };
}
function withDb(dataDir, inspect) {
  const db = new DatabaseSync(path.join(dataDir, "nexo.sqlite"));
  try {
    return inspect(db);
  } finally {
    db.close();
  }
}

test("request responses do not enumerate accounts and never await email delivery", async (t) => {
  let release;
  const delivered = [];
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { app } = await fixture(t, {
    sender: {
      configured: true,
      async sendReset(message) {
        delivered.push(message);
        await pending;
      },
    },
  });
  try {
    const known = await request(app);
    const unknown = await request(app, "unknown@nexo.example.com", "192.0.2.1");
    const repeated = await request(app);
    assert.equal(known.statusCode, 202);
    assert.deepEqual(known.json(), unknown.json());
    assert.deepEqual(known.json(), repeated.json());
    await flush();
    assert.equal(delivered.length, 1);
    assert.equal(known.headers["cache-control"], "no-store");
    assert.equal(known.headers["referrer-policy"], "no-referrer");
    assert.equal(
      (await app.inject("/api/session")).json().passwordResetAvailable,
      true,
    );
  } finally {
    release();
  }
});

test("configuration and origin are global gates, independent of account existence", async (t) => {
  const { app } = await fixture(t, {
    sender: {
      configured: false,
      async sendReset() {
        assert.fail("No configured transport");
      },
    },
  });
  assert.equal(
    (await app.inject("/api/session")).json().passwordResetAvailable,
    false,
  );
  const known = await request(app);
  const unknown = await request(app, "missing@example.org");
  assert.equal(known.statusCode, 503);
  assert.equal(known.json().code, "PASSWORD_RESET_UNAVAILABLE");
  assert.deepEqual(known.json(), unknown.json());
  assert.equal(
    (
      await request(app, EMAIL, "127.0.0.1", {
        origin: "https://foreign.example",
      })
    ).statusCode,
    403,
  );
  const local = await fixture(t, { env: { CMS_ORIGIN: "" } });
  assert.equal((await request(local.app)).statusCode, 503);
});

test("reset links use configured origin and only SHA-256 token hashes persist", async (t) => {
  const { app, messages, dataDir } = await fixture(t);
  const response = await request(app, EMAIL.toUpperCase(), "127.0.0.1", {
    host: "attacker.example",
    "x-forwarded-host": "attacker.example",
  });
  assert.equal(response.statusCode, 202);
  await flush();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, EMAIL);
  assert.equal(messages[0].expiresMinutes, 30);
  assert.match(
    messages[0].resetUrl,
    /^http:\/\/localhost:8080\/admin\/#redefinir-senha\?token=[a-f0-9]{64}$/,
  );
  assert.match(messages[0].idempotencyKey, /^password-reset\//);
  const value = token(messages[0]);
  withDb(dataDir, (db) => {
    const saved = db.prepare("SELECT * FROM password_reset_tokens").get();
    assert.equal(
      saved.token_hash,
      createHash("sha256").update(value).digest("hex"),
    );
    assert.equal(saved.expires_at - saved.created_at, 30 * 60 * 1000);
    assert.equal(JSON.stringify(saved).includes(value), false);
  });
  assert.equal(
    (await app.inject("/api/password-reset/confirm")).statusCode,
    404,
  );
  assert.equal(
    (await confirm(app, value)).statusCode,
    200,
    "GET never consumed the token",
  );
});

test("reset survives restart, changes password once, and revokes every old session", async (t) => {
  const { app, open, messages, dataDir } = await fixture(t);
  const first = await login(app);
  const second = await login(app);
  assert.equal(first.response.statusCode, 200);
  await request(app);
  await flush();
  const value = token(messages[0]);
  await app.close();
  const restarted = await open();
  const response = await confirm(restarted, value);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { ok: true });
  assert.equal(
    response.headers["set-cookie"],
    undefined,
    "reset does not automatically log in",
  );
  assert.equal((await confirm(restarted, value)).statusCode, 400);
  for (const headers of [first.headers, second.headers])
    assert.equal(
      (await restarted.inject({ url: "/api/admin/content", headers }))
        .statusCode,
      401,
    );
  assert.equal((await login(restarted, PASSWORD)).response.statusCode, 401);
  assert.equal((await login(restarted, NEW_PASSWORD)).response.statusCode, 200);
  withDb(dataDir, (db) =>
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM password_reset_tokens").get()
        .count,
      0,
    ),
  );
  await restarted.close();
  const again = await open();
  assert.equal(
    (await login(again, NEW_PASSWORD)).response.statusCode,
    200,
    "unchanged bootstrap ENV never overwrites a reset password",
  );
});

test("expired, malformed and superseded reset tokens never change credentials", async (t) => {
  const { app, messages, tick } = await fixture(t);
  await request(app);
  await flush();
  const old = token(messages[0]);
  tick(61_000);
  await request(app);
  await flush();
  const current = token(messages[1]);
  const invalid = await confirm(app, old);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, "RESET_TOKEN_INVALID");
  assert.equal(invalid.json().field, "token");
  const weak = await confirm(app, current, "short");
  assert.equal(weak.statusCode, 400);
  assert.equal(weak.json().field, "password");
  tick(30 * 60 * 1000);
  const expired = await confirm(app, current);
  const malformed = await confirm(app, "not-a-token");
  assert.deepEqual(expired.json(), malformed.json());
  assert.equal((await login(app)).response.statusCode, 200);
});

test("concurrent confirmations consume a reset token transactionally", async (t) => {
  const { app, messages } = await fixture(t);
  await request(app);
  await flush();
  const value = token(messages[0]);
  const results = await Promise.all([
    confirm(app, value, "first-competing-new-password"),
    confirm(app, value, "second-competing-new-password"),
  ]);
  assert.deepEqual(
    results.map((response) => response.statusCode).sort(),
    [200, 400],
  );
  const passwords = [
    "first-competing-new-password",
    "second-competing-new-password",
  ];
  const winner = results.findIndex((response) => response.statusCode === 200);
  assert.equal((await login(app, passwords[winner])).response.statusCode, 200);
  assert.equal(
    (await login(app, passwords[1 - winner])).response.statusCode,
    401,
  );
});

test("normal password changes and account deactivation invalidate reset links even after reactivation", async (t) => {
  const { app, messages, tick, dataDir } = await fixture(t);
  const admin = await login(app);
  await request(app);
  await flush();
  const old = token(messages[0]);
  const changed = await app.inject({
    method: "POST",
    url: "/api/admin/password",
    headers: admin.headers,
    payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await confirm(app, old)).statusCode, 400);
  const currentAdmin = await login(app, NEW_PASSWORD);
  const editorEmail = "editor@nexo.example.com";
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: currentAdmin.headers,
    payload: {
      name: "Editor",
      email: editorEmail,
      password: PASSWORD,
      role: "editor",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  await request(app, editorEmail);
  await flush();
  const editorToken = token(messages.at(-1));
  const url = `/api/admin/users/${created.json().user.id}`;
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url,
        headers: currentAdmin.headers,
        payload: { active: false },
      })
    ).statusCode,
    200,
  );
  const count = messages.length;
  tick(61_000);
  const inactive = await request(app, editorEmail);
  assert.equal(inactive.statusCode, 202);
  await flush();
  assert.equal(
    messages.length,
    count,
    "inactive accounts never receive resets",
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url,
        headers: currentAdmin.headers,
        payload: { active: true },
      })
    ).statusCode,
    200,
  );
  assert.equal((await confirm(app, editorToken)).statusCode, 400);
  withDb(dataDir, (db) =>
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM password_reset_tokens").get()
        .count,
      0,
    ),
  );
});

test("cooldowns, account limits, IP limits and daily email cap are persistent and generic", async (t) => {
  const { app, open, messages, tick } = await fixture(t, {
    env: { RESET_EMAIL_DAILY_LIMIT: "2" },
  });
  const first = await request(app);
  await flush();
  assert.equal(messages.length, 1);
  assert.deepEqual((await request(app)).json(), first.json());
  tick(61_000);
  await request(app);
  await flush();
  assert.equal(messages.length, 2);
  tick(61_000);
  await request(app);
  await flush();
  assert.equal(
    messages.length,
    2,
    "daily cap stops additional transport calls",
  );
  await app.close();
  const restarted = await open();
  tick(61_000);
  assert.deepEqual((await request(restarted)).json(), first.json());
  await flush();
  assert.equal(messages.length, 2, "daily budget survives restart");
  tick(24 * 60 * 60 * 1000);
  for (let index = 0; index < 10; index++)
    await request(restarted, `unknown${index}@example.org`, "192.0.2.20");
  await request(restarted, EMAIL, "192.0.2.20");
  await flush();
  assert.equal(
    messages.length,
    2,
    "unknown accounts consume the same IP request budget",
  );
  await request(restarted, EMAIL, "192.0.2.21");
  await flush();
  assert.equal(
    messages.length,
    3,
    "next UTC day restores budget for an independent client",
  );
});

test("confirmation brute-force limits do not consume or lock a valid reset", async (t) => {
  const { app, messages, tick } = await fixture(t);
  await request(app);
  await flush();
  const value = token(messages[0]);
  for (let index = 0; index < 10; index++)
    assert.equal((await confirm(app, "a".repeat(64))).statusCode, 400);
  assert.equal((await confirm(app, value)).statusCode, 429);
  tick(15 * 60 * 1000 + 1);
  assert.equal((await confirm(app, value)).statusCode, 200);
});

test("per-account hourly limit applies across different IP addresses", async (t) => {
  const { app, messages, tick } = await fixture(t);
  for (let count = 0; count < 4; count++) {
    assert.equal(
      (await request(app, EMAIL, `192.0.2.${count + 1}`)).statusCode,
      202,
    );
    await flush();
    tick(61_000);
  }
  assert.equal(messages.length, 3);
  tick(60 * 60 * 1000);
  assert.equal((await request(app)).statusCode, 202);
  await flush();
  assert.equal(messages.length, 4);
});

test("reset payloads and origins are strict without consuming a valid token", async (t) => {
  const { app, messages } = await fixture(t);
  for (const payload of [
    { email: EMAIL, redirect: "https://attacker.example" },
    { email: "invalid" },
    { email: EMAIL, token: "unexpected" },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/password-reset/request",
      headers: { origin: ORIGIN },
      payload,
    });
    assert.equal(response.statusCode, 400);
  }
  await request(app);
  await flush();
  const value = token(messages[0]);
  for (const headers of [{}, { origin: "https://foreign.example" }]) {
    const denied = await app.inject({
      method: "POST",
      url: "/api/password-reset/confirm",
      headers,
      payload: { token: value, password: NEW_PASSWORD },
    });
    assert.equal(denied.statusCode, 403);
  }
  const extra = await app.inject({
    method: "POST",
    url: "/api/password-reset/confirm",
    headers: { origin: ORIGIN },
    payload: { token: value, password: NEW_PASSWORD, userId: "someone-else" },
  });
  assert.equal(extra.statusCode, 400);
  assert.equal((await confirm(app, value)).statusCode, 200);
});

test("traffic already limited by IP cannot consume the global recovery budget", async (t) => {
  const { app, messages, dataDir } = await fixture(t);
  const blockedIp = "192.0.2.60";
  const ipKey = `request-ip:${createHash("sha256").update(blockedIp).digest("hex")}`;
  withDb(dataDir, (db) => {
    db.prepare("INSERT INTO password_reset_limits VALUES (?, ?, ?)").run(
      ipKey,
      10,
      Date.parse("2026-09-07T12:15:00Z"),
    );
    db.prepare("INSERT INTO password_reset_limits VALUES (?, ?, ?)").run(
      "requests-day:2026-09-07",
      999,
      Date.parse("2026-09-08T00:00:00Z"),
    );
  });
  for (let index = 0; index < 3; index++)
    assert.equal(
      (await request(app, `abuse${index}@example.org`, blockedIp)).statusCode,
      202,
    );
  withDb(dataDir, (db) =>
    assert.equal(
      db
        .prepare(
          "SELECT count FROM password_reset_limits WHERE key = 'requests-day:2026-09-07'",
        )
        .get().count,
      999,
    ),
  );
  assert.equal((await request(app, EMAIL, "192.0.2.61")).statusCode, 202);
  await flush();
  assert.equal(messages.length, 1, "another client can still request recovery");
});

test("provider failures stay generic, invalidate the failed link and never log payload secrets", async (t) => {
  const messages = [];
  const logs = [];
  const { app, dataDir } = await fixture(t, {
    logger: { level: "info", stream: { write: (line) => logs.push(line) } },
    sender: {
      configured: true,
      async sendReset(message) {
        messages.push(message);
        throw new Error(`Provider leaked ${message.to} ${message.resetUrl}`);
      },
    },
  });
  const known = await request(app);
  const unknown = await request(app, "unknown@example.org", "192.0.2.1");
  assert.deepEqual(known.json(), unknown.json());
  await flush();
  const secret = token(messages[0]);
  withDb(dataDir, (db) =>
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM password_reset_tokens").get()
        .count,
      0,
    ),
  );
  assert.equal(logs.join("").includes(secret), false);
  assert.equal(logs.join("").includes(EMAIL), false);
  assert.equal(logs.join("").includes(PASSWORD), false);
});

test("change notifications share the reset budget and quota exhaustion cannot prevent confirmation", async (t) => {
  for (const limit of ["1", "2"]) {
    const resets = [],
      changes = [];
    const { app } = await fixture(t, {
      env: { RESET_EMAIL_DAILY_LIMIT: limit },
      sender: {
        configured: true,
        async sendReset(message) {
          resets.push(message);
        },
        async sendPasswordChanged(message) {
          changes.push(message);
        },
      },
    });
    await request(app);
    await flush();
    const response = await confirm(app, token(resets[0]));
    assert.equal(response.statusCode, 200, response.body);
    await flush();
    assert.equal(changes.length, Number(limit) - 1);
    if (changes.length) {
      assert.equal(changes[0].to, EMAIL);
      assert.equal(Object.hasOwn(changes[0], "password"), false);
      assert.equal(Object.hasOwn(changes[0], "token"), false);
    }
  }
});
