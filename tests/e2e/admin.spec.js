const { test: base, expect } = require("@playwright/test");
const path = require("node:path");
const { DEFAULT_CONTENT } = require("../../shared/content.cjs");
const { loginPreview } = require("./auth.cjs");

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
const dateFromToday = (offset) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + offset * 86400000),
  );

async function selectionStep(page, name) {
  await page
    .getByRole("navigation", { name: "Etapas do processo seletivo" })
    .getByRole("button", { name, exact: true })
    .click();
}

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
  // Fixed presentation values come from the current publication. In particular,
  // replacing the old schedule image with text stages is intentionally permanent.
  const restored = structuredClone(current.published);
  const contactKeys = ["email", "instagramUrl", "instagramHandle"];
  const selectionKeys = [
    "edition",
    "status",
    "opensAt",
    "closesAt",
    "noticeUrl",
    "applicationUrl",
    "stages",
  ];
  for (const key of contactKeys)
    restored.site[key] = structuredClone(DEFAULT_CONTENT.site[key]);
  for (const key of selectionKeys)
    restored.selection[key] = structuredClone(DEFAULT_CONTENT.selection[key]);
  if (
    JSON.stringify(current.draft) === JSON.stringify(restored) &&
    JSON.stringify(current.published) === JSON.stringify(restored)
  )
    return;
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin, "X-CSRF-Token": session.csrfToken };
  const save = await page.request.put("/api/admin/content", {
    headers,
    data: { content: restored, version: current.version },
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
  await loginPreview(page);
  await resetContent(page);
  await page.reload();
  await expect(page.locator("#workspace-main h1")).toHaveText("Visão geral");
}

async function saveDraft(page) {
  await expect(page.getByTestId("site-save-state")).toContainText(
    "Rascunho salvo",
  );
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

test("contact changes persist as drafts, appear in private preview, and reach visitors only after publication", async ({
  page,
  context,
}) => {
  await login(page);
  await screenshot(page, "desktop-overview");
  await page.getByRole("link", { name: "Contato", exact: true }).click();
  await page
    .getByLabel("E-mail de contato", { exact: true })
    .fill("contato-teste@example.org");
  await page
    .getByLabel("Perfil do Instagram", { exact: true })
    .fill("@nexo_teste");
  await expect(
    page.getByLabel("Nome de usuário no Instagram", { exact: true }),
  ).toHaveCount(0);
  await saveDraft(page);

  const visitor = await publicPage(context);
  await expect(visitor.locator(".contact-address a")).toHaveText(
    DEFAULT_CONTENT.site.email,
  );
  const preview = await openPreview(page);
  await expect(preview.locator(".contact-address a")).toHaveText(
    "contato-teste@example.org",
  );
  await expect(preview.locator(".instagram-profile")).toHaveAttribute(
    "href",
    "https://www.instagram.com/nexo_teste/",
  );
  await expect(preview.locator("#about-title")).toHaveText(originalAboutTitle);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  await page.reload();
  await expect(
    page.getByLabel("E-mail de contato", { exact: true }),
  ).toHaveValue("contato-teste@example.org");
  await screenshot(page, "desktop-contact-editor");
  await publish(page);
  await visitor.reload();
  await expect(visitor.locator(".contact-address a")).toHaveAttribute(
    "href",
    "mailto:contato-teste@example.org",
  );
  await expect(visitor.locator("#contact-form")).toHaveAttribute(
    "data-recipient",
    "contato-teste@example.org",
  );
  await expect(visitor.locator(".instagram-profile-handle")).toHaveText(
    "@nexo_teste",
  );
  await expect(visitor.locator(".cms-preview-banner")).toHaveCount(0);
  const persisted = await stateOf(page);
  expect(persisted.draft.site.email).toBe("contato-teste@example.org");
  expect(persisted.published.site.email).toBe("contato-teste@example.org");
  expect(persisted.published.sections).toEqual(DEFAULT_CONTENT.sections);
  expect(persisted.published.site.name).toBe(DEFAULT_CONTENT.site.name);
  await visitor.close();
});

test("selection publishes only operational information and structured stages while preserving institutional copy", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "Inscrições abertas", exact: true })
    .check();
  await page
    .getByLabel("Edição do processo", { exact: true })
    .fill("Edição de teste local");
  await page
    .getByLabel("Abertura das inscrições", { exact: true })
    .fill(dateFromToday(-1));
  await page
    .getByLabel("Encerramento das inscrições", { exact: true })
    .fill(dateFromToday(7));
  await selectionStep(page, "Documentos");
  await page
    .getByLabel("Link do formulário de inscrição", { exact: true })
    .fill("https://example.org/inscricoes");
  await selectionStep(page, "Documentos");
  await page
    .getByLabel("Link do edital", { exact: true })
    .fill("https://example.org/edital.pdf");
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await selectionStep(page, "Cronograma");
  await page
    .getByLabel("Nome da etapa 1", { exact: true })
    .fill("Envio de inscrições");
  await selectionStep(page, "Cronograma");
  await page
    .getByLabel("Data da etapa 1", { exact: true })
    .fill(dateFromToday(3));
  await selectionStep(page, "Cronograma");
  await page
    .locator(".essentials-stage-details")
    .nth(0)
    .locator("summary")
    .click();
  await page
    .getByLabel("Orientações da etapa 1", { exact: true })
    .fill("Preencha o formulário de teste.");
  await expect(
    page.getByLabel("Título do convite", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Título do cronograma", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Texto do botão de inscrição", { exact: true }),
  ).toHaveCount(0);
  await saveDraft(page);
  await screenshot(page, "desktop-selection-editor");
  await publish(page);

  const visitor = await publicPage(context);
  await expect(visitor.locator(".cms-selection-status")).toHaveText(
    "Inscrições abertas",
  );
  await expect(visitor.locator("#selective-process-content h2")).toHaveText(
    DEFAULT_CONTENT.selection.title,
  );
  await expect(visitor.locator(".cms-selection-edition")).toHaveText(
    "Edição de teste local",
  );
  await expect(visitor.locator(".cms-application-button")).toHaveAttribute(
    "href",
    "https://example.org/inscricoes",
  );
  await expect(visitor.locator(".cms-application-button")).toHaveText(
    DEFAULT_CONTENT.selection.buttonLabel,
  );
  await expect(visitor.locator(".cms-application-button")).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    visitor.locator(
      "#selective-process-content a:not(.cms-application-button)",
    ),
  ).toHaveAttribute("href", "https://example.org/edital.pdf");
  await expect(visitor.locator(".cms-selection-stages h4")).toHaveText(
    "Envio de inscrições",
  );
  await expect(visitor.locator(".cms-selection-stages p")).toHaveText(
    "Preencha o formulário de teste.",
  );
  await expect(
    visitor.locator("#selective-process-schedule > img"),
  ).toBeHidden();
  const published = (await stateOf(page)).published;
  expect(published.selection.opensAt).toBe(dateFromToday(-1));
  expect(published.selection.closesAt).toBe(dateFromToday(7));
  expect(published.selection.stages).toHaveLength(1);
  expect(published.selection.description).toBe(
    DEFAULT_CONTENT.selection.description,
  );
  expect(published.sections).toEqual(DEFAULT_CONTENT.sections);
  await visitor.close();
});

