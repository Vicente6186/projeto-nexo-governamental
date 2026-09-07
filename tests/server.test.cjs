const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { buildApp } = require("../server/app.cjs");
const { DEFAULT_CONTENT } = require("../shared/content.cjs");

const ORIGIN = "http://localhost:8080";
const previewEnv = { NODE_ENV: "test", CMS_LOCAL_PREVIEW: "1" };
const copy = (value) => JSON.parse(JSON.stringify(value));

async function fixture(t, env = previewEnv, options = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "nexo-cms-test-"));
  const apps = [];
  const open = async (nextEnv = env) => {
    const app = await buildApp({
      dataDir,
      env: nextEnv,
      logger: false,
      ...options,
    });
    apps.push(app);
    return app;
  };
  t.after(async () => {
    for (const app of apps) await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return { app: await open(), open, dataDir };
}
async function localLogin(app) {
  const response = await app.inject({
    method: "POST",
    url: "/api/local-session",
    headers: { origin: ORIGIN },
  });
  assert.equal(response.statusCode, 200, response.body);
  return {
    cookie: response.cookies[0].name + "=" + response.cookies[0].value,
    origin: ORIGIN,
    "x-csrf-token": response.json().csrfToken,
  };
}
async function getState(app, headers) {
  const response = await app.inject({ url: "/api/admin/content", headers });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

test("published content is public, drafts and private resources require a session", async (t) => {
  const { app } = await fixture(t);
  const publicResponse = await app.inject("/api/content");
  assert.equal(publicResponse.statusCode, 200);
  assert.deepEqual(publicResponse.json().content, DEFAULT_CONTENT);
  assert.equal(publicResponse.headers["x-content-type-options"], "nosniff");
  for (const url of [
    "/api/admin/content",
    "/api/admin/preview",
    "/api/admin/assets",
  ])
    assert.equal((await app.inject(url)).statusCode, 401);
  const session = (await app.inject("/api/session")).json();
  assert.deepEqual(session, {
    authenticated: false,
    user: null,
    localPreview: true,
  });
  assert.equal((await app.inject("/api/not-found")).statusCode, 404);
});

test("local preview is explicitly enabled, loopback-only and protected against foreign origins", async (t) => {
  const { app, open } = await fixture(t);
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/local-session" }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/local-session",
        headers: { origin: "https://foreign.example" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/local-session",
        remoteAddress: "192.0.2.2",
        headers: { origin: ORIGIN },
      })
    ).statusCode,
    404,
  );
  const headers = await localLogin(app);
  const authenticated = await app.inject({ url: "/api/session", headers });
  assert.equal(authenticated.json().authenticated, true);
  assert.deepEqual(authenticated.json().user, {
    name: "Equipe Nexo",
    email: "",
  });
  const disabled = await open({ NODE_ENV: "test" });
  assert.equal(
    (await disabled.inject({ url: "/api/session", headers })).json()
      .authenticated,
    false,
  );
  assert.equal(
    (
      await disabled.inject({
        method: "POST",
        url: "/api/local-session",
        headers: { origin: ORIGIN },
      })
    ).statusCode,
    404,
  );
});

test("every editing operation requires the origin and CSRF token; logout revokes the session", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const state = await getState(app, headers);
  const request = {
    method: "PUT",
    url: "/api/admin/content",
    payload: { version: state.version, content: state.draft },
  };
  assert.equal(
    (
      await app.inject({
        ...request,
        headers: { cookie: headers.cookie, origin: ORIGIN },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        ...request,
        headers: { ...headers, origin: "https://foreign.example" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        ...request,
        headers: { ...headers, "x-csrf-token": "é".repeat(64) },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/logout", headers }))
      .statusCode,
    200,
  );
  assert.equal((await app.inject({ ...request, headers })).statusCode, 401);
});

test("drafts persist across restarts, publication is explicit, and restore affects only the draft", async (t) => {
  const { app, open } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const draft = copy(original.draft);
  draft.sections[0].title = "Um novo título para o Nexo";
  let response = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: draft, version: original.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().version, original.version + 1);
  assert.equal(
    (await app.inject("/api/content")).json().content.sections[0].title,
    original.draft.sections[0].title,
  );
  assert.equal(
    (await app.inject({ url: "/api/admin/preview", headers })).json().content
      .sections[0].title,
    draft.sections[0].title,
  );
  await app.close();
  const restarted = await open();
  const persisted = await getState(restarted, headers);
  assert.deepEqual(persisted.draft, draft);
  response = await restarted.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: persisted.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  const published = response.json();
  assert.equal(published.publishedVersion, published.version);
  assert.equal(
    (await restarted.inject("/api/content")).json().content.sections[0].title,
    draft.sections[0].title,
  );
  response = await restarted.inject({
    method: "POST",
    url: "/api/admin/restore",
    headers,
    payload: { id: original.history[0].id, version: published.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().draft, original.draft);
  assert.deepEqual(response.json().published, draft);
  assert.equal(response.json().history[0].action, "draft.restored");
});

test("concurrent editors cannot overwrite, publish or restore a stale version", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const saved = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: original.draft, version: original.version },
  });
  assert.equal(saved.statusCode, 200);
  for (const request of [
    {
      method: "PUT",
      url: "/api/admin/content",
      payload: { content: original.draft, version: original.version },
    },
    {
      method: "POST",
      url: "/api/admin/publish",
      payload: { version: original.version },
    },
    {
      method: "POST",
      url: "/api/admin/restore",
      payload: { id: original.history[0].id, version: original.version },
    },
  ]) {
    const response = await app.inject({ ...request, headers });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().currentVersion, saved.json().version);
  }
});

