const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { DatabaseSync } = require("node:sqlite");
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
    passwordResetAvailable: false,
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
    id: "local-preview",
    name: "Equipe Nexo",
    email: "",
    role: "admin",
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

test("disabling local preview permanently revokes demonstration sessions while preserving real accounts and editorial previews", async (t) => {
  const env = {
    NODE_ENV: "test",
    CMS_LOCAL_PREVIEW: "1",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "real-account-private-password",
  };
  const { app, open, dataDir } = await fixture(t, env);
  const demoHeaders = await localLogin(app);
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin: ORIGIN },
    payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  assert.equal(login.statusCode, 200, login.body);
  const realHeaders = {
    origin: ORIGIN,
    cookie: `${login.cookies[0].name}=${login.cookies[0].value}`,
    "x-csrf-token": login.json().csrfToken,
  };
  const original = await getState(app, realHeaders);
  await app.close();
  const disabled = await open({ ...env, CMS_LOCAL_PREVIEW: "0" });
  const session = await disabled.inject({
    url: "/api/session",
    headers: demoHeaders,
  });
  assert.equal(session.json().authenticated, false);
  assert.equal(session.json().localPreview, false);
  assert.equal(
    (await disabled.inject({ url: "/api/admin/content", headers: demoHeaders }))
      .statusCode,
    401,
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
  const authenticated = await disabled.inject({
    url: "/api/session",
    headers: realHeaders,
  });
  assert.equal(authenticated.json().authenticated, true);
  assert.equal(authenticated.json().user.id, login.json().user.id);
  assert.deepEqual(await getState(disabled, realHeaders), original);
  const editorialPreview = await disabled.inject({
    url: "/api/admin/preview",
    headers: realHeaders,
  });
  assert.equal(editorialPreview.statusCode, 200);
  assert.deepEqual(editorialPreview.json().content, original.draft);
  const freshLogin = await disabled.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin: ORIGIN },
    payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  assert.equal(freshLogin.statusCode, 200, freshLogin.body);
  const database = new DatabaseSync(path.join(dataDir, "nexo.sqlite"));
  try {
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM sessions WHERE preview = 1")
        .get().count,
      0,
    );
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM users WHERE active = 1")
        .get().count,
      1,
    );
  } finally {
    database.close();
  }
  await disabled.close();
  const enabledAgain = await open(env);
  assert.equal(
    (
      await enabledAgain.inject({
        url: "/api/admin/content",
        headers: demoHeaders,
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await enabledAgain.inject({
        url: "/api/admin/content",
        headers: realHeaders,
      })
    ).statusCode,
    200,
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

test("selection and contact drafts persist across restarts and publication is explicit", async (t) => {
  const { app, open } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const draft = copy(original.draft);
  Object.assign(draft.selection, {
    edition: "2027.1",
    status: "upcoming",
    opensAt: "2027-02-01",
    closesAt: "2027-02-28",
    noticeUrl: "https://nexo.example.com/edital.pdf",
    applicationUrl: "https://forms.example.com/nexo-2027",
    stages: [
      {
        id: "inscricoes",
        title: "Inscrições",
        date: "2027-02-01",
        description: "Inscreva-se pelo formulário.",
      },
    ],
  });
  Object.assign(draft.site, {
    email: "contato@nexo.example.com",
    instagramUrl: "https://www.instagram.com/nexogovernamental/",
    instagramHandle: "@nexogovernamental",
  });
  let response = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: draft, version: original.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().version, original.version + 1);
  assert.equal(
    (await app.inject("/api/content")).json().content.selection.edition,
    original.draft.selection.edition,
  );
  assert.equal(
    (await app.inject({ url: "/api/admin/preview", headers })).json().content
      .selection.edition,
    draft.selection.edition,
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
    (await restarted.inject("/api/content")).json().content.selection.edition,
    draft.selection.edition,
  );
  const expected = copy(draft);
  expected.selection.scheduleImage = "";
  assert.deepEqual(published.published, expected);
  assert.deepEqual(published.published.sections, original.published.sections);
});

test("publishing a structured schedule retires the historical image and clearing stages never restores it", async (t) => {
  const { app, dataDir } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  assert.ok(original.published.selection.scheduleImage);
  const draft = copy(original.draft);
  draft.selection.stages = [
    {
      id: "inscricoes",
      title: "Inscrições",
      date: "2027-02-01",
      description: "",
    },
  ];
  const saved = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: draft, version: original.version },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(
    saved.json().draft.selection.scheduleImage,
    original.published.selection.scheduleImage,
  );
  assert.equal(
    (await app.inject("/api/content")).json().content.selection.scheduleImage,
    original.published.selection.scheduleImage,
  );
  const published = await app.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: saved.json().version },
  });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().published.selection.scheduleImage, "");
  assert.equal(published.json().draft.selection.scheduleImage, "");
  const clearedDraft = copy(published.json().draft);
  clearedDraft.selection.stages = [];
  const cleared = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: clearedDraft, version: published.json().version },
  });
  assert.equal(cleared.statusCode, 200, cleared.body);
  const preview = await app.inject({ url: "/api/admin/preview", headers });
  assert.equal(preview.json().content.selection.scheduleImage, "");
  assert.deepEqual(preview.json().content.selection.stages, []);
  const finalPublication = await app.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: cleared.json().version },
  });
  assert.equal(finalPublication.statusCode, 200, finalPublication.body);
  const publicContent = (await app.inject("/api/content")).json().content;
  assert.equal(publicContent.selection.scheduleImage, "");
  assert.deepEqual(publicContent.selection.stages, []);
  assert.deepEqual(publicContent.sections, original.published.sections);
  const db = new DatabaseSync(path.join(dataDir, "nexo.sqlite"));
  try {
    const historical = JSON.parse(
      db
        .prepare("SELECT content FROM history WHERE id = ?")
        .get(original.history[0].id).content,
    );
    assert.deepEqual(historical, original.published);
  } finally {
    db.close();
  }
});

