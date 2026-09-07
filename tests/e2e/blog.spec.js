const { test: base, expect } = require("@playwright/test");
const path = require("node:path");
const { emptyPost, CATEGORIES } = require("../../shared/blog.cjs");

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
        "The blog and editor have no uncaught JavaScript errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
test.setTimeout(60_000);

const BODY = `## O conhecimento encontra a sociedade

Uma pergunta bem formulada abre caminhos para o debate público. Este artigo de teste apresenta **argumentos claros**, fontes identificadas e cuidado editorial.

> A universidade também se constrói no encontro entre perspectivas.

## Perguntas para uma leitura atenta

- Qual é o contexto da discussão?
- Que fontes sustentam os argumentos?
- Quais questões permanecem abertas?

Consulte a [Universidade de São Paulo](https://www.usp.br/) para conhecer a instituição.

## A conversa continua

O blog aproxima pesquisa, extensão e vida em sociedade. Este conteúdo foi criado somente no banco temporário de testes do projeto.`;

function article(overrides = {}) {
  return {
    ...emptyPost(),
    title: "Instituições em diálogo: perguntas para o debate público",
    slug: `qa-blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    excerpt:
      "Reflexões sobre universidade, instituições e sociedade, com espaço para perguntas, leituras e novas perspectivas.",
    category: CATEGORIES[2],
    author: "Equipe editorial",
    authorRole: "Nexo Governamental · Faculdade de Direito da USP",
    coverImage: "/assets/introduction/usp.webp",
    coverAlt: "Fachada da Faculdade de Direito da USP",
    coverCredit: "Acervo do projeto",
    tags: ["Universidade", "Debate público"],
    body: BODY,
    ...overrides,
  };
}

async function login(page) {
  await page.goto("/admin/");
  await page
    .getByRole("button", { name: "Entrar na prévia local", exact: true })
    .click();
  await expect(page.locator("#workspace-main h1")).toHaveText("Visão geral");
}

async function mutation(page, route, data, method = "POST") {
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

async function createArticle(page, content = article(), published = false) {
  let { post } = await mutation(page, "/api/admin/blog", { post: content });
  if (published)
    ({ post } = await mutation(page, `/api/admin/blog/${post.id}/publish`, {
      version: post.version,
    }));
  return post;
}

async function readArticle(page, id) {
  const response = await page.request.get(`/api/admin/blog/${id}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).post;
}

async function openEditor(page, id) {
  await page.goto(`/admin/#blog/${id}`);
  await expect(
    page.getByLabel("Título do artigo", { exact: true }),
  ).toBeVisible();
}

