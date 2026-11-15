import { expect, type Page } from "@playwright/test";

/** Fictitious e2e user; exists only in the local/CI Supabase stack. */
export const E2E_USER = { email: "e2e-gebruiker@example.test", password: "Test-Wachtwoord-2026" };

export async function login(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("E-mailadres").fill(E2E_USER.email);
  await page.getByLabel("Wachtwoord").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
