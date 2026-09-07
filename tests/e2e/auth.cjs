const { expect } = require("@playwright/test");

let previewCookies;

async function loginPreview(page) {
  // Each test keeps a fresh context/localStorage. Reusing the genuine preview
  // session avoids creating dozens of sessions against the login rate limit.
  if (previewCookies) await page.context().addCookies(previewCookies);
  await page.goto("/admin/");
  const session = await (await page.request.get("/api/session")).json();
  if (!session.authenticated) {
    await page
      .getByRole("button", { name: "Entrar na prévia local", exact: true })
      .click();
  }
  await expect(page.locator("#workspace-main h1")).toHaveText("Visão geral");
  previewCookies = (await page.context().cookies()).filter(
    (cookie) => cookie.name === "nexo_session",
  );
  expect(previewCookies).toHaveLength(1);
}

module.exports = { loginPreview };