test("a PDF can be uploaded directly from the selection editor and used in its saved preview", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/uploads") &&
      response.request().method() === "POST",
  );
  await selectionStep(page, "Documentos");
  await page.getByLabel("Enviar edital em PDF", { exact: true }).setInputFiles({
    name: "edital-teste.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
    ),
  });
  const uploaded = await uploadResponse;
  expect(uploaded.ok()).toBeTruthy();
  const { asset } = await uploaded.json();
  expect(asset.url).toMatch(/^\/uploads\/.+\.pdf$/);
  await expect(page.getByLabel("Link do edital", { exact: true })).toHaveValue(
    asset.url,
  );
  const download = await page.request.get(asset.url);
  expect(download.ok()).toBeTruthy();
  expect(download.headers()["content-type"]).toContain("application/pdf");
  await saveDraft(page);
  const preview = await openPreview(page);
  await expect(
    preview.locator(
      "#selective-process-content a:not(.cms-application-button)",
    ),
  ).toHaveAttribute("href", asset.url);
  await expect(preview.locator("#about-title")).toHaveText(originalAboutTitle);
});

test("navigation exposes four essential areas and legacy hashes cannot reopen the full site editor", async ({
  page,
}) => {
  await login(page);
  const navigation = page.getByRole("navigation", { name: "Menu principal" });
  await expect(navigation.getByRole("link")).toHaveText([
    "Visão geral",
    "Processo seletivo",
    "Blog do Nexo",
    "Contato",
  ]);
  await expect(
    page.getByRole("link", {
      name: /Conteúdo do site|Biblioteca de mídia|Histórico de versões|Configurações/,
    }),
  ).toHaveCount(0);
  for (const [route, heading] of [
    ["conteudo", "Visão geral"],
    ["secao/about", "Visão geral"],
    ["midia", "Visão geral"],
    ["historico", "Visão geral"],
    ["configuracoes", "Contato"],
    ["secao/selective-process", "Processo seletivo"],
  ]) {
    await page.goto(`/admin/#${route}`);
    await expect(page.locator("#workspace-main h1")).toHaveText(heading);
    await expect(
      page.getByLabel("Título da seção", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Nome do projeto", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Restaurar", exact: true }),
    ).toHaveCount(0);
  }
});

