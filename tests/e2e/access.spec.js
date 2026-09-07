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
  await create.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(create.getByLabel("Nome", { exact: true })).toBeHidden();
  await create.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(create.getByLabel("Nome", { exact: true })).toHaveValue(name);
  await create.getByRole("button", { name: "Continuar", exact: true }).click();
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

test("password changes stay tucked away until requested and return to a clear confirmation", async ({
  page,
  browser,
}) => {
  const { loginPreview } = require("./auth.cjs");
  await loginPreview(page);
  const session = await (await page.request.get("/api/session")).json();
  const email = `qa-access-password-${Date.now()}@example.org`;
  const oldPassword = "Senha-inicial-teste-3101!";
  const newPassword = "Senha-nova-teste-3101!";
  const added = await page.request.post("/api/admin/users", {
    headers: {
      Origin: new URL(page.url()).origin,
      "X-CSRF-Token": session.csrfToken,
    },
    data: {
      name: "Pessoa de teste",
      email,
      password: oldPassword,
      role: "editor",
    },
  });
  expect(added.status()).toBe(201);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
  });
  try {
    const member = await context.newPage();
    await member.goto("/admin/");
    await member.getByLabel("E-mail", { exact: true }).fill(email);
    await member.getByLabel("Senha", { exact: true }).fill(oldPassword);
    await member
      .getByRole("button", { name: "Entrar no painel", exact: true })
      .click();
    await member
      .getByRole("button", { name: "Meu acesso", exact: true })
      .click();
    const dialog = member.getByRole("dialog", {
      name: "Meu acesso",
      exact: true,
    });
    await expect(
      dialog.getByLabel("Senha atual", { exact: true }),
    ).toBeHidden();
    const disclosure = dialog.locator("summary", {
      hasText: "Alterar minha senha",
    });
    await dialog
      .getByRole("button", { name: "Fechar janela", exact: true })
      .focus();
    await member.keyboard.press("Tab");
    await expect(disclosure).toBeFocused();
    await member.keyboard.press("Enter");
    await dialog.getByLabel("Senha atual", { exact: true }).fill(oldPassword);
    await dialog.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await dialog
      .getByLabel("Confirmar nova senha", { exact: true })
      .fill(newPassword);
    await dialog
      .getByRole("button", { name: "Alterar senha", exact: true })
      .click();
    await expect(
      dialog.getByText("Senha alterada com sucesso.", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Senha atual", { exact: true }),
    ).toBeHidden();
    await expect(disclosure).toBeFocused();
  } finally {
    await context.close();
  }
});
