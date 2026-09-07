const { test: base, expect } = require("@playwright/test");
const path = require("node:path");
const { loginPreview } = require("./auth.cjs");

const test = base.extend({
  verifyJavaScript: [
    async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(
        errors,
        "Password recovery has no uncaught JavaScript errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });

const TOKEN = "ab".repeat(32);
const PASSWORD = "Senha-de-teste-2026!";
const SENT =
  "Se este e-mail estiver associado a uma conta ativa, você receberá as instruções para criar uma nova senha.";
async function mockSession(page, overrides = {}) {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        authenticated: false,
        user: null,
        localPreview: false,
        passwordResetAvailable: true,
        ...overrides,
      },
    }),
  );
}
async function openRequest(page) {
  await page.goto("/admin/");
  await page
    .getByRole("link", { name: "Esqueci minha senha", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recupere seu acesso.", exact: true }),
  ).toBeVisible();
}
async function openConfirm(page, token = TOKEN) {
  await page.goto(`/admin/#redefinir-senha?token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Crie sua nova senha.", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/#redefinir-senha$/);
}
async function fillPasswords(
  page,
  password = PASSWORD,
  confirmation = password,
) {
  await page.getByLabel("Nova senha", { exact: true }).fill(password);
  await page
    .getByLabel("Confirme a nova senha", { exact: true })
    .fill(confirmation);
}

test("request validates email, prevents duplicate submissions and shows the same generic success with resend cooldown", async ({
  page,
}) => {
  await page.clock.install();
  await mockSession(page);
  const requests = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/password-reset/request", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await gate;
    await route.fulfill({ status: 202, json: { ok: true, message: SENT } });
  });
  await openRequest(page);
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(page.getByLabel("E-mail de acesso")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("E-mail de acesso")).toBeFocused();
  expect(requests).toHaveLength(0);
  await page.getByLabel("E-mail de acesso").fill("equipe@example.com");
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enviando link…", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".password-reset form")
    .evaluate((form) => form.requestSubmit());
  await expect.poll(() => requests.length).toBe(1);
  release();
  await expect(
    page.getByRole("heading", { name: "Confira seu e-mail.", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(SENT, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Reenviar em/ }),
  ).toBeDisabled();
  await page.clock.fastForward(61_000);
  await page
    .getByRole("button", { name: "Enviar outro link", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual([
    { email: "equipe@example.com" },
    { email: "equipe@example.com" },
  ]);
  await page
    .getByRole("button", { name: "Voltar para entrar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Nexo Studio.",
      exact: true,
    }),
  ).toBeVisible();
});

test("missing email configuration is explicit and never simulates sending", async ({
  page,
}) => {
  await mockSession(page, { passwordResetAvailable: false });
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/password-reset/"))
      requests.push(request.url());
  });
  await openRequest(page);
  await expect(
    page.getByText(/A recuperação por e-mail ainda não está configurada/),
  ).toBeVisible();
  await expect(page.getByLabel("E-mail de acesso")).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Enviar link de recuperação",
      exact: true,
    }),
  ).toBeDisabled();
  expect(requests).toEqual([]);
  await page
    .getByRole("link", { name: "Voltar ao login", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Nexo Studio.",
      exact: true,
    }),
  ).toBeVisible();
});

test("a valid link is captured privately, validates both passwords, supports visibility controls and returns to login without authenticating", async ({
  page,
}) => {
  await mockSession(page, {
    authenticated: true,
    csrfToken: "qa-csrf",
    user: {
      id: "qa-existing",
      email: "existing@example.com",
      name: "Pessoa de teste",
      role: "admin",
    },
  });
  const calls = [];
  const urls = [];
  page.on("request", (request) => urls.push(request.url()));
  await page.route("**/api/password-reset/confirm", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await openConfirm(page);
  await expect(page.locator("#workspace-main")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(urls.every((url) => !url.includes(TOKEN))).toBe(true);
  expect(
    await page.evaluate(
      (token) =>
        [localStorage, sessionStorage].every((storage) =>
          Object.keys(storage).every(
            (key) =>
              !key.includes(token) && !storage.getItem(key).includes(token),
          ),
        ),
      TOKEN,
    ),
  ).toBe(true);
  expect(await page.locator("html").innerHTML()).not.toContain(TOKEN);
  await fillPasswords(page, "curta", "outra");
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeFocused();
  await expect(
    page.getByText("Use uma senha com pelo menos 12 caracteres.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  await fillPasswords(page, PASSWORD, "Senha-diferente-2026!");
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirme a nova senha", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("As senhas precisam ser iguais.", { exact: true }),
  ).toBeVisible();
  await fillPasswords(page);
  await page
    .getByRole("button", { name: "Mostrar nova senha", exact: true })
    .click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Ocultar nova senha", exact: true })
    .click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page
    .getByRole("button", { name: "Mostrar confirmação da senha", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirme a nova senha", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Sua senha foi atualizada.",
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toEqual([{ token: TOKEN, password: PASSWORD }]);
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Entrar com a nova senha", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Nexo Studio.",
      exact: true,
    }),
  ).toBeVisible();
  expect(urls.some((url) => /\/api\/(?:login|admin\/content)$/.test(url))).toBe(
    false,
  );
});

test("malformed, expired and already used links lead to an honest request for a new link", async ({
  page,
}) => {
  await mockSession(page);
  const calls = [];
  await page.route("**/api/password-reset/confirm", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      json: {
        error: "Este link expirou ou já foi utilizado.",
        code: "RESET_TOKEN_INVALID",
        field: "token",
      },
    });
  });
  await page.goto("/admin/#redefinir-senha?token=invalid-token");
  await expect(
    page.getByRole("heading", {
      name: "Vamos renovar seu acesso.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#redefinir-senha$/);
  expect(calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Solicitar novo link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recupere seu acesso.", exact: true }),
  ).toBeVisible();
  await openConfirm(page);
  await fillPasswords(page);
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Vamos renovar seu acesso.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Este link não é válido, expirou ou já foi utilizado/),
  ).toBeVisible();
  expect(calls).toHaveLength(1);
  await page
    .getByRole("button", { name: "Solicitar novo link", exact: true })
    .click();
  await expect(page.getByLabel("E-mail de acesso")).toBeEnabled();
});

test("network errors remain retryable and 429 respects the server cooldown", async ({
  page,
}) => {
  await page.clock.install();
  await mockSession(page);
  let calls = 0;
  await page.route("**/api/password-reset/request", async (route) => {
    calls += 1;
    if (calls === 1) return route.abort("failed");
    if (calls === 2)
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": "10" },
        json: { error: "Muitas tentativas.", code: "RATE_LIMITED" },
      });
    return route.fulfill({ status: 202, json: { ok: true, message: SENT } });
  });
  await openRequest(page);
  await page.getByLabel("E-mail de acesso").fill("equipe@example.com");
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Verifique a conexão e tente novamente.",
  );
  await expect(page.getByLabel("E-mail de acesso")).toHaveValue(
    "equipe@example.com",
  );
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tentar novamente em 10 s", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(11_000);
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(page.getByText(SENT, { exact: true })).toBeVisible();
  expect(calls).toBe(3);
});

test("links open from an already authenticated workspace and preserve token handling across hash navigation", async ({
  page,
}) => {
  await loginPreview(page);
  const session = await (await page.request.get("/api/session")).json();
  await mockSession(page, { ...session, passwordResetAvailable: true });
  await page.evaluate((token) => {
    window.location.hash = `redefinir-senha?token=${token}`;
  }, TOKEN);
  await expect(
    page.getByRole("heading", { name: "Crie sua nova senha.", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#redefinir-senha$/);
  await expect(page.locator("#workspace-main")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Vamos renovar seu acesso.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Voltar ao login", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Nexo Studio.",
      exact: true,
    }),
  ).toBeVisible();
});

test("password recovery is usable with keyboard, light and dark themes, and a narrow viewport", async ({
  page,
}) => {
  await mockSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openConfirm(page);
  await expect(
    page.getByRole("heading", { name: "Crie sua nova senha.", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeFocused();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Mostrar nova senha", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: path.resolve("artifacts/admin-qa/password-reset-dark-390.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Aparência:/ }).click();
  await page.getByRole("menuitemradio", { name: "Claro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue(
    PASSWORD,
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: path.resolve("artifacts/admin-qa/password-reset-light-320.png"),
    fullPage: true,
  });
});