async function saveDraft(page) {
  const response = page.waitForResponse(
    (result) =>
      /\/api\/admin\/blog\/[a-f0-9-]+$/.test(new URL(result.url()).pathname) &&
      result.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  expect((await response).ok()).toBeTruthy();
}

async function publish(page) {
  await page
    .getByRole("button", { name: /^Publicar (artigo|alterações)$/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith("/publish") && result.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Confirmar publicação", exact: true })
    .click();
  expect((await response).ok()).toBeTruthy();
  await expect(dialog).toHaveCount(0);
}

async function noOverflow(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.resolve("artifacts/admin-qa", `blog-${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function setTheme(page, theme) {
  await page.getByRole("button", { name: /^Aparência:/ }).click();
  await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await login(page);
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const response = await page.request.get("/api/admin/blog");
  if (!response.ok()) return;
  const { posts } = await response.json();
  for (const post of posts.filter(
    (item) => item.draft.slug.startsWith("qa-blog-") && !item.archived,
  )) {
    await mutation(page, `/api/admin/blog/${post.id}/archive`, {
      version: post.version,
    });
  }
});

test("an article can be written and saved in the editor while its preview remains private", async ({
  page,
  browser,
}) => {
  await page.getByRole("link", { name: "Blog do Nexo", exact: true }).click();
  await page.getByRole("button", { name: "Novo artigo", exact: true }).click();
  const content = article();
  await page
    .getByRole("button", { name: "Publicar artigo", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Complete antes de publicar",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar publicação", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await page
    .getByLabel("Título do artigo", { exact: true })
    .fill(content.title);
  await page.getByLabel("Resumo", { exact: true }).fill(content.excerpt);
  await page.getByLabel("Texto do artigo", { exact: true }).fill(content.body);
  await page.getByText("Endereço e compartilhamento", { exact: true }).click();
  await page
    .getByLabel("Endereço do artigo", { exact: true })
    .fill(content.slug);
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption(content.category);
  await page.getByLabel("Autoria", { exact: true }).fill(content.author);
  await page
    .getByLabel("Descrição da autoria", { exact: true })
    .fill(content.authorRole);
  await page.getByLabel("Temas", { exact: true }).fill(content.tags.join(", "));
  await page.getByText("Usar uma imagem por link", { exact: true }).click();
  await page
    .getByLabel("Link da imagem de capa", { exact: true })
    .fill(content.coverImage);
  await page
    .getByLabel("Descrição da imagem", { exact: true })
    .fill(content.coverAlt);
  await page
    .getByLabel("Crédito da imagem", { exact: true })
    .fill(content.coverCredit);
  await saveDraft(page);
  const id = page.url().split("#blog/")[1];
  const saved = await readArticle(page, id);
  expect(saved.draft).toMatchObject({
    title: content.title,
    slug: content.slug,
    excerpt: content.excerpt,
    body: content.body,
    category: content.category,
    author: content.author,
    authorRole: content.authorRole,
    coverImage: content.coverImage,
    coverAlt: content.coverAlt,
    coverCredit: content.coverCredit,
    tags: content.tags,
  });
  expect(saved.published).toBeNull();
  await page.reload();
  await expect(
    page.getByLabel("Título do artigo", { exact: true }),
  ).toHaveValue(content.title);
  await page.getByRole("button", { name: "Prévia", exact: true }).click();
  const frame = page.frameLocator(
    'iframe[title="Prévia privada do artigo no blog"]',
  );
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText(
    content.title,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Celular", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Celular", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  const preview = await page.context().newPage();
  await preview.goto(`/blog/preview/${id}`);
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText(
    content.title,
  );
  await expect(
    preview.getByText("Prévia editorial", { exact: true }),
  ).toBeVisible();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await preview.goto("/blog/?preview=1");
  await expect(
    preview.getByRole("link", { name: content.title, exact: true }),
  ).toBeVisible();
  const anonymous = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
  });
  const visitor = await anonymous.newPage();
  expect((await visitor.goto(`/blog/${content.slug}`)).status()).toBe(404);
  const blocked = await visitor.goto(`/blog/preview/${id}`);
  expect(blocked.status()).toBeGreaterThanOrEqual(400);
  expect((await visitor.goto("/blog/?preview=1")).status()).toBe(401);
  const publicList = await (
    await visitor.request.get(
      `/api/blog?search=${encodeURIComponent(content.title)}`,
    )
  ).json();
  expect(publicList.posts).toHaveLength(0);
  await anonymous.close();
  await preview.close();
});

test("publication serves complete article HTML and keeps saved edits private until republishing", async ({
  page,
  context,
  browser,
}) => {
  const content = article({ featured: true });
  const post = await createArticle(page, content);
  await openEditor(page, post.id);
  await publish(page);
  const visitor = await context.newPage();
  const response = await visitor.goto(`/blog/${content.slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(content.title);
  expect(html).toContain("<strong>argumentos claros</strong>");
  expect(html).toContain("<blockquote>");
  expect(html).not.toContain("## O conhecimento");
  await expect(visitor).toHaveTitle(new RegExp(content.title));
  await expect(visitor.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    content.excerpt,
  );
  await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `http://127.0.0.1:3101/blog/${content.slug}`,
  );
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
    content.title,
  );
  await expect(
    visitor.getByRole("navigation", { name: "Neste artigo" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("link", {
      name: "Universidade de São Paulo",
      exact: true,
    }),
  ).toHaveAttribute("rel", /noopener/);
  const noScriptContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    javaScriptEnabled: false,
  });
  const noScriptReader = await noScriptContext.newPage();
  await noScriptReader.goto(`/blog/${content.slug}`);
  await expect(noScriptReader.getByRole("heading", { level: 1 })).toHaveText(
    content.title,
  );
  await expect(
    noScriptReader.getByRole("heading", {
      name: "O conhecimento encontra a sociedade",
      exact: true,
    }),
  ).toBeVisible();
  await noScriptContext.close();

  const revisedTitle = "Universidade em diálogo: uma leitura revisada";
  await page.getByLabel("Título do artigo", { exact: true }).fill(revisedTitle);
  await saveDraft(page);
  await visitor.reload();
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
    content.title,
  );
  const preview = await context.newPage();
  await preview.goto(`/blog/preview/${post.id}`);
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText(
    revisedTitle,
  );
  await publish(page);
  await visitor.reload();
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
    revisedTitle,
  );
  await visitor.goto("/blog/");
  await expect(
    visitor.getByRole("link", { name: new RegExp(revisedTitle) }).first(),
  ).toBeVisible();
  await preview.close();
  await visitor.close();
});

