const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { emptyPost, CATEGORIES } = require("../../shared/blog.cjs");
const { loginPreview } = require("./auth.cjs");

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
test.setTimeout(60_000);
const artifacts = path.resolve(__dirname, "../../artifacts/admin-qa");

async function mutate(page, route, data, method = "POST") {
  const session = await (await page.request.get("/api/session")).json();
  const response = await page.request.fetch(route, {
    method,
    headers: {
      Origin: new URL(page.url()).origin,
      "X-CSRF-Token": session.csrfToken,
    },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function article(page, extra = {}) {
  const { post } = await mutate(page, "/api/admin/blog", {
    post: {
      ...emptyPost(),
      title: "Conhecimento que aproxima pessoas",
      excerpt:
        "Uma reflexão editorial sobre universidade, participação e vida pública.",
      author: "Equipe Nexo",
      category: CATEGORIES[0],
      slug: `premium-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      body: "## Ideias em diálogo\n\nUm conteúdo fictício para verificar a experiência editorial em ambiente isolado.",
      ...extra,
    },
  });
  await page.goto(`/admin/#blog/${post.id}`);
  await expect(
    page.getByRole("heading", { name: "Dados do artigo", exact: true }),
  ).toBeVisible();
  return post;
}
async function step(page, name) {
  await page
    .getByRole("navigation", { name: "Etapas do artigo", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function review(page) {
  await step(page, "Revisão");
  await page
    .getByRole("button", { name: "Publicar artigo", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Publicar este artigo?",
    exact: true,
  });
}
const successDialog = (page) =>
  page.getByRole("dialog", { name: "Publicado na prévia local!", exact: true });

test("publication celebrates only a confirmed response, keeps focus, and blocks background shortcuts", async ({
  page,
}) => {
  await loginPreview(page);
  const post = await article(page);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/admin/blog/${post.id}/publish`, async (route) => {
    calls += 1;
    if (calls === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Publicação indisponível. Tente novamente.",
        }),
      });
    await gate;
    await route.continue();
  });
  const confirm = await review(page);
  await confirm
    .getByRole("button", { name: "Confirmar publicação", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Publicação indisponível",
  );
  await expect(successDialog(page)).toHaveCount(0);
  const unpublished = await (
    await page.request.get(`/api/admin/blog/${post.id}`)
  ).json();
  expect(unpublished.post.published).toBeNull();
  await page.keyboard.press("Escape");
  await review(page);
  await expect(confirm.getByRole("alert")).toHaveCount(0);
  await confirm
    .getByRole("button", { name: "Confirmar publicação", exact: true })
    .click();
  await expect(
    confirm.getByRole("button", { name: "Publicando…", exact: true }),
  ).toBeDisabled();
  await expect(successDialog(page)).toHaveCount(0);
  release();
  const success = successDialog(page);
  await expect(success).toBeVisible();
  expect(calls).toBe(2);
  await expect(success).toContainText(post.draft.title);
  await expect(
    success.getByRole("link", { name: "Ver publicação", exact: true }),
  ).toHaveAttribute("href", `/blog/${post.draft.slug}`);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(
    page.getByRole("dialog", { name: "Buscar no painel" }),
  ).toHaveCount(0);
  await expect(success).not.toHaveAttribute("inert", "");
  for (let i = 0; i < 7; i += 1) {
    await page.keyboard.press("Tab");
    expect(
      await success.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: path.join(artifacts, "premium-success-desktop.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(success).toHaveCount(0);
  await expect(page.locator("#blog-step-title")).toBeFocused();
});

test("mobile success respects reduced motion and clipboard failure, then clears on route change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Unavailable")) },
    }),
  );
  await loginPreview(page);
  const post = await article(page);
  const confirm = await review(page);
  await confirm
    .getByRole("button", { name: "Confirmar publicação", exact: true })
    .click();
  const success = successDialog(page);
  await expect(success).toBeVisible();
  await success
    .getByRole("button", { name: "Copiar link local", exact: true })
    .click();
  await expect(success.getByRole("textbox")).toHaveValue(
    `${new URL(page.url()).origin}/blog/${post.draft.slug}`,
  );
  await expect(
    success.getByRole("button", { name: "Link copiado", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const close = await success
    .getByRole("button", { name: "Fechar janela", exact: true })
    .boundingBox();
  expect(close.x).toBeGreaterThan(220);
  expect(close.y).toBeLessThan(50);
  await page.screenshot({
    path: path.join(artifacts, "premium-success-mobile.png"),
  });
  await page.evaluate(() => {
    window.location.hash = "blog";
  });
  await expect(success).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Blog do Nexo", exact: true }),
  ).toBeVisible();
});

test("editor focus preserves the document and optional cover completion reflects an explicit skip", async ({
  page,
}) => {
  await loginPreview(page);
  const post = await article(page, {
    body: Array.from(
      { length: 35 },
      (_, i) =>
        `Parágrafo ${i + 1}: ideias que aproximam a universidade da sociedade.`,
    ).join("\n\n"),
  });
  const nav = page.getByRole("navigation", {
    name: "Etapas do artigo",
    exact: true,
  });
  await expect(
    nav.getByRole("button", { name: "Informações", exact: true }),
  ).toHaveAttribute("data-complete", "true");
  await page.getByLabel("Título do artigo", { exact: true }).fill("");
  await expect(
    nav.getByRole("button", { name: "Informações", exact: true }),
  ).not.toHaveAttribute("data-complete", "true");
  await page
    .getByLabel("Título do artigo", { exact: true })
    .fill(post.draft.title);
  await step(page, "Texto");
  await page.getByRole("button", { name: "Modo foco", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  const editor = page.locator(".richtext-document");
  await expect(editor).toContainText("Parágrafo 35");
  await editor.locator("p").nth(12).scrollIntoViewIfNeeded();
  const toolbar = await page
    .getByRole("toolbar", { name: "Formatação do artigo" })
    .boundingBox();
  expect(toolbar.y).toBeGreaterThanOrEqual(0);
  expect(toolbar.y).toBeLessThan(180);
  await page.screenshot({
    path: path.join(artifacts, "premium-focus-desktop.png"),
  });
  await page
    .getByRole("button", { name: "Sair do modo foco", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await step(page, "Capa");
  await page.getByRole("button", { name: /Continuar sem capa/ }).click();
  await expect(
    nav.getByRole("button", { name: "Capa", exact: true }),
  ).toHaveAttribute("data-complete", "true");
});

test("empty category filters explain the result and can be cleared", async ({
  page,
}) => {
  await loginPreview(page);
  await article(page);
  const name = `Categoria vazia ${Date.now()}`;
  await mutate(page, "/api/admin/blog-categories", { name });
  await page.goto("/admin/#blog");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: name });
  await expect(
    page.getByRole("heading", { name: "Nenhum artigo encontrado" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Nenhum artigo corresponde a esta categoria e aos filtros selecionados.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .first()
    .click();
  await expect(page.locator(".blog-post-row").first()).toBeVisible();
});

test("a collapsed invalid selection stage stays open while it is corrected", async ({
  page,
}) => {
  await loginPreview(page);
  const state = await (await page.request.get("/api/admin/content")).json();
  const content = structuredClone(state.draft);
  content.selection.status = "closed";
  content.selection.stages = [
    { id: "premium-stage", title: "", date: "", description: "" },
  ];
  try {
    await mutate(
      page,
      "/api/admin/content",
      { content, version: state.version },
      "PUT",
    );
    await page.goto("/admin/#processo");
    await page.reload();
    await page
      .getByRole("navigation", { name: "Etapas do processo seletivo" })
      .getByRole("button", { name: "Cronograma", exact: true })
      .click();
    const collapse = page.locator(".stage-collapse-toggle");
    await collapse.click();
    await expect(
      page.getByLabel("Nome da etapa 1", { exact: true }),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "Revisar publicação", exact: true })
      .click();
    const field = page.getByLabel("Nome da etapa 1", { exact: true });
    await expect(field).toBeFocused();
    await field.pressSequentially("Entrevistas");
    await expect(field).toBeVisible();
    await expect(field).toHaveValue("Entrevistas");
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
  } finally {
    // Unmount the editor and cancel its pending autosave before restoring the fixture.
    await page.close();
    const latest = await (await page.request.get("/api/admin/content")).json();
    await mutate(
      page,
      "/api/admin/content",
      { content: state.draft, version: latest.version },
      "PUT",
    );
  }
});