test("full-history restoration is blocked without modifying drafts, publication or history", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/restore",
    headers,
    payload: { id: original.history[0].id, version: original.version },
  });
  assert.equal(response.statusCode, 403, response.body);
  assert.match(response.json().error, /restauração de versões completas/);
  assert.deepEqual(await getState(app, headers), original);
});

test("concurrent editors cannot overwrite or publish a stale version", async (t) => {
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
  ]) {
    const response = await app.inject({ ...request, headers });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().currentVersion, saved.json().version);
  }
});

test("renewed cookies explicitly report stale CSRF before any content mutation", async (t) => {
  const { app } = await fixture(t);
  const firstTab = await localLogin(app);
  const renewed = await localLogin(app);
  const original = await getState(app, renewed);
  const content = copy(original.draft);
  content.selection.edition = "Alteração preservada";
  const rejected = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers: { ...renewed, "x-csrf-token": firstTab["x-csrf-token"] },
    payload: { version: original.version, content },
  });
  assert.equal(rejected.statusCode, 403);
  assert.equal(rejected.json().code, "CSRF_EXPIRED");
  assert.deepEqual(await getState(app, renewed), original);
  const session = await app.inject({
    url: "/api/session",
    headers: { cookie: renewed.cookie },
  });
  const saved = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers: { ...renewed, "x-csrf-token": session.json().csrfToken },
    payload: { version: original.version, content },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().draft.selection.edition, content.selection.edition);
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

test("direct requests cannot change institutional content, section structure or process presentation", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const mutations = [
    (draft) => {
      draft.site.name = "Outro nome";
    },
    (draft) => {
      draft.site.description = "Outra descrição institucional";
    },
    (draft) => {
      draft.site.footerTitle = "Outro rodapé";
    },
    (draft) => {
      draft.sections[0].title = "Outro título";
    },
    (draft) => {
      draft.sections[0].visible = !draft.sections[0].visible;
    },
    (draft) => {
      draft.sections.reverse();
    },
    (draft) => {
      draft.sections[3].items[0].image = "https://example.com/outra.jpg";
    },
    (draft) => {
      draft.selection.title = "Título alterado";
    },
    (draft) => {
      draft.selection.description = "Descrição alterada";
    },
    (draft) => {
      draft.selection.buttonLabel = "Botão alterado";
    },
    (draft) => {
      draft.selection.scheduleTitle = "Cronograma alterado";
    },
    (draft) => {
      draft.selection.scheduleImage = "https://example.com/cronograma.jpg";
    },
  ];
  for (const mutation of mutations) {
    const draft = copy(original.draft);
    draft.site.email = "tentativa@nexo.example.com";
    mutation(draft);
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/content",
      headers,
      payload: { content: draft, version: original.version },
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.match(
      response.json().error,
      /textos institucionais e a estrutura do site são fixos/,
    );
  }
  assert.deepEqual(await getState(app, headers), original);
  assert.deepEqual(
    (await app.inject("/api/content")).json().content,
    original.published,
  );
});

