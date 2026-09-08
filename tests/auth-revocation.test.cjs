const test = require("node:test");
const assert = require("node:assert/strict");
const { createHook } = require("node:async_hooks");
const { mkdtempSync, rmSync, readdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { buildApp } = require("../server/app.cjs");

const ORIGIN = "http://localhost:8080";
const EMAIL = "admin@nexo.example.com";
const PASSWORD = "initial-private-password";

async function fixture(t) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "nexo-revocation-test-"));
  const app = await buildApp({
    dataDir,
    logger: false,
    env: { NODE_ENV: "test", ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: PASSWORD },
  });
  t.after(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  const login = async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: ORIGIN },
      payload: { email: EMAIL, password: PASSWORD },
    });
    assert.equal(response.statusCode, 200, response.body);
    return {
      origin: ORIGIN,
      cookie: `${response.cookies[0].name}=${response.cookies[0].value}`,
      "x-csrf-token": response.json().csrfToken,
    };
  };
  return { app, dataDir, login, headers: await login() };
}

function heldPayload() {
  const started = Promise.withResolvers();
  const stream = new Readable({ read: () => started.resolve() });
  return {
    stream,
    started: started.promise,
    release(payload) {
      stream.push(payload);
      stream.push(null);
    },
  };
}

async function logout(app, headers) {
  const response = await app.inject({
    method: "POST",
    url: "/api/logout",
    headers,
  });
  assert.equal(response.statusCode, 200, response.body);
}

test("logout revokes mutations whose JSON body is still arriving", async (t) => {
  const { app, headers, login } = await fixture(t);
  const initial = (
    await app.inject({ url: "/api/admin/content", headers })
  ).json();
  const content = structuredClone(initial.draft);
  content.site.email = "changed@nexo.example.com";
  const payload = heldPayload();
  const pending = app
    .inject({
      method: "PUT",
      url: "/api/admin/content",
      headers: { ...headers, "content-type": "application/json" },
      payload: payload.stream,
    })
    .then((response) => response);
  await payload.started;
  await logout(app, headers);
  payload.release(JSON.stringify({ version: initial.version, content }));
  const response = await pending;
  assert.equal(response.statusCode, 401, response.body);
  const current = (
    await app.inject({ url: "/api/admin/content", headers: await login() })
  ).json();
  assert.deepEqual(current, initial);
});

test("logout revokes uploads that are still being received without persisting files", async (t) => {
  const { app, headers, dataDir, login } = await fixture(t);
  const payload = heldPayload();
  const boundary = "nexo-revoked-upload";
  const pending = app
    .inject({
      method: "POST",
      url: "/api/admin/uploads",
      headers: {
        ...headers,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: payload.stream,
    })
    .then((response) => response);
  await payload.started;
  await logout(app, headers);
  payload.release(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notice.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\nDocument\n%%EOF\r\n--${boundary}--\r\n`,
  );
  const response = await pending;
  assert.equal(response.statusCode, 401, response.body);
  assert.deepEqual(readdirSync(path.join(dataDir, "uploads")), []);
  const assets = (
    await app.inject({ url: "/api/admin/assets", headers: await login() })
  ).json().assets;
  assert.deepEqual(assets, []);
});

test("logout during password hashing cannot create accounts or change credentials", async (t) => {
  const { app, login } = await fixture(t);
  for (const [url, payload] of [
    [
      "/api/admin/users",
      {
        name: "Editor",
        email: "editor@nexo.example.com",
        role: "editor",
        password: "individual-editor-password",
      },
    ],
    [
      "/api/admin/password",
      { currentPassword: PASSWORD, newPassword: "changed-private-password" },
    ],
  ]) {
    const headers = await login();
    const started = Promise.withResolvers();
    const hook = createHook({
      init(_asyncId, type) {
        if (type === "SCRYPTREQUEST") {
          hook.disable();
          started.resolve();
        }
      },
    }).enable();
    t.after(() => hook.disable());
    const pending = app
      .inject({ method: "POST", url, headers, payload })
      .then((response) => response);
    await started.promise;
    await logout(app, headers);
    const response = await pending;
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.cookies.length, 0);
  }
  const headers = await login();
  const users = (await app.inject({ url: "/api/admin/users", headers })).json()
    .users;
  assert.equal(users.length, 1);
  assert.equal(users[0].email, EMAIL);
});

test("uploads reject additional multipart parts without persisting an asset or returning a server error", async (t) => {
  const { app, headers, dataDir } = await fixture(t);
  const boundary = "nexo-extra-upload";
  const file = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notice.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\nDocument\n%%EOF\r\n`;
  for (const extra of [
    `--${boundary}\r\nContent-Disposition: form-data; name="extra"\r\n\r\nvalue\r\n`,
    file,
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/uploads",
      headers: {
        ...headers,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: `${file}${extra}--${boundary}--\r\n`,
    });
    assert.ok([400, 413].includes(response.statusCode), response.body);
  }
  assert.deepEqual(readdirSync(path.join(dataDir, "uploads")), []);
  assert.deepEqual(
    (await app.inject({ url: "/api/admin/assets", headers })).json().assets,
    [],
  );
});