test("content validation rejects script URLs, invalid shapes, duplicate sections and impossible dates", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const mutations = [
    (draft) => {
      draft.selection.applicationUrl = "javascript:alert(1)";
    },
    (draft) => {
      draft.sections[3].items[0].image =
        "data:text/html,<script>alert(1)</script>";
    },
    (draft) => {
      draft.site.instagramUrl = "https://user:password@example.com";
    },
    (draft) => {
      draft.sections[0].extra = { image: "/uploads/../secret" };
    },
    (draft) => {
      draft.selection.scheduleImage = "/uploads/example.pdf";
    },
    (draft) => {
      draft.sections[1].id = draft.sections[0].id;
    },
    (draft) => {
      draft.sections[0].visible = "true";
    },
    (draft) => {
      draft.sections[0].title = "x".repeat(301);
    },
    (draft) => {
      draft.selection.opensAt = "2026-02-30";
    },
    (draft) => {
      draft.selection.opensAt = "2026-09-08";
      draft.selection.closesAt = "2026-09-07";
    },
    (draft) => {
      draft.selection.unrecognized = "value";
    },
    (draft) => {
      draft.selection.stages = [
        {
          id: "stage-1",
          title: "Inscrições",
          date: "2026-02-30",
          description: "",
        },
      ];
    },
    (draft) => {
      draft.selection.stages = [
        {
          id: "stage-1",
          title: "Inscrições",
          date: "na próxima semana",
          description: "",
        },
      ];
    },
  ];
  for (const mutation of mutations) {
    const draft = copy(original.draft);
    mutation(draft);
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/content",
      headers,
      payload: { content: draft, version: original.version },
    });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal((await getState(app, headers)).version, original.version);
  const valid = copy(original.draft);
  valid.sections[0].title = "x".repeat(300);
  valid.selection.title = "x".repeat(300);
  valid.selection.stages = [
    { id: "stage-1", title: "Inscrições", date: "", description: "" },
  ];
  const accepted = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: valid, version: original.version },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
});

test("open selection requires an application link; valid dates can schedule future or expired periods", async (t) => {
  const { app } = await fixture(t, previewEnv, {
    now: () => new Date("2026-09-07T15:00:00Z"),
  });
  const headers = await localLogin(app);
  let current = await getState(app, headers);
  const incomplete = copy(current.draft);
  incomplete.selection.status = "open";
  current = (
    await app.inject({
      method: "PUT",
      url: "/api/admin/content",
      headers,
      payload: { content: incomplete, version: current.version },
    })
  ).json();
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/admin/publish",
        headers,
        payload: { version: current.version },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await app.inject("/api/content")).json().content.selection.status,
    "closed",
  );
  for (const values of [
    {
      applicationUrl: "https://forms.example.com/nexo",
      opensAt: "",
      closesAt: "2026-09-06",
    },
    {
      applicationUrl: "https://forms.example.com/nexo",
      opensAt: "2026-09-08",
      closesAt: "2026-09-20",
    },
  ]) {
    const draft = copy(current.draft);
    Object.assign(draft.selection, values);
    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/content",
      headers,
      payload: { content: draft, version: current.version },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const published = await app.inject({
      method: "POST",
      url: "/api/admin/publish",
      headers,
      payload: { version: saved.json().version },
    });
    assert.equal(published.statusCode, 200, published.body);
    current = published.json();
  }
});

test("configured login sets secure production cookies and credential changes invalidate old sessions", async (t) => {
  const env = {
    NODE_ENV: "production",
    CMS_ORIGIN: "https://nexo.example.com",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "a-long-private-passphrase",
  };
  const { app, open } = await fixture(t, env);
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin: env.CMS_ORIGIN },
    payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.match(response.headers["set-cookie"], /HttpOnly/);
  assert.match(response.headers["set-cookie"], /Secure/);
  assert.match(response.headers["set-cookie"], /SameSite=Strict/);
  const headers = {
    cookie: response.cookies[0].name + "=" + response.cookies[0].value,
  };
  assert.equal(
    (await app.inject({ url: "/api/admin/content", headers })).statusCode,
    200,
  );
  await app.close();
  const unchanged = await open();
  assert.equal(
    (await unchanged.inject({ url: "/api/admin/content", headers })).statusCode,
    200,
  );
  await unchanged.close();
  const restarted = await open({
    ...env,
    ADMIN_PASSWORD: "a-different-private-passphrase",
  });
  assert.equal(
    (await restarted.inject({ url: "/api/admin/content", headers })).statusCode,
    401,
  );
});