test("legacy drafts cannot leak protected changes through admin state, preview or publication", async (t) => {
  const { app, dataDir } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const published = copy(original.published);
  published.site.name = "Nome institucional já publicado";
  published.sections[0].title = "Título institucional já publicado";
  published.selection.title = "Título do processo já publicado";
  const legacyDraft = copy(published);
  legacyDraft.site.name = "Nome privado de rascunho legado";
  legacyDraft.site.footerTitle = "Rodapé privado de rascunho legado";
  legacyDraft.sections[0].title = "Título privado de rascunho legado";
  legacyDraft.sections[0].visible = false;
  legacyDraft.selection.title = "Título do processo privado de rascunho legado";
  legacyDraft.selection.status = "upcoming";
  legacyDraft.selection.edition = "2028.1";
  legacyDraft.site.email = "atualizado@nexo.example.com";
  const db = new DatabaseSync(path.join(dataDir, "nexo.sqlite"));
  t.after(() => db.close());
  db.prepare("UPDATE content SET published = ?, draft = ? WHERE id = 1").run(
    JSON.stringify(published),
    JSON.stringify(legacyDraft),
  );
  const expected = copy(published);
  expected.selection.status = legacyDraft.selection.status;
  expected.selection.edition = legacyDraft.selection.edition;
  expected.site.email = legacyDraft.site.email;
  const current = await getState(app, headers);
  assert.deepEqual(current.draft, expected);
  assert.deepEqual(current.published, published);
  const preview = await app.inject({ url: "/api/admin/preview", headers });
  assert.deepEqual(preview.json().content, expected);
  assert.deepEqual(
    (await app.inject("/api/content")).json().content,
    published,
  );
  assert.deepEqual(
    JSON.parse(
      db.prepare("SELECT draft FROM content WHERE id = 1").get().draft,
    ),
    legacyDraft,
  );
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: current.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().published, expected);
  assert.deepEqual(response.json().draft, expected);
  assert.deepEqual((await app.inject("/api/content")).json().content, expected);
  assert.deepEqual(
    JSON.parse(
      db.prepare("SELECT draft FROM content WHERE id = 1").get().draft,
    ),
    legacyDraft,
  );
  assert.equal(response.json().history.length, original.history.length + 1);
  const secondDraft = copy(response.json().draft);
  secondDraft.site.email = "mais-atual@nexo.example.com";
  const saved = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: secondDraft, version: response.json().version },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().draft.site.name, published.site.name);
  assert.equal(
    saved.json().draft.sections[0].title,
    published.sections[0].title,
  );
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
  const { app, dataDir } = await fixture(t);
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
  const png = await sharp({
    create: { width: 3000, height: 1600, channels: 3, background: "#191f51" },
  })
    .png()
    .toBuffer();
  const truncated = Buffer.alloc(24);
  png.copy(truncated, 0, 0, 24);
  const corrupt = await upload(truncated);
  assert.equal(corrupt.statusCode, 400);
  assert.equal(corrupt.json().code, "INVALID_IMAGE");
  assert.equal(
    (await upload(png, "application/pdf", "bad.pdf")).statusCode,
    400,
  );
  const response = await upload(png);
  assert.equal(response.statusCode, 201, response.body);
  const asset = response.json().asset;
  assert.equal(asset.name, "capa.png");
  assert.match(asset.url, /^\/uploads\/[a-f0-9-]{36}\.webp$/);
  assert.equal(asset.type, "image/webp");
  assert.equal(asset.width, 2400);
  assert.equal(asset.height, 1280);
  assert.ok(asset.createdAt);
  assert.ok(asset.size < png.length);
  const served = await app.inject(asset.url);
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers["x-content-type-options"], "nosniff");
  assert.equal(served.rawPayload.length, asset.size);
  assert.equal((await sharp(served.rawPayload).metadata()).format, "webp");
  assert.deepEqual(
    readFileSync(path.join(dataDir, "originals", `${asset.id}.png`)),
    png,
  );
  assert.equal(
    (await app.inject(`/originals/${asset.id}.png`)).statusCode,
    404,
  );
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
  current.draft.selection.noticeUrl = asset.url;
  const wrongType = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: current.draft, version: current.version },
  });
  assert.equal(wrongType.statusCode, 400, wrongType.body);
  assert.equal(wrongType.json().code, "ASSET_TYPE_MISMATCH");
  current.draft.selection.noticeUrl = pdfResponse.json().asset.url;
  const saved = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content: current.draft, version: current.version },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  rmSync(
    path.join(dataDir, "uploads", path.basename(pdfResponse.json().asset.url)),
  );
  const missingOnPublish = await app.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: saved.json().version },
  });
  assert.equal(missingOnPublish.statusCode, 400, missingOnPublish.body);
  assert.equal(missingOnPublish.json().field, "selection.noticeUrl");
  assert.equal(missingOnPublish.json().code, "ASSET_NOT_FOUND");
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

