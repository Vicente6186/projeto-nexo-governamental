const { test, expect } = require("@playwright/test");

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
test.setTimeout(60_000);

test("an administrator can create an individual editor account and revoke its existing session", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/");
  await page
    .getByRole("button", { name: "Entrar na prévia local", exact: true })
    .click();
  await expect(page.locator("#workspace-main h1")).toHaveText("Visão geral");
  await page.getByRole("button", { name: "Meu acesso", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Meu acesso", exact: true })
    .getByRole("button", { name: /^Gerenciar equipe/ })
    .click();
  await page
    .getByRole("dialog", { name: "Equipe do Nexo", exact: true })
    .getByRole("button", { name: "Adicionar integrante", exact: true })
    .click();
  const create = page.getByRole("dialog", {
    name: "Adicionar integrante",
    exact: true,
  });
  const name = "Editora de teste temporário";
  const email = `qa-access-${Date.now()}@example.org`;
  const password = "Senha-temporaria-QA-3101!";
  await create.getByLabel("Nome", { exact: true }).fill(name);
  await create.getByLabel("E-mail", { exact: true }).fill(email);
  await create.getByLabel("Senha inicial", { exact: true }).fill(password);
  await create.getByLabel("Perfil", { exact: true }).selectOption("editor");
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/users") &&
      response.request().method() === "POST",
  );
  await create
    .getByRole("button", { name: "Criar acesso", exact: true })
    .click();
  expect((await created).status()).toBe(201);
  const team = page.getByRole("dialog", {
    name: "Equipe do Nexo",
    exact: true,
  });
  const member = team.getByRole("listitem").filter({ hasText: email });
  await expect(member).toContainText("Editor");
  await expect(member).toContainText("Ativo");

  const editorContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
  });
  try {
    const editor = await editorContext.newPage();
    await editor.goto("/admin/");
    await editor.getByLabel("E-mail", { exact: true }).fill(email);
    await editor.getByLabel("Senha", { exact: true }).fill(password);
    await editor
      .getByRole("button", { name: "Entrar no painel", exact: true })
      .click();
    await expect(editor.locator("#workspace-main h1")).toHaveText(
      "Visão geral",
    );
    expect((await editor.request.get("/api/admin/content")).status()).toBe(200);
    expect((await editor.request.get("/api/admin/users")).status()).toBe(403);
    const authenticated = await (
      await editor.request.get("/api/session")
    ).json();
    expect(authenticated.user).toMatchObject({ email, role: "editor" });

    await member
      .getByRole("button", { name: `Desativar ${name}`, exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Desativar acesso",
      exact: true,
    });
    await expect(confirmation).toContainText(email);
    await confirmation
      .getByRole("button", { name: "Desativar acesso", exact: true })
      .click();
    await expect(member).toContainText("Desativado");
    expect((await editor.request.get("/api/admin/content")).status()).toBe(401);
    expect(
      (await (await editor.request.get("/api/session")).json()).authenticated,
    ).toBe(false);
  } finally {
    await editorContext.close();
  }
});
