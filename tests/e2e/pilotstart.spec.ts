// Ronde 4 (ADR-020): the start of the pilot for a fresh tester. Welcome once, feedback that only the
// administrator reads, a public privacy page, deleting your own account, and an own AI limit per
// account in Beheer. Local stack only, fictitious accounts.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "./fixtures";

const PASSWORD = "Pilot-Test-2026x";
const mail = (who: string) => `${who}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

async function newTester(browser: Browser, admin: Page, who: string) {
  const email = mail(who);
  await admin.goto("/beheer");
  await admin.getByLabel("E-mailadres van de tester").fill(email);
  await admin.getByRole("button", { name: "Uitnodiging maken" }).click();
  const link = admin.locator(".link-value");
  await expect(link).toBeVisible();
  const path = new URL(await link.inputValue()).pathname;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.getByRole("link", { name: /gegevens/ })).toHaveAttribute("href", "/privacy");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Kies een wachtwoord").fill(PASSWORD);
  await page.getByLabel("Herhaal wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  return { email, page, ctx };
}

test.describe.configure({ mode: "serial" });

test("a new tester is welcomed once; the sample note is their own", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "welkom");
  const welcome = t.page.getByRole("region", { name: "Welkom bij BijbelKompas" });
  await expect(welcome).toBeVisible();
  await welcome.getByRole("button", { name: "Maak een voorbeeldnotitie" }).click();
  await t.page.waitForURL(/\/notes\/[0-9a-f-]{36}/);
  await expect(t.page.getByText("Psalm 23:1-3").first()).toBeVisible();
  await t.page.goto("/dashboard");
  await expect(t.page.getByRole("region", { name: "Recente notities" }).getByText("Voorbeeld: Psalm 23")).toBeVisible();
  await expect(t.page.getByRole("region", { name: "Welkom bij BijbelKompas" })).toHaveCount(0);
  await t.ctx.close();

  // closing it is kept as well
  const u = await newTester(browser, page, "sluiten");
  await u.page.getByRole("region", { name: "Welkom bij BijbelKompas" }).getByRole("button", { name: "Sluiten" }).click();
  await expect(u.page.getByRole("region", { name: "Welkom bij BijbelKompas" })).toHaveCount(0);
  await u.page.reload();
  await expect(u.page.getByRole("heading", { name: /Goede/ })).toBeVisible();
  await expect(u.page.getByRole("region", { name: "Welkom bij BijbelKompas" })).toHaveCount(0);
  await u.ctx.close();
});

test("feedback reaches the administrator, with page and screen size, and no other tester", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "feedback");
  const message = `De knop is te klein ${Date.now()}`;
  await t.page.goto("/feedback?van=/bible/JHN/3");
  await t.page.getByLabel("Wat wil je kwijt?").fill(message);
  await t.page.getByRole("button", { name: "Feedback versturen" }).click();
  await expect(t.page.getByRole("status")).toContainText("Dank je wel");

  await page.goto("/beheer");
  const item = page.getByRole("region", { name: "Feedback van testers" }).getByRole("listitem").filter({ hasText: message });
  await expect(item).toContainText(t.email);
  await expect(item).toContainText("/bible/JHN/3");
  await expect(item).toContainText(/scherm \d+ × \d+/);

  // another tester cannot reach Beheer (not found; with streaming the status can stay 200), so never sees it
  const other = await newTester(browser, page, "ander");
  await other.page.goto("/beheer");
  await expect(other.page.getByText(/niet gevonden|bestaat niet/i).first()).toBeVisible();
  await expect(other.page.getByText(message)).toHaveCount(0);
  await t.ctx.close();
  await other.ctx.close();
});

test("the privacy page is readable without an account", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/privacy");
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByText(/Frankfurt/)).toBeVisible();
  await expect(page.getByText(/Anthropic/)).toBeVisible();
  await ctx.close();
});

test("a tester deletes their own account after checking the password; signing in no longer works", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "weg");
  await t.page.goto("/settings");
  await t.page.getByRole("button", { name: "Account verwijderen…" }).click();
  await t.page.getByLabel("Je wachtwoord").fill("verkeerd-wachtwoord");
  await t.page.getByLabel("Typ VERWIJDEREN").fill("verwijderen");
  await t.page.getByRole("button", { name: "Account definitief verwijderen" }).click();
  await expect(t.page.locator(".alert.error")).toContainText("wachtwoord klopt niet");

  await t.page.getByLabel("Je wachtwoord").fill(PASSWORD);
  await t.page.getByLabel("Typ VERWIJDEREN").fill("VERWIJDEREN");
  await t.page.getByRole("button", { name: "Account definitief verwijderen" }).click();
  await t.page.waitForURL(/\/login\?verwijderd=1/, { timeout: 20_000 });
  await expect(t.page.getByRole("status")).toContainText("verwijderd");

  await t.page.getByLabel("E-mailadres").fill(t.email);
  await t.page.getByLabel("Wachtwoord").fill(PASSWORD);
  await t.page.getByRole("button", { name: "Inloggen" }).click();
  await expect(t.page.locator(".alert.error")).toBeVisible();
  await expect(t.page).toHaveURL(/\/login/);

  // the administrator no longer sees the account
  await page.goto("/beheer");
  await expect(page.getByRole("region", { name: "Accounts" })).not.toContainText(t.email);
  await t.ctx.close();
});

test("the only administrator cannot delete their own account", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Account verwijderen…" }).click();
  await page.getByLabel("Je wachtwoord").fill("wat-dan-ook");
  await page.getByLabel("Typ VERWIJDEREN").fill("VERWIJDEREN");
  await page.getByRole("button", { name: "Account definitief verwijderen" }).click();
  await expect(page.locator(".alert.error")).toContainText("enige beheerder");
});

test("Beheer gives one account an own AI limit; empty brings back the default", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "limiet");
  await page.goto("/beheer");
  const row = page.getByRole("region", { name: "Accounts" }).getByRole("listitem").filter({ hasText: t.email });
  await row.getByLabel(/AI-limiet per maand/).fill("2");
  await row.getByRole("button", { name: "Limiet opslaan" }).click();
  await expect(row.getByText("Opgeslagen")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Accounts" }).getByRole("listitem").filter({ hasText: t.email })).toContainText("eigen limiet");

  await t.page.goto("/settings");
  await expect(t.page.getByRole("region", { name: "AI-budget" })).toContainText(/van €\s2,00 gebruikt/);

  const again = page.getByRole("region", { name: "Accounts" }).getByRole("listitem").filter({ hasText: t.email });
  await again.getByLabel(/AI-limiet per maand/).fill("");
  await again.getByRole("button", { name: "Limiet opslaan" }).click();
  await expect(again.getByText("Opgeslagen")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Accounts" }).getByRole("listitem").filter({ hasText: t.email })).toContainText("standaard");
  await t.ctx.close();
});
