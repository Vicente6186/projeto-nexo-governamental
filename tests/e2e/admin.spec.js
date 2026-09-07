const { test: base, expect } = require("@playwright/test");
const path = require("node:path");
const { DEFAULT_CONTENT } = require("../../shared/content.cjs");

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
        "No uncaught JavaScript errors in the panel, public page or preview",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });

const originalAboutTitle = DEFAULT_CONTENT.sections.find(
  (section) => section.id === "about",
).title;
const previewFrame = (page) =>
  page.frameLocator('iframe[title="Prévia do site Nexo Governamental"]');
const sectionTitle = (content, id) =>
  content.sections.find((section) => section.id === id).title;
const dateFromToday = (offset) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + offset * 86400000),
  );

async function stateOf(page) {
  const response = await page.request.get("/api/admin/content");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function resetContent(page) {
  const sessionResponse = await page.request.get("/api/session");
  const session = await sessionResponse.json();
  if (!session.authenticated) return;
  const current = await stateOf(page);
  if (JSON.stringify(current.draft) === JSON.stringify(DEFAULT_CONTENT) && JSON.stringify(current.published) === JSON.stringify(DEFAULT_CONTENT)) return;
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin, "X-CSRF-Token": session.csrfToken };
  const save = await page.request.put("/api/admin/content", {
    headers,
    data: { content: DEFAULT_CONTENT, version: current.version },
  });
  expect(save.ok(), "Reset the isolated test draft").toBeTruthy();
  const saved = await save.json();
  const publish = await page.request.post("/api/admin/publish", {
    headers,
    data: { version: saved.version },
  });
  expect(publish.ok(), "Reset the isolated test publication").toBeTruthy();
}

