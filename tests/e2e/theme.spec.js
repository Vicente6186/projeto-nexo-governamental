const { test: base, expect } = require("@playwright/test");
const path = require("node:path");

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
        "Panel, public page and preview have no JavaScript errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
test.setTimeout(60_000);

const themeTrigger = (page) =>
  page.getByRole("button", { name: /^Aparência:/ });

async function login(page) {
  await page.goto("/admin/");
  await page
    .getByRole("button", { name: "Entrar na prévia local", exact: true })
    .click();
  await expect(page.locator("#workspace-main h1")).toHaveText("Visão geral");
}

async function setTheme(page, label) {
  await themeTrigger(page).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(themeTrigger(page)).toHaveAccessibleName(`Aparência: ${label}`);
  await expect(page.getByRole("menu", { name: "Aparência" })).toHaveCount(0);
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
    path: path.resolve("artifacts/admin-qa", `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
});

test("appearance follows the system, supports keyboard selection, persists and synchronizes between panel tabs", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/admin/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeTrigger(page)).toHaveAccessibleName("Aparência: Sistema");
  await screenshot(page, "dark-login");

  await themeTrigger(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "Claro", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitemradio", { name: "Sistema", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(themeTrigger(page)).toBeFocused();
  await page.reload();
  await expect(themeTrigger(page)).toHaveAccessibleName("Aparência: Claro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => localStorage.getItem("nexo-studio-theme")),
  ).toBe("light");

  await page
    .getByRole("button", { name: "Entrar na prévia local", exact: true })
    .click();
  await expect(page.locator("#workspace-main h1")).toHaveText("Visão geral");
  await setTheme(page, "Escuro");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(themeTrigger(page)).toHaveAccessibleName("Aparência: Escuro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const otherPanel = await context.newPage();
  await otherPanel.goto("/admin/");
  await expect(themeTrigger(otherPanel)).toHaveAccessibleName(
    "Aparência: Escuro",
  );
  await setTheme(otherPanel, "Claro");
  await expect(themeTrigger(page)).toHaveAccessibleName("Aparência: Claro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await otherPanel.close();

  await setTheme(page, "Sistema");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await themeTrigger(page).click();
  await page.keyboard.press("Escape");
  await expect(themeTrigger(page)).toBeFocused();
  await expect(page.getByRole("menu", { name: "Aparência" })).toHaveCount(0);
});

test("dark appearance covers every workspace and dialog while public content and its preview retain their own appearance", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await login(page);
  const initialResponse = await page.request.get("/api/admin/content");
  const initial = await initialResponse.json();
  const visitor = await context.newPage();
  await visitor.goto("/");
  await expect(visitor.locator("#about-title")).toBeVisible();
  const publicAppearance = await visitor.locator("body").evaluate((body) => ({
    background: getComputedStyle(body).backgroundColor,
    color: getComputedStyle(body).color,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  await setTheme(page, "Escuro");
  const routes = [
    ["Visão geral", "overview"],
    ["Processo seletivo", "selection"],
    ["Blog do Nexo", "blog"],
    ["Contato", "contact"],
  ];
  for (const [label, name] of routes) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page.locator("#workspace-main h1")).toHaveText(label);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await noOverflow(page);
    await screenshot(page, `dark-desktop-${name}`);
  }

  await page.getByRole("link", { name: "Contato", exact: true }).click();
  const email = page.getByLabel("E-mail de contato", { exact: true });
  const oldEmail = await email.inputValue();
  await email.fill("edicao-preservada@example.org");
  await setTheme(page, "Claro");
  await expect(email).toHaveValue("edicao-preservada@example.org");
  await setTheme(page, "Escuro");
  await expect(email).toHaveValue("edicao-preservada@example.org");
  await screenshot(page, "dark-desktop-unsaved-contact");
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "prévia local neste computador",
  );
  await screenshot(page, "dark-desktop-publication-review");
  await page.keyboard.press("Escape");
  await email.fill(oldEmail);
  await screenshot(page, "dark-desktop-contact-editor");

  await page
    .getByRole("button", { name: "Pré-visualizar", exact: true })
    .click();
  const preview = page.frameLocator(
    'iframe[title="Prévia do site Nexo Governamental"]',
  );
  await expect(preview.locator(".cms-preview-banner")).toBeVisible();
  await expect(preview.locator("html")).not.toHaveAttribute(
    "data-theme",
    "dark",
  );
  expect(
    await preview.locator("body").evaluate((body) => ({
      background: getComputedStyle(body).backgroundColor,
      color: getComputedStyle(body).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    })),
  ).toEqual(publicAppearance);
  await screenshot(page, "dark-desktop-site-preview");
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();

  await visitor.reload();
  await expect(visitor.locator("html")).not.toHaveAttribute(
    "data-theme",
    "dark",
  );
  expect(
    await visitor.locator("body").evaluate((body) => ({
      background: getComputedStyle(body).backgroundColor,
      color: getComputedStyle(body).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    })),
  ).toEqual(publicAppearance);
  const finalResponse = await page.request.get("/api/admin/content");
  const final = await finalResponse.json();
  expect(final.draft).toEqual(initial.draft);
  expect(final.published).toEqual(initial.published);
  expect(final.version).toBe(initial.version);
  await visitor.close();
});

test("search, essential field guidance and selection status work with the keyboard", async ({
  page,
}) => {
  await login(page);
  const searchButton = page.getByRole("button", {
    name: "Buscar no painel",
    exact: true,
  });
  await searchButton.click();
  const dialog = page.getByRole("dialog");
  const searchInput = dialog.getByRole("textbox", {
    name: "Buscar no painel",
    exact: true,
  });
  await expect(searchInput).toBeFocused();
  await searchInput.fill("nenhum-conteudo-com-este-nome-123");
  await expect(page.locator(".search-results")).toContainText(/Nenhum/);
  await screenshot(page, "desktop-search-empty");
  await page.keyboard.press("Escape");
  await expect(searchButton).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveValue("");
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press(index < 6 ? "Tab" : "Shift+Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await searchInput.fill("Contato");
  await page
    .locator(".search-results")
    .getByRole("button", { name: /Contato/ })
    .click();
  await expect(page.locator("#workspace-main h1")).toHaveText("Contato");
  const email = page.getByLabel("E-mail de contato", { exact: true });
  await expect(email).toHaveAttribute("aria-describedby", /.+/);
  await expect(email).toHaveAccessibleDescription(/.+/);

  await page
    .getByRole("link", { name: "Processo seletivo", exact: true })
    .click();
  const upcoming = page.getByRole("radio", { name: "Em breve", exact: true });
  const open = page.getByRole("radio", {
    name: "Inscrições abertas",
    exact: true,
  });
  const closed = page.getByRole("radio", { name: "Encerrado", exact: true });
  await upcoming.check();
  await upcoming.focus();
  await page.keyboard.press("ArrowRight");
  await expect(open).toBeFocused();
  await expect(open).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(closed).toBeFocused();
  await expect(closed).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(upcoming).toBeFocused();
  await expect(upcoming).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(closed).toBeFocused();
  await expect(closed).toBeChecked();
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("mobile drawer contains focus, closes with Escape, and dark pages fit narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await setTheme(page, "Escuro");
  const sidebar = page.locator(".sidebar");
  const openMenu = page.getByRole("button", {
    name: "Abrir navegação",
    exact: true,
  });
  await expect(sidebar).toHaveAttribute("inert", "");
  await openMenu.click();
  await expect(sidebar).toHaveClass(/sidebar-open/);
  await expect
    .poll(() =>
      sidebar.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press(index < 8 ? "Tab" : "Shift+Tab");
    expect(
      await sidebar.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await screenshot(page, "dark-mobile-navigation");
  await page.keyboard.press("Escape");
  await expect(sidebar).not.toHaveClass(/sidebar-open/);
  await expect(sidebar).toHaveAttribute("inert", "");
  await expect(openMenu).toBeFocused();

  for (const [label, name] of [
    ["Visão geral", "overview"],
    ["Processo seletivo", "selection"],
    ["Blog do Nexo", "blog"],
    ["Contato", "contact"],
  ]) {
    await openMenu.click();
    await sidebar.getByRole("link", { name: label, exact: true }).click();
    await expect(sidebar).not.toHaveClass(/sidebar-open/);
    await expect(page.locator("#workspace-main h1")).toHaveText(label);
    await noOverflow(page);
    await screenshot(page, `dark-mobile-${name}`);
  }

  // Selecting an already active hash must still dismiss the drawer.
  await openMenu.click();
  await sidebar.getByRole("link", { name: "Contato", exact: true }).click();
  await expect(sidebar).not.toHaveClass(/sidebar-open/);

  await themeTrigger(page).click();
  await noOverflow(page);
  await screenshot(page, "dark-mobile-appearance-menu");
  await page.getByRole("menuitemradio", { name: "Claro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await noOverflow(page);
});