test("withdrawing, archiving and restoring an article never republishes it automatically", async ({
  page,
  context,
}) => {
  const post = await createArticle(page, article(), true);
  await openEditor(page, post.id);
  await page
    .getByRole("button", { name: "Retirar do ar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Retirar do ar", exact: true })
    .click();
  await expect
    .poll(async () => (await readArticle(page, post.id)).published)
    .toBeNull();
  const visitor = await context.newPage();
  expect((await visitor.goto(`/blog/${post.draft.slug}`)).status()).toBe(404);
  await page
    .getByRole("button", { name: "Arquivar artigo", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Arquivar artigo", exact: true })
    .click();
  await expect
    .poll(async () => (await readArticle(page, post.id)).archived)
    .toBe(true);
  await openEditor(page, post.id);
  await page
    .getByRole("button", { name: "Recuperar artigo", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Recuperar rascunho", exact: true })
    .click();
  await expect
    .poll(async () => (await readArticle(page, post.id)).archived)
    .toBe(false);
  expect((await readArticle(page, post.id)).published).toBeNull();
  expect((await visitor.reload()).status()).toBe(404);
  await visitor.close();
});

test("the editor guards unsaved work and preserves local text when another session saves first", async ({
  page,
}) => {
  const post = await createArticle(page, article());
  await openEditor(page, post.id);
  const title = page.getByLabel("Título do artigo", { exact: true });
  await title.fill("Texto ainda não salvo");
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Sair sem salvar o artigo?" });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(guard).toHaveCount(0);
  await expect(title).toHaveValue("Texto ainda não salvo");
  expect(page.url()).toContain(`#blog/${post.id}`);
  await mutation(
    page,
    `/api/admin/blog/${post.id}`,
    {
      post: { ...post.draft, title: "Versão salva em outra sessão" },
      version: post.version,
    },
    "PUT",
  );
  const conflict = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/blog/${post.id}`) &&
      response.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("outra sessão");
  await expect(title).toHaveValue("Texto ainda não salvo");
  expect((await readArticle(page, post.id)).draft.title).toBe(
    "Versão salva em outra sessão",
  );
});

test("public search, category filtering and pagination work with server-rendered links", async ({
  page,
  context,
}) => {
  const marker = `Pesquisa editorial ${Date.now()}`;
  for (let index = 1; index <= 13; index += 1) {
    await createArticle(
      page,
      article({
        title: `${marker} · ${String(index).padStart(2, "0")}`,
        category: CATEGORIES[3],
        featured: false,
        coverImage: "",
        coverAlt: "",
        coverCredit: "",
      }),
      true,
    );
  }
  await createArticle(
    page,
    article({ title: `${marker} · outro tema`, category: CATEGORIES[0] }),
    true,
  );
  const visitor = await context.newPage();
  await visitor.goto("/blog/");
  await visitor.getByLabel("Buscar artigos", { exact: true }).fill(marker);
  await visitor.getByRole("button", { name: "Buscar", exact: true }).click();
  await visitor
    .getByRole("navigation", { name: "Filtrar artigos por categoria" })
    .getByRole("link", { name: CATEGORIES[3], exact: true })
    .click();
  expect(new URL(visitor.url()).searchParams.get("search")).toBe(marker);
  expect(new URL(visitor.url()).searchParams.get("category")).toBe(
    CATEGORIES[3],
  );
  const first = await (
    await visitor.request.get(
      `/api/blog?search=${encodeURIComponent(marker)}&category=${encodeURIComponent(CATEGORIES[3])}`,
    )
  ).json();
  expect(first.total).toBe(13);
  expect(first.posts).toHaveLength(12);
  await expect(
    visitor.getByRole("link", { name: `${marker} · outro tema`, exact: false }),
  ).toHaveCount(0);
  await visitor
    .getByRole("navigation", { name: "Páginas do blog" })
    .getByRole("link", { name: "Próxima página", exact: true })
    .click();
  expect(new URL(visitor.url()).searchParams.get("page")).toBe("2");
  const second = await (
    await visitor.request.get(`/api/blog${new URL(visitor.url()).search}`)
  ).json();
  expect(second.posts).toHaveLength(1);
  expect(first.posts.some((post) => post.id === second.posts[0].id)).toBe(
    false,
  );
  await expect(
    visitor
      .getByRole("link", { name: new RegExp(second.posts[0].title) })
      .first(),
  ).toBeVisible();
  await visitor
    .getByLabel("Buscar artigos", { exact: true })
    .fill("NenhumResultadoEsperado123456789");
  await visitor.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    visitor.getByRole("heading", {
      name: "Vamos tentar outra busca?",
      exact: true,
    }),
  ).toBeVisible();
  await visitor.close();
});

test("the blog workspace and article editor remain usable in both appearances on narrow screens", async ({
  page,
}) => {
  const post = await createArticle(page, article());
  await openEditor(page, post.id);
  for (const [theme, suffix] of [
    ["Claro", "light"],
    ["Escuro", "dark"],
  ]) {
    await setTheme(page, theme);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await noOverflow(page);
    await screenshot(page, `admin-${suffix}-editor-desktop`);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      await expect(
        page.getByLabel("Título do artigo", { exact: true }),
      ).toBeVisible();
      await screenshot(page, `admin-${suffix}-editor-${width}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/admin/#blog");
  await screenshot(page, "admin-dark-list-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await screenshot(page, "admin-dark-list-mobile");
});

test("public reading and browsing stay responsive and independent of the admin appearance", async ({
  page,
  context,
}) => {
  const post = await createArticle(page, article({ featured: true }), true);
  await setTheme(page, "Escuro");
  const visitor = await context.newPage();
  for (const [route, name] of [
    ["/blog/", "index"],
    [`/blog/${post.draft.slug}`, "article"],
  ]) {
    await visitor.goto(route);
    await expect(visitor.locator("html")).not.toHaveAttribute(
      "data-theme",
      "dark",
    );
    for (const [width, suffix] of [
      [1440, "desktop"],
      [390, "mobile"],
      [320, "narrow"],
    ]) {
      await visitor.setViewportSize({
        width,
        height: width === 1440 ? 1080 : 844,
      });
      await noOverflow(visitor);
      await expect(visitor.getByRole("heading", { level: 1 })).toBeVisible();
      await screenshot(visitor, `public-${name}-${suffix}`);
    }
  }
  await visitor.close();
});
