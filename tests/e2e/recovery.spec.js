const { test: base, expect } = require("@playwright/test");
const { loginPreview } = require("./auth.cjs");
const { emptyPost } = require("../../shared/blog.cjs");

const test = base.extend({
  verifyJavaScript: [
    async ({ context }, use) => {
      const errors = [];
      const observe = (page) =>
        page.on("pageerror", (error) => errors.push(error.message));
      context.pages().forEach(observe);
      context.on("page", observe);
      await use();
      expect(
        errors,
        "Recovery flows must not throw uncaught JavaScript errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
let baseline;

async function stateOf(page) {
  const response = await page.request.get("/api/admin/content");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function saveRemote(page, content, version) {
  const session = await (await page.request.get("/api/session")).json();
  const response = await page.request.put("/api/admin/content", {
    headers: {
      Origin: new URL(page.url()).origin,
      "X-CSRF-Token": session.csrfToken,
    },
    data: { content, version },
  });
  expect(
    response.ok(),
    "Save an independent edit to the isolated test database",
  ).toBeTruthy();
  return response.json();
}

async function storeLocalCopy(page, value, version, originalBase) {
  const session = await (await page.request.get("/api/session")).json();
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(
        `nexo-recovery:v1:${encodeURIComponent(key)}`,
        JSON.stringify(saved),
      );
    },
    {
      key: `site:${session.user.id}`,
      saved: {
        value,
        version,
        savedAt: new Date().toISOString(),
        ...(originalBase ? { base: originalBase } : {}),
      },
    },
  );
  await page.goto("/admin/#contato");
  // A hash-only navigation can reuse the current Workspace. A fresh document
  // must read both the older browser copy and the latest server version.
  await page.reload();
  await expect(
    page.getByText("Encontramos uma edição não salva neste navegador.", {
      exact: true,
    }),
  ).toBeVisible();
}

async function recoverAndReview(page) {
  await page
    .getByRole("button", { name: "Recuperar edição", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Revisar alterações da equipe",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Consultando" }),
  ).toHaveCount(0);
  return dialog;
}

async function waitForSaved(page) {
  await expect(page.getByTestId("site-save-state")).toContainText(
    "Rascunho salvo",
  );
}

test.beforeEach(async ({ page }) => {
  await loginPreview(page);
  baseline = await stateOf(page);
});

test.afterEach(async ({ page }) => {
  if (page.isClosed() || !baseline) return;
  const session = await (await page.request.get("/api/session")).json();
  if (!session.authenticated) {
    const renew = await page.request.post("/api/local-session", {
      headers: { Origin: new URL(page.url()).origin },
      data: {},
    });
    expect(renew.ok()).toBeTruthy();
  }
  const current = await stateOf(page);
  expect(
    current.published,
    "Recovery only changes drafts, never the public site",
  ).toEqual(baseline.published);
  if (JSON.stringify(current.draft) !== JSON.stringify(baseline.draft)) {
    await saveRemote(page, baseline.draft, current.version);
  }
});

test("an obsolete local copy with a base merges independent fields and requires an explicit conflict choice", async ({
  page,
}) => {
  const local = structuredClone(baseline.draft);
  local.site.email = "copia-local@nexo.example";
  local.selection.edition = "Edição recuperada com base";
  const remote = structuredClone(baseline.draft);
  remote.site.email = "equipe-atual@nexo.example";
  remote.selection.applicationUrl = "https://example.org/formulario-da-equipe";
  await saveRemote(page, remote, baseline.version);
  await storeLocalCopy(page, local, baseline.version, baseline.draft);

  const dialog = await recoverAndReview(page);
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  const email = dialog.getByRole("group", {
    name: "E-mail de contato",
    exact: true,
  });
  await expect(
    email.getByRole("radio", { name: "Minha edição", exact: true }),
  ).not.toBeChecked();
  await expect(
    email.getByRole("radio", { name: "Versão da equipe", exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "Aplicar escolhas", exact: true }),
  ).toBeDisabled();
  await email.getByRole("radio", { name: "Minha edição", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Aplicar escolhas", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByLabel("E-mail de contato", { exact: true }),
  ).toHaveValue(local.site.email);
  await waitForSaved(page);
  const saved = await stateOf(page);
  expect(saved.draft.site.email).toBe(local.site.email);
  expect(saved.draft.selection.edition).toBe(local.selection.edition);
  expect(saved.draft.selection.applicationUrl).toBe(
    remote.selection.applicationUrl,
  );
});

test("an older copy without a base asks about every differing field and cannot restore protected institutional text", async ({
  page,
}) => {
  const local = structuredClone(baseline.draft);
  local.site.email = "copia-antiga@nexo.example";
  local.sections[0].title =
    "Texto institucional obsoleto que deve permanecer protegido";
  const remote = structuredClone(baseline.draft);
  remote.selection.applicationUrl = "https://example.org/formulario-atualizado";
  await saveRemote(page, remote, baseline.version);
  await storeLocalCopy(page, local, baseline.version);

  const dialog = await recoverAndReview(page);
  await expect(dialog.getByRole("radio")).toHaveCount(4);
  const email = dialog.getByRole("group", {
    name: "E-mail de contato",
    exact: true,
  });
  const application = dialog.getByRole("group", {
    name: "Formulário de inscrição",
    exact: true,
  });
  await email.getByRole("radio", { name: "Minha edição", exact: true }).check();
  await expect(
    dialog.getByRole("button", { name: "Aplicar escolhas", exact: true }),
  ).toBeDisabled();
  await application
    .getByRole("radio", { name: "Versão da equipe", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Aplicar escolhas", exact: true })
    .click();
  await waitForSaved(page);
  const saved = await stateOf(page);
  expect(saved.draft.site.email).toBe(local.site.email);
  expect(saved.draft.selection.applicationUrl).toBe(
    remote.selection.applicationUrl,
  );
  expect(saved.draft.sections).toEqual(baseline.draft.sections);
});

test("two editors can reconcile a concurrent save while retaining the team's independent contact update", async ({
  page,
  context,
}) => {
  const teammate = await context.newPage();
  try {
    await page.getByRole("link", { name: "Contato", exact: true }).click();
    await teammate.goto("/admin/#contato");
    await expect(
      teammate.getByLabel("E-mail de contato", { exact: true }),
    ).toHaveValue(baseline.draft.site.email);
    await teammate
      .getByLabel("E-mail de contato", { exact: true })
      .fill("equipe-concorrente@nexo.example");
    await teammate
      .getByLabel("Perfil do Instagram", { exact: true })
      .fill("@nexo_equipe_teste");
    await waitForSaved(teammate);

    await page
      .getByLabel("E-mail de contato", { exact: true })
      .fill("minha-escolha@nexo.example");
    const dialog = page.getByRole("dialog", {
      name: "Revisar alterações da equipe",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const email = dialog.getByRole("group", {
      name: "E-mail de contato",
      exact: true,
    });
    await expect(email).toContainText("equipe-concorrente@nexo.example");
    await expect(email).toContainText("minha-escolha@nexo.example");
    await email
      .getByRole("radio", { name: "Minha edição", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Aplicar escolhas", exact: true })
      .click();
    await waitForSaved(page);
    const saved = await stateOf(page);
    expect(saved.draft.site.email).toBe("minha-escolha@nexo.example");
    expect(saved.draft.site.instagramHandle).toBe("@nexo_equipe_teste");
    expect(saved.draft.site.instagramUrl).toBe(
      "https://www.instagram.com/nexo_equipe_teste/",
    );
  } finally {
    await teammate.close();
  }
});

test("a missing session can be renewed in place after a failed attempt without losing the pending edit", async ({
  page,
  context,
}) => {
  await page.getByRole("link", { name: "Contato", exact: true }).click();
  await context.clearCookies();
  const emailField = page.getByLabel("E-mail de contato", { exact: true });
  await emailField.fill("edicao-preservada@nexo.example");
  const dialog = page.getByRole("dialog", {
    name: "Entre novamente para continuar",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(emailField).toHaveValue("edicao-preservada@nexo.example");
  await page.route(
    "**/api/local-session",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Conexão temporariamente indisponível. Tente novamente.",
        }),
      }),
    { times: 1 },
  );
  await dialog
    .getByRole("button", { name: "Continuar na prévia local", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Conexão temporariamente indisponível",
  );
  await expect(emailField).toHaveValue("edicao-preservada@nexo.example");
  await dialog
    .getByRole("button", { name: "Continuar na prévia local", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(emailField).toHaveValue("edicao-preservada@nexo.example");
  await waitForSaved(page);
  const saved = await stateOf(page);
  expect(saved.draft.site.email).toBe("edicao-preservada@nexo.example");
  await page.reload();
  await expect(emailField).toHaveValue("edicao-preservada@nexo.example");
  await expect(
    page.getByText("Encontramos uma edição não salva neste navegador.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("an obsolete article copy requires a choice while preserving independent edits and the published article", async ({
  page,
}) => {
  async function mutate(route, data, method = "POST") {
    const session = await (await page.request.get("/api/session")).json();
    const response = await page.request.fetch(route, {
      method,
      headers: {
        Origin: new URL(page.url()).origin,
        "X-CSRF-Token": session.csrfToken,
      },
      data,
    });
    expect(
      response.ok(),
      `${method} ${route}: ${await response.text()}`,
    ).toBeTruthy();
    return response.json();
  }
  async function readPost(id) {
    const response = await page.request.get(`/api/admin/blog/${id}`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).post;
  }
  const content = {
    ...emptyPost(),
    title: "Universidade e debate público: artigo publicado de teste",
    slug: `qa-recovery-blog-${Date.now()}`,
    excerpt:
      "Este artigo verifica a recuperação de uma edição antiga com preservação da publicação original.",
    body: "## Universidade e sociedade\n\nUm artigo criado exclusivamente no banco temporário de testes para verificar a preservação do trabalho editorial.",
  };
  const { post: created } = await mutate("/api/admin/blog", { post: content });
  try {
    const { post: published } = await mutate(
      `/api/admin/blog/${created.id}/publish`,
      { version: created.version },
    );
    const local = structuredClone(published.draft);
    local.title = "Título recuperado da cópia local";
    local.excerpt =
      "Resumo presente apenas na edição local, que deve continuar no rascunho depois da revisão.";
    local.slug = "endereco-obsoleto-da-copia-local";
    const remote = structuredClone(published.draft);
    remote.title = "Título atualizado pela equipe";
    remote.authorRole = "Descrição atualizada pela equipe no servidor";
    await mutate(
      `/api/admin/blog/${created.id}`,
      { post: remote, version: published.version },
      "PUT",
    );
    const session = await (await page.request.get("/api/session")).json();
    await page.evaluate(
      ({ key, saved }) => {
        localStorage.setItem(
          `nexo-recovery:v1:${encodeURIComponent(key)}`,
          JSON.stringify(saved),
        );
      },
      {
        key: `blog:${session.user.id}:${created.id}`,
        saved: {
          value: local,
          base: published.draft,
          version: published.version,
          savedAt: new Date().toISOString(),
        },
      },
    );
    await page.goto(`/admin/#blog/${created.id}`);
    await page.reload();
    await expect(
      page.getByText("Encontramos uma edição neste navegador.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Recuperar edição", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Revisar edição recuperada",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const title = dialog.getByRole("group", { name: "Título", exact: true });
    const mine = title.getByRole("radio", {
      name: /^Sua cópia neste navegador/,
    });
    const theirs = title.getByRole("radio", { name: /^Última versão salva/ });
    await expect(mine).not.toBeChecked();
    await expect(theirs).not.toBeChecked();
    await expect(
      dialog.getByRole("button", {
        name: "Aplicar edição revisada",
        exact: true,
      }),
    ).toBeDisabled();
    await mine.check();
    await dialog
      .getByRole("button", { name: "Aplicar edição revisada", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByLabel("Título do artigo", { exact: true }),
    ).toHaveValue(local.title);
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await expect(page.locator(".blog-save-status")).toContainText(
      "Rascunho salvo",
    );
    const saved = await readPost(created.id);
    expect(saved.draft.title).toBe(local.title);
    expect(saved.draft.excerpt).toBe(local.excerpt);
    expect(saved.draft.authorRole).toBe(remote.authorRole);
    expect(saved.draft.slug).toBe(published.published.slug);
    expect(saved.published).toEqual(published.published);
    const visitor = await page.request.get(`/blog/${published.published.slug}`);
    expect(visitor.status()).toBe(200);
    const html = await visitor.text();
    expect(html).toContain(published.published.title);
    expect(html).not.toContain(local.title);
    expect(html).not.toContain(remote.title);
  } finally {
    const current = await readPost(created.id);
    if (!current.archived)
      await mutate(`/api/admin/blog/${created.id}/archive`, {
        version: current.version,
      });
  }
});
