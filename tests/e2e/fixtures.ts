import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";

/** Fictitious e2e user; exists only in the local/CI Supabase stack. */
export const E2E_USER = { email: "e2e-gebruiker@example.test", password: "Test-Wachtwoord-2026" };

export async function login(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("E-mailadres").fill(E2E_USER.email);
  await page.getByLabel("Wachtwoord").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A second "device": a fresh browser context (own storage) with the project's settings. */
export async function newDevice(browser: Browser, info: TestInfo) {
  const u = info.project.use;
  return browser.newContext({
    baseURL: u.baseURL,
    locale: u.locale,
    viewport: u.viewport,
    userAgent: u.userAgent,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
  });
}

/** Ronde 3: on a phone the note's type, date and sermon fields are folded under "Gegevens". */
export async function openNoteDetails(page: Page) {
  const details = page.locator("details.note-details");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
}
