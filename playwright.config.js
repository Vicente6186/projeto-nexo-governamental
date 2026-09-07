const { defineConfig, devices } = require("@playwright/test");
const { tmpdir } = require("node:os");
const path = require("node:path");

const baseURL = "http://127.0.0.1:3101";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server/index.cjs",
    url: `${baseURL}/admin/`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: "3101",
      CMS_ORIGIN: baseURL,
      CMS_LOCAL_PREVIEW: "1",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      DATA_DIR: path.join(
        tmpdir(),
        `nexo-playwright-${process.pid}-${Date.now()}`,
      ),
    },
  },
});
