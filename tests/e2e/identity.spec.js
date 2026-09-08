const { test, expect } = require("@playwright/test");
const { loginPreview } = require("./auth.cjs");

test("switching accounts in another tab cannot save the previous editor's pending draft", async ({
  page,
}) => {
  await loginPreview(page);
  const session = await (await page.request.get("/api/session")).json();
  const origin = new URL(page.url()).origin;
  const firstEmail = `editor-first-${Date.now()}@example.org`;
  const secondEmail = `editor-second-${Date.now()}@example.org`;
  const password = "Senha-isolada-identidade-3101!";
  for (const email of [firstEmail, secondEmail]) {
    const created = await page.request.post("/api/admin/users", {
      headers: { Origin: origin, "X-CSRF-Token": session.csrfToken },
      data: { name: "Editor de teste", email, role: "editor", password },
    });
    expect(created.ok()).toBeTruthy();
  }
  const firstLogin = await page.request.post("/api/login", {
    headers: { Origin: origin },
    data: { email: firstEmail, password },
  });
  expect(firstLogin.ok()).toBeTruthy();
  await page.goto("/admin/#contato");
  // A hash-only navigation keeps the preview account in the mounted workspace.
  // Reload to initialize this editor with the first real account's session.
  await page.reload();
  const field = page.getByLabel("E-mail de contato", { exact: true });
  await expect(field).toBeVisible();
  const baseline = await (await page.request.get("/api/admin/content")).json();

  // A login in another tab shares the cookie with this still-open editor.
  const otherTab = await page.context().newPage();
  try {
    const secondLogin = await otherTab.request.post("/api/login", {
      headers: { Origin: origin },
      data: { email: secondEmail, password },
    });
    expect(secondLogin.ok()).toBeTruthy();
    await field.fill("edicao-da-primeira-conta@example.org");
    const dialog = page.getByRole("dialog", {
      name: "Entre novamente para continuar",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(field).toHaveValue("edicao-da-primeira-conta@example.org");
    const account = dialog.getByLabel("E-mail", { exact: true });
    await expect(account).toHaveValue(firstEmail);
    await expect(account).toHaveAttribute("readonly", "");
    const current = await (await page.request.get("/api/admin/content")).json();
    expect(current.version).toBe(baseline.version);
    expect(current.draft).toEqual(baseline.draft);
  } finally {
    await otherTab.close();
  }
});