test("incomplete stage and blank contact drafts are saved, publication names the required field", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  const content = copy(original.draft);
  content.selection.stages = [
    { id: "new-stage", title: "", date: "", description: "Em elaboração" },
  ];
  let response = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content, version: original.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  response = await app.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: response.json().version },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().field, "selection.stages.0.title");
  assert.equal(response.json().code, "FIELD_REQUIRED");
  assert.equal(response.json().error, "Informe o nome desta etapa.");
  assert.deepEqual(
    (await app.inject("/api/content")).json().content,
    original.published,
  );
  const current = await getState(app, headers);
  content.selection.stages = [];
  content.site.email = "";
  response = await app.inject({
    method: "PUT",
    url: "/api/admin/content",
    headers,
    payload: { content, version: current.version },
  });
  assert.equal(response.statusCode, 200, response.body);
  response = await app.inject({
    method: "POST",
    url: "/api/admin/publish",
    headers,
    payload: { version: response.json().version },
  });
  assert.equal(response.json().field, "site.email");
});

test("contact links must identify a matching Instagram profile and local documents must exist", async (t) => {
  const { app } = await fixture(t);
  const headers = await localLogin(app);
  const original = await getState(app, headers);
  for (const [field, value, errorCode] of [
    [
      "site.instagramUrl",
      "https://example.com/nexogovernamental/",
      "VALIDATION_ERROR",
    ],
    [
      "site.instagramUrl",
      "https://www.instagram.com/another-account/",
      "VALIDATION_ERROR",
    ],
    [
      "site.instagramUrl",
      "https://www.instagram.com/p/some-post/",
      "VALIDATION_ERROR",
    ],
    ["site.instagramHandle", "@invalid handle", "VALIDATION_ERROR"],
    ["selection.noticeUrl", "/uploads/missing-document.pdf", "ASSET_NOT_FOUND"],
    [
      "selection.noticeUrl",
      `${ORIGIN}/uploads/missing-document.pdf`,
      "ASSET_NOT_FOUND",
    ],
    ["selection.applicationUrl", "/uploads/form.pdf", "ASSET_TYPE_MISMATCH"],
  ]) {
    const content = copy(original.draft);
    const [group, key] = field.split(".");
    content[group][key] = value;
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/content",
      headers,
      payload: { content, version: original.version },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().field, field);
    assert.equal(response.json().code, errorCode);
  }
  assert.deepEqual(await getState(app, headers), original);
});

