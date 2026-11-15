import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "nl-NL",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobiel", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm --filter @bk/web exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
