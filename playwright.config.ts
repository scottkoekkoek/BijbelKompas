import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const TABLET = /(a11y|bible|notes|sprint9|sprint10|preek)\.spec\.ts$/;

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
    // BK-058 / AT-19: tablets, upright (phone layout) and on its side (sidebar). The flows that differ
    // per screen size run here; the rest is covered by desktop and phone.
    { name: "tablet", use: { ...devices["Galaxy Tab S4"] }, testMatch: TABLET },
    { name: "tablet-liggend", use: { ...devices["Galaxy Tab S4 landscape"] }, testMatch: TABLET },
  ],
  webServer: {
    command: `pnpm --filter @bk/web exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    // Sprint 11: the local, fictitious AI provider (never in production, sends nothing anywhere)
    // Ronde 3 pilot: invitation links create accounts with the secret key of the LOCAL stack only
    env: {
      ...process.env,
      AI_PROVIDER: "fictief",
      SUPABASE_SECRET_KEY:
        process.env.SUPABASE_SECRET_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    } as Record<string, string>,
    timeout: 120_000,
  },
});