test("individual accounts enforce roles, revocation and password changes without losing bootstrap compatibility", async (t) => {
  const env = {
    NODE_ENV: "test",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "initial-private-password",
  };
  const { app, open, dataDir } = await fixture(t, env);
  const login = async (target, email, password) => {
    const response = await target.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: ORIGIN },
      payload: { email, password },
    });
    assert.equal(response.statusCode, 200, response.body);
    return {
      response,
      headers: {
        origin: ORIGIN,
        cookie: `${response.cookies[0].name}=${response.cookies[0].value}`,
        "x-csrf-token": response.json().csrfToken,
      },
    };
  };
  const admin = await login(app, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: admin.headers,
    payload: {
      name: "Editora Nexo",
      email: "editora@nexo.example.com",
      password: "individual-editor-password",
      role: "editor",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const editor = await login(
    app,
    "editora@nexo.example.com",
    "individual-editor-password",
  );
  assert.equal(editor.response.json().user.role, "editor");
  assert.equal(
    (await app.inject({ url: "/api/admin/users", headers: editor.headers }))
      .statusCode,
    403,
  );
  const current = await getState(app, editor.headers);
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/api/admin/content",
        headers: editor.headers,
        payload: { content: current.draft, version: current.version },
      })
    ).statusCode,
    200,
  );
  const self = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${admin.response.json().user.id}`,
    headers: admin.headers,
    payload: { active: false },
  });
  assert.equal(self.statusCode, 403);
  assert.equal(self.json().code, "SELF_DEACTIVATION");
  const deactivated = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${created.json().user.id}`,
    headers: admin.headers,
    payload: { active: false },
  });
  assert.equal(deactivated.statusCode, 200, deactivated.body);
  assert.equal(
    (await app.inject({ url: "/api/admin/content", headers: editor.headers }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin: ORIGIN },
        payload: {
          email: "editora@nexo.example.com",
          password: "individual-editor-password",
        },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${created.json().user.id}`,
        headers: admin.headers,
        payload: { active: true },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/api/admin/content", headers: editor.headers }))
      .statusCode,
    401,
  );
  const changed = await app.inject({
    method: "POST",
    url: "/api/admin/password",
    headers: admin.headers,
    payload: {
      currentPassword: env.ADMIN_PASSWORD,
      newPassword: "changed-private-password",
    },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().authenticated, true);
  assert.equal(
    (await app.inject({ url: "/api/admin/content", headers: admin.headers }))
      .statusCode,
    401,
  );
  await app.close();
  const restarted = await open();
  await login(restarted, env.ADMIN_EMAIL, "changed-private-password");
  const db = new DatabaseSync(path.join(dataDir, "nexo.sqlite"));
  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(env.ADMIN_EMAIL);
  assert.notEqual(user.password_hash, "changed-private-password");
  assert.equal(user.password_hash.length, 128);
  assert.equal(user.password_salt.length, 64);
  db.close();
});

test("successful logins do not consume failed-login budget and trusted proxy input is explicit", async (t) => {
  const env = {
    NODE_ENV: "test",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "a-long-private-passphrase",
  };
  const { app } = await fixture(t, env);
  for (let count = 0; count < 9; count++) {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: ORIGIN },
      payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    assert.equal(response.statusCode, 200, response.body);
  }
  for (const proxy of [
    "true",
    "*",
    "0.0.0.0/0",
    "::/0",
    "127.0.0.1/33",
    "127.0.0.1/nope",
  ])
    await assert.rejects(
      () =>
        buildApp({ env: { ...env, CMS_TRUST_PROXY: proxy }, logger: false }),
      /CMS_TRUST_PROXY/,
    );
});

test("trusted proxy separates client login limits while forwarded clients cannot use local preview", async (t) => {
  const env = {
    NODE_ENV: "test",
    CMS_LOCAL_PREVIEW: "1",
    CMS_TRUST_PROXY: "127.0.0.1/32",
    ADMIN_EMAIL: "admin@nexo.example.com",
    ADMIN_PASSWORD: "long-private-passphrase",
  };
  const { app } = await fixture(t, env);
  const attempt = (client) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      remoteAddress: "127.0.0.1",
      headers: { origin: ORIGIN, "x-forwarded-for": client },
      payload: { email: env.ADMIN_EMAIL, password: "incorrect" },
    });
  for (let count = 0; count < 8; count++)
    assert.equal((await attempt("192.0.2.10")).statusCode, 401);
  assert.equal((await attempt("192.0.2.10")).statusCode, 429);
  assert.equal((await attempt("192.0.2.11")).statusCode, 401);
  const forwardedPreview = await app.inject({
    method: "POST",
    url: "/api/local-session",
    remoteAddress: "127.0.0.1",
    headers: { origin: ORIGIN, "x-forwarded-for": "192.0.2.11" },
  });
  assert.equal(forwardedPreview.statusCode, 404);
  const preview = await localLogin(app);
  const adminId = (
    await app.inject({ url: "/api/admin/users", headers: preview })
  ).json().users[0].id;
  const lastAdmin = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${adminId}`,
    headers: preview,
    payload: { active: false },
  });
  assert.equal(lastAdmin.statusCode, 403);
  assert.equal(lastAdmin.json().code, "LAST_ADMIN");
});