test("mobile navigation works at 390px and all four areas fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const [label, route, file] of [
    ["Visão geral", "inicio", "mobile-overview"],
    ["Processo seletivo", "processo", "mobile-selection"],
    ["Blog do Nexo", "blog", "mobile-blog"],
    ["Contato", "contato", "mobile-contact"],
  ]) {
    if (route !== "inicio") {
      await page
        .getByRole("button", { name: "Abrir navegação", exact: true })
        .click();
      await expect(page.locator(".sidebar")).toHaveClass(/sidebar-open/);
      await page
        .getByRole("navigation", { name: "Menu principal" })
        .getByRole("link", { name: label, exact: true })
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

test("selection stages can be ordered and removed on mobile without losing their contents", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await selectionStep(page, "Cronograma");
  await page.getByLabel("Nome da etapa 1", { exact: true }).fill("Inscrições");
  await selectionStep(page, "Cronograma");
  await page
    .locator(".essentials-stage-details")
    .nth(0)
    .locator("summary")
    .click();
  await page
    .getByLabel("Orientações da etapa 1", { exact: true })
    .fill("Preencha o formulário.");
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await selectionStep(page, "Cronograma");
  await page.getByLabel("Nome da etapa 2", { exact: true }).fill("Entrevistas");
  await selectionStep(page, "Cronograma");
  await page
    .getByLabel("Data da etapa 2", { exact: true })
    .fill(dateFromToday(8));
  await expect(
    page.getByRole("button", { name: "Mover etapa 1 para cima", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Mover etapa 2 para baixo", exact: true }),
  ).toBeDisabled();
  await screenshot(page, "desktop-selection-stages");
  await page.setViewportSize({ width: 390, height: 844 });
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Mover etapa 2 para cima", exact: true })
    .click();
  await expect(page.getByLabel("Nome da etapa 1", { exact: true })).toHaveValue(
    "Entrevistas",
  );
  await expect(page.getByLabel("Data da etapa 1", { exact: true })).toHaveValue(
    dateFromToday(8),
  );
  await expect(page.getByLabel("Nome da etapa 2", { exact: true })).toHaveValue(
    "Inscrições",
  );
  await expect(
    page.getByLabel("Orientações da etapa 2", { exact: true }),
  ).toHaveValue("Preencha o formulário.");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await screenshot(page, "mobile-selection-stages");
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Remover etapa 1", exact: true })
    .click();
  await expect(page.getByLabel("Nome da etapa 1", { exact: true })).toHaveValue(
    "Inscrições",
  );
  await expect(page.getByLabel("Nome da etapa 2", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("Nome da etapa 1", { exact: true })).toHaveValue(
    "Entrevistas",
  );
  await expect(
    page.getByLabel("Nome da etapa 1", { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Data da etapa 1", { exact: true })).toHaveValue(
    dateFromToday(8),
  );
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Remover etapa 1", exact: true })
    .click();
  await saveDraft(page);
  await page.reload();
  await selectionStep(page, "Cronograma");
  await expect(page.getByLabel("Nome da etapa 1", { exact: true })).toHaveValue(
    "Inscrições",
  );
  const state = await stateOf(page);
  expect(state.draft.selection.stages.map((stage) => stage.title)).toEqual([
    "Inscrições",
  ]);
  expect(state.published.selection.stages).toEqual(
    DEFAULT_CONTENT.selection.stages,
  );
});

test("invalid contact data is explained beside the field and focused before publication", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Contato", exact: true }).click();
  const email = page.getByLabel("E-mail de contato", { exact: true });
  await email.fill("endereco-sem-email");
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/e-mail/i);
  await expect(email).toBeFocused();
  expect((await stateOf(page)).published.site.email).toBe(
    DEFAULT_CONTENT.site.email,
  );

  await email.fill("contato-validado@example.org");
  const instagram = page.getByLabel("Perfil do Instagram", { exact: true });
  await instagram.fill("https://www.instagram.com/nexo.qa/");
  await saveDraft(page);
  const state = await stateOf(page);
  expect(state.draft.site).toMatchObject({
    email: "contato-validado@example.org",
    instagramUrl: "https://www.instagram.com/nexo.qa/",
    instagramHandle: "@nexo.qa",
  });
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("Nome de usuário no Instagram", { exact: true }),
  ).toHaveCount(0);
});

test("an incomplete selection stage is saved as a draft but must be completed before publishing", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await selectionStep(page, "Cronograma");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await saveDraft(page);
  const incomplete = await stateOf(page);
  expect(incomplete.draft.selection.stages).toHaveLength(1);
  expect(incomplete.draft.selection.stages[0].title).toBe("");
  expect(incomplete.published.selection.stages).toHaveLength(0);
  await selectionStep(page, "Inscrições");
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  const title = page.getByLabel("Nome da etapa 1", { exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toBeFocused();
  await expect(title).toHaveAccessibleDescription(/nome|título|etapa/i);
  await title.fill("Entrevistas com a equipe");
  await saveDraft(page);
  const optional = page.locator(".essentials-stage-details").first();
  await optional.locator("summary").click();
  const instructions = page.getByLabel("Orientações da etapa 1", {
    exact: true,
  });
  await instructions.fill("Local a confirmar\u0001");
  await selectionStep(page, "Inscrições");
  await expect(instructions).toHaveAttribute("aria-invalid", "true");
  await expect(instructions).toBeFocused();
  await instructions.press("End");
  await instructions.press("Backspace");
  await expect(instructions).toBeVisible();
  await expect(instructions).toBeFocused();
  await expect(instructions).not.toHaveAttribute("aria-invalid", "true");
  await saveDraft(page);
  await publish(page);
  expect((await stateOf(page)).published.selection.stages[0].title).toBe(
    "Entrevistas com a equipe",
  );
});

test("selection publication waits for its PDF upload and includes the file that finished uploading", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await page
    .getByLabel("Edição do processo", { exact: true })
    .fill("Edital em preparação");
  let releaseUpload;
  const uploadGate = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/api/admin/uploads", async (route) => {
    await uploadGate;
    await route.continue();
  });
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/uploads") &&
      response.request().method() === "POST",
  );
  await selectionStep(page, "Documentos");
  await page.getByLabel("Enviar edital em PDF", { exact: true }).setInputFiles({
    name: "edital-completo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
    ),
  });
  try {
    await expect(
      page.getByRole("button", { name: "Publicar alterações", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("button", { name: "Salvar rascunho", exact: true })
        .first(),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Pré-visualizar", exact: true }),
    ).toBeDisabled();
    expect((await stateOf(page)).published.selection.edition).toBe(
      DEFAULT_CONTENT.selection.edition,
    );
  } finally {
    releaseUpload();
  }
  const response = await uploaded;
  expect(response.ok()).toBeTruthy();
  const { asset } = await response.json();
  await expect(page.getByLabel("Link do edital", { exact: true })).toHaveValue(
    asset.url,
  );
  await expect(page.locator(".essentials-document-card")).toContainText(
    "edital-completo.pdf",
  );
  await saveDraft(page);
  await publish(page);
  expect((await stateOf(page)).published.selection.noticeUrl).toBe(asset.url);
});

test("the overview distinguishes a saved selection draft from the information currently published", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  await page
    .getByLabel("Edição do processo", { exact: true })
    .fill("Nova edição ainda em revisão");
  await page.getByRole("radio", { name: "Em breve", exact: true }).check();
  await saveDraft(page);
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  const summary = page.locator(".essentials-selection-summary");
  await expect(summary).toContainText("Publicado no site");
  await expect(summary).toContainText("Encerrado");
  await expect(summary).not.toContainText("Nova edição ainda em revisão");
  await expect(summary).toContainText("Há alterações no rascunho");
  const state = await stateOf(page);
  expect(state.draft.selection.edition).toBe("Nova edição ainda em revisão");
  expect(state.published.selection.edition).toBe(
    DEFAULT_CONTENT.selection.edition,
  );
});