async function login(page) {
  await page.goto("/admin/");
  await expect(
    page.getByRole("heading", { name: "Bem-vindo ao Nexo Studio." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Entrar na prévia local", exact: true })
    .click();
  await expect(page.locator("#workspace-main h1")).toContainText("Seu espaço.");
  await resetContent(page);
  await page.reload();
  await expect(page.locator("#workspace-main h1")).toContainText("Seu espaço.");
}

async function saveDraft(page) {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/content") &&
      response.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .first()
    .click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo.");
}

async function publish(page) {
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "prévia local neste computador",
  );
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/publish") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirmar publicação", exact: true })
    .click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function publicPage(context) {
  const visitor = await context.newPage();
  await visitor.goto("/");
  // The CMS updates after HTML loads; this waits for its actual response.
  await expect
    .poll(async () =>
      visitor.evaluate(() =>
        Boolean(document.querySelector(".cms-selection-status")),
      ),
    )
    .toBe(true);
  return visitor;
}

async function openPreview(page) {
  await page
    .getByRole("button", { name: "Pré-visualizar", exact: true })
    .click();
  await expect(previewFrame(page).locator(".cms-preview-banner")).toContainText(
    "ainda não publicado",
  );
  return previewFrame(page);
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.resolve("artifacts/admin-qa", `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
});

test.afterEach(async ({ page }) => {
  if (!page.isClosed() && page.url().startsWith("http://127.0.0.1:3101"))
    await resetContent(page);
});

test("draft editing persists, authenticated preview changes first, and publication updates visitors", async ({
  page,
  context,
}) => {
  await login(page);
  await screenshot(page, "desktop-overview");
  await page
    .getByRole("link", { name: "Conteúdo do site", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Editar Quem Somos", exact: true })
    .click();
  await page
    .getByLabel("Título da seção", { exact: true })
    .fill("Uma comunidade que conecta");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Texto editorial de teste salvo no ambiente isolado.");
  await saveDraft(page);

  const visitor = await publicPage(context);
  await expect(visitor.locator("#about-title")).toHaveText(originalAboutTitle);
  const preview = await openPreview(page);
  await expect(preview.locator("#about-title")).toHaveText(
    "Uma comunidade que conecta",
  );
  await expect(preview.locator("#about-description")).toHaveText(
    "Texto editorial de teste salvo no ambiente isolado.",
  );
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  await page.reload();
  await expect(page.getByLabel("Título da seção", { exact: true })).toHaveValue(
    "Uma comunidade que conecta",
  );
  await screenshot(page, "desktop-content-editor");
  await publish(page);
  await visitor.reload();
  await expect(visitor.locator("#about-title")).toHaveText(
    "Uma comunidade que conecta",
  );
  await expect(visitor.locator(".cms-preview-banner")).toHaveCount(0);
  const persisted = await stateOf(page);
  expect(sectionTitle(persisted.draft, "about")).toBe(
    "Uma comunidade que conecta",
  );
  expect(sectionTitle(persisted.published, "about")).toBe(
    "Uma comunidade que conecta",
  );
  await visitor.close();
});

test("selection editor publishes status, dates, links and structured stages to the public page", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await screenshot(page, "desktop-selection-original");
  await page
    .getByRole("button", { name: /Inscrições abertas Receba novos talentos/ })
    .click();
  await page
    .getByLabel("Edição do processo", { exact: true })
    .fill("Edição de teste local");
  await page
    .getByLabel("Título do convite", { exact: true })
    .fill("Faça parte desta próxima etapa");
  await page
    .getByLabel("Descrição e orientações", { exact: true })
    .fill("Informações de teste para os candidatos.");
  await page
    .getByLabel("Abertura das inscrições", { exact: true })
    .fill(dateFromToday(-1));
  await page
    .getByLabel("Encerramento das inscrições", { exact: true })
    .fill(dateFromToday(7));
  await page.getByRole("tab", { name: "Cronograma", exact: true }).click();
  await page
    .getByLabel("Título do cronograma", { exact: true })
    .fill("Etapas da seleção");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page
    .getByLabel("Nome da etapa 1", { exact: true })
    .fill("Envio de inscrições");
  await page
    .getByLabel("Data da etapa 1", { exact: true })
    .fill(dateFromToday(3));
  await page
    .getByLabel("Orientações da etapa 1", { exact: true })
    .fill("Preencha o formulário de teste.");
  await page
    .getByRole("tab", { name: "Links e documentos", exact: true })
    .click();
  await page
    .getByLabel("Link do formulário de inscrição", { exact: true })
    .fill("https://example.org/inscricoes");
  await page
    .getByLabel("Texto do botão de inscrição", { exact: true })
    .fill("Quero participar");
  await saveDraft(page);
  await page
    .getByRole("tab", { name: "Informações gerais", exact: true })
    .click();
  await screenshot(page, "desktop-selection-editor");
  await publish(page);

  const visitor = await publicPage(context);
  await expect(visitor.locator(".cms-selection-status")).toHaveText(
    "Inscrições abertas",
  );
  await expect(visitor.locator("#selective-process-content h2")).toHaveText(
    "Faça parte desta próxima etapa",
  );
  await expect(visitor.locator(".cms-selection-edition")).toHaveText(
    "Edição de teste local",
  );
  await expect(visitor.locator(".cms-application-button")).toHaveAttribute(
    "href",
    "https://example.org/inscricoes",
  );
  await expect(visitor.locator(".cms-application-button")).toHaveText(
    "Quero participar",
  );
  await expect(visitor.locator(".cms-application-button")).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(visitor.locator(".cms-selection-stages h4")).toHaveText(
    "Envio de inscrições",
  );
  await expect(visitor.locator(".cms-selection-stages p")).toHaveText(
    "Preencha o formulário de teste.",
  );
  await expect(
    visitor.locator("#selective-process-schedule > img"),
  ).toBeHidden();
  const published = (await stateOf(page)).published.selection;
  expect(published.opensAt).toBe(dateFromToday(-1));
  expect(published.closesAt).toBe(dateFromToday(7));
  expect(published.stages).toHaveLength(1);
  await visitor.close();
});

test("a real PNG upload can be inspected and selected for a project in the saved preview", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Biblioteca de mídia", exact: true })
    .click();
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/uploads") &&
      response.request().method() === "POST",
  );
  await page
    .getByLabel("Selecionar arquivos para upload", { exact: true })
    .setInputFiles(path.resolve("src/assets/favicons/favicon-32x32.png"));
  const uploaded = await uploadResponse;
  expect(uploaded.ok()).toBeTruthy();
  const { asset } = await uploaded.json();
  expect(asset.url).toMatch(/^\/uploads\/.+\.png$/);
  const assetCard = page
    .locator(".media-card")
    .filter({ has: page.locator("strong", { hasText: "favicon-32x32.png" }) })
    .last();
  await expect(assetCard).toBeVisible();
  await assetCard.click();
  await expect(
    page.getByLabel("Endereço do arquivo", { exact: true }),
  ).toHaveValue(asset.url);
  await expect
    .poll(() =>
      page
        .locator(".asset-modal-image")
        .evaluate((image) => image.complete && image.naturalWidth),
    )
    .toBe(32);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await screenshot(page, "desktop-media-library");

  await page
    .getByRole("link", { name: "Conteúdo do site", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Editar Veja Mais", exact: true })
    .click();
  await page.getByRole("tab", { name: "Projetos", exact: true }).click();
  const project = page.locator(".item-editor").first();
  await project.locator("summary").click();
  await project
    .getByRole("button", { name: "Escolher na biblioteca", exact: false })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "favicon-32x32.png", exact: true })
    .last()
    .click();
  await expect(
    project.getByLabel("Imagem do item", { exact: true }),
  ).toHaveValue(asset.url);
  await project
    .getByLabel("Descrição da imagem (acessibilidade)", { exact: true })
    .fill("Imagem de teste local");
  await saveDraft(page);
  const preview = await openPreview(page);
  await expect(
    preview.locator(".more-project").first().locator("img"),
  ).toHaveAttribute("src", asset.url);
  await expect(
    preview.locator(".more-project").first().locator("img"),
  ).toHaveAttribute("alt", "Imagem de teste local");
  await expect
    .poll(() =>
      preview
        .locator(".more-project")
        .first()
        .locator("img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect
    .poll(() =>
      preview
        .locator(".more-project")
        .first()
        .locator("img")
        .evaluate((image) => new URL(image.currentSrc).pathname),
    )
    .toBe(asset.url);
  await expect(
    preview.locator(".more-project").first().locator("source"),
  ).toHaveCount(0);
});

test("restoring a historical version recovers the draft while leaving the publication unchanged", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Conteúdo do site", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Editar Quem Somos", exact: true })
    .click();
  await page
    .getByLabel("Título da seção", { exact: true })
    .fill("Primeira versão para recuperar");
  await saveDraft(page);
  const firstVersionId = (await stateOf(page)).history[0].id;
  await page
    .getByLabel("Título da seção", { exact: true })
    .fill("Segunda versão publicada");
  await saveDraft(page);
  await publish(page);
  const beforeRestore = await stateOf(page);
  const index = beforeRestore.history.findIndex(
    (entry) => entry.id === firstVersionId,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  await page
    .getByRole("link", { name: "Histórico de versões", exact: true })
    .click();
  await page
    .locator(".history-row")
    .nth(index)
    .getByRole("button", { name: "Restaurar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restaurar como rascunho", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const restored = await stateOf(page);
  expect(sectionTitle(restored.draft, "about")).toBe(
    "Primeira versão para recuperar",
  );
  expect(sectionTitle(restored.published, "about")).toBe(
    "Segunda versão publicada",
  );
  await screenshot(page, "desktop-version-history");
  const visitor = await publicPage(context);
  await expect(visitor.locator("#about-title")).toHaveText(
    "Segunda versão publicada",
  );
  await page
    .getByRole("link", { name: "Conteúdo do site", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Editar Quem Somos", exact: true })
    .click();
  await expect(page.getByLabel("Título da seção", { exact: true })).toHaveValue(
    "Primeira versão para recuperar",
  );
  const preview = await openPreview(page);
  await expect(preview.locator("#about-title")).toHaveText(
    "Primeira versão para recuperar",
  );
  await visitor.close();
});

test("mobile navigation works at 390px and principal pages fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const pages = [
    ["Visão geral", "inicio", "mobile-overview"],
    ["Conteúdo do site", "conteudo", "mobile-content"],
    ["Processo seletivo", "processo", "mobile-selection"],
    ["Biblioteca de mídia", "midia", "mobile-media"],
  ];
  for (const [label, route, file] of pages) {
    if (route !== "inicio") {
      await page
        .getByRole("button", { name: "Abrir navegação", exact: true })
        .click();
      await expect(page.locator(".sidebar")).toHaveClass(/sidebar-open/);
      await page
        .getByRole("navigation", { name: "Menu principal" })
        .getByRole("link", { name: label, exact: false })
        .click();
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar-open/);
    }
    await expect(page.locator("#workspace-main h1")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        })),
      )
      .toEqual({ documentWidth: 390, viewport: 390 });
    const main = await page.locator("#workspace-main").boundingBox();
    expect(main.x).toBeGreaterThanOrEqual(0);
    expect(main.x + main.width).toBeLessThanOrEqual(391);
    await screenshot(page, file);
  }
});

test("gallery fields and a new schedule row remain usable on desktop and mobile", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Conteúdo do site", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Editar Reconhecimento", exact: true })
    .click();
  await page.getByRole("tab", { name: "Galeria", exact: true }).click();
  const item = page.locator(".item-editor").first();
  await item.locator("summary").click();
  await expect(item.getByLabel("Título do item", { exact: true })).toHaveValue(
    DEFAULT_CONTENT.sections.find((section) => section.id === "recognize")
      .items[0].title,
  );
  await expect(
    item.getByLabel("Descrição da imagem (acessibilidade)", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await screenshot(page, "desktop-gallery-editor");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    item.getByLabel("Imagem do item", { exact: true }),
  ).toBeVisible();
  await screenshot(page, "mobile-gallery-editor");
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Menu principal" })
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await page.getByRole("tab", { name: "Cronograma", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await expect(page.getByLabel("Nome da etapa 1", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Data da etapa 1", { exact: true })).toHaveValue(
    "",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await screenshot(page, "mobile-empty-stage");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await screenshot(page, "desktop-empty-stage");
});