test("login rate limit applies to repeated failed credentials", async (t) => {
  const { app } = await fixture(t, {
    NODE_ENV: "test",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "a-long-private-passphrase",
  });
  for (let i = 0; i < 8; i++) {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: ORIGIN },
      payload: { email: "admin@nexo.example.com", password: "incorrect" },
    });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin: ORIGIN },
        payload: { email: "admin@nexo.example.com", password: "incorrect" },
      })
    ).statusCode,
    429,
  );
});

test("sessions expire after twelve hours", async (t) => {
  let timestamp = new Date("2026-09-07T15:00:00Z").getTime();
  const { app } = await fixture(t, previewEnv, {
    now: () => new Date(timestamp),
  });
  const headers = await localLogin(app);
  timestamp += 12 * 60 * 60 * 1000 + 1;
  assert.equal(
    (await app.inject({ url: "/api/admin/content", headers })).statusCode,
    401,
  );
});

test("production refuses missing or weak credentials, HTTP origins and local preview", async () => {
  for (const env of [
    { NODE_ENV: "production" },
    { NODE_ENV: "production", CMS_LOCAL_PREVIEW: "1" },
    {
      NODE_ENV: "production",
      ADMIN_EMAIL: "admin@nexo.example.com",
      ADMIN_PASSWORD: "short",
      CMS_ORIGIN: "https://nexo.example.com",
    },
    {
      NODE_ENV: "production",
      ADMIN_EMAIL: "admin@nexo.example.com",
      ADMIN_PASSWORD: "a-long-private-passphrase",
      CMS_ORIGIN: "http://nexo.example.com",
    },
    { NODE_ENV: "test", CMS_LOCAL_PREVIEW: "1", HOST: "0.0.0.0" },
  ])
    await assert.rejects(() => buildApp({ env, logger: false }));
});

test("uploads verify signatures, persist metadata, use random names and serve with nosniff", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const boundary = "nexo-test-boundary";
  const upload = (buffer, mime = "image/png", name = "capa.png") =>
    app.inject({
      method: "POST",
      url: "/api/admin/uploads",
      headers: {
        ...headers,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
        ),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
  assert.equal(
    (await upload(Buffer.from("<script>alert(1)</script>"))).statusCode,
    400,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal(
    (await upload(png, "application/pdf", "bad.pdf")).statusCode,
    400,
  );
  const response = await upload(png);
  assert.equal(response.statusCode, 201, response.body);
  const asset = response.json().asset;
  assert.equal(asset.name, "capa.png");
  assert.match(asset.url, /^\/uploads\/[a-f0-9-]{36}\.png$/);
  assert.equal(asset.size, png.length);
  const served = await app.inject(asset.url);
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(served.rawPayload, png);
  assert.deepEqual(
    (await app.inject({ url: "/api/admin/assets", headers })).json().assets,
    [asset],
  );
  const pdfResponse = await upload(
    Buffer.from("%PDF-1.7\n% a fixture\n%%EOF"),
    "application/pdf",
    "edital.pdf",
  );
  assert.equal(pdfResponse.statusCode, 201, pdfResponse.body);
  assert.equal(
    (await app.inject(pdfResponse.json().asset.url)).headers[
      "content-disposition"
    ],
    "attachment",
  );
  const current = await getState(app, headers);
  current.draft.selection.noticeUrl = pdfResponse.json().asset.url;
  const saved = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: current.draft, version: current.version },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(
    (await upload(Buffer.alloc(8 * 1024 * 1024 + 1))).statusCode,
    413,
  );
});

test("built site and admin are served from dist while unknown API routes remain JSON 404", async (t) => {
  const distDir = mkdtempSync(path.join(tmpdir(), "nexo-cms-dist-test-"));
  mkdirSync(path.join(distDir, "admin"));
  writeFileSync(
    path.join(distDir, "index.html"),
    "<!doctype html><title>Site Nexo</title>",
  );
  writeFileSync(
    path.join(distDir, "admin", "index.html"),
    "<!doctype html><title>Painel Nexo</title>",
  );
  t.after(() => rmSync(distDir, { recursive: true, force: true }));
  const env = {
    NODE_ENV: "production",
    CMS_ORIGIN: "https://nexo.example.com",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "a-long-private-passphrase",
  };
  const { app } = await fixture(t, env, { distDir });
  const site = await app.inject("/");
  assert.equal(site.statusCode, 200);
  assert.match(site.body, /Site Nexo/);
  assert.match(site.headers["content-security-policy"], /script-src 'self'/);
  assert.equal((await app.inject("/admin")).headers.location, "/admin/");
  const admin = await app.inject("/admin/");
  assert.equal(admin.statusCode, 200);
  assert.match(admin.body, /Painel Nexo/);
  assert.equal(admin.headers["x-robots-tag"], "noindex, nofollow");
  const missing = await app.inject("/api/missing");
  assert.equal(missing.statusCode, 404);
  assert.match(missing.headers["content-type"], /application\/json/);
});
