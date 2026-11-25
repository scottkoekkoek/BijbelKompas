// Ronde 4 (V7, A3): "Verder lezen" brings you back to the verse, just opening a chapter does not
// move the position, and recent concepts wait on Home under "Nog uitwerken". TEST text only.
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
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(await link.inputValue()).pathname);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Kies een wachtwoord").fill(PASSWORD);
  await page.getByLabel("Herhaal wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  return { page, ctx };
}

test.describe.configure({ mode: "serial" });

test("Verder lezen brings you back to the verse; just opening a chapter does not move it (V7)", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "leesplek");
  const put = await t.page.request.put("/api/v1/me/reading-position", { data: { translation: "TEST", book: "GEN", chapter: 1, verse: 3 } });
  expect(put.status()).toBe(200);
  expect((await t.page.request.put("/api/v1/me/reading-position", { data: { translation: "TEST", book: "GEN", chapter: 1, verse: 0 } })).status()).toBe(422);

  // a quick look at another chapter (shorter than reading) leaves the position alone
  await t.page.goto("/bible/GEN/2?v=TEST");
  await expect(t.page.getByRole("heading", { level: 1, name: "Genesis 2" })).toBeVisible();
  await t.page.goto("/dashboard");
  const card = t.page.getByRole("link", { name: "Verder lezen: Genesis 1, vers 3" });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/bible/GEN/1?v=TEST&plek=3");

  await card.click();
  await expect(t.page).toHaveURL(/\/bible\/GEN\/1\?v=TEST&plek=3$/);
  await expect(t.page.locator("#v3")).toBeInViewport();
  await expect(t.page.locator("#v3")).not.toHaveClass(/target/); // brought back, not marked

  // staying in a chapter counts as reading: then the position moves
  await t.page.goto("/bible/GEN/2?v=TEST");
  await t.page.waitForResponse((r) => r.url().includes("/api/v1/me/reading-position") && r.request().method() === "PUT", { timeout: 20_000 });
  await t.page.goto("/bible");
  await expect(t.page.getByRole("link", { name: /Verder lezen: Genesis 2/ })).toBeVisible();
  await t.ctx.close();
});

test("recent concepts wait under Nog uitwerken; Later puts the card aside (A3)", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "uitwerken");
  const res = await t.page.request.post("/api/v1/notes", { data: { title: "Aantekening van zondag", noteType: "preek" } });
  expect(res.status()).toBe(201);
  await t.page.goto("/dashboard");
  const card = t.page.getByRole("region", { name: "Nog uitwerken" });
  await expect(card).toContainText("1 aantekening van de afgelopen twee weken wacht op uitwerken.");
  await expect(card.getByRole("link", { name: /Aantekening van zondag/ })).toBeVisible();

  await card.getByRole("button", { name: "Later" }).click();
  await expect(t.page.getByRole("region", { name: "Nog uitwerken" })).toHaveCount(0);
  await t.page.reload();
  await expect(t.page.getByRole("heading", { name: /Goede/ })).toBeVisible();
  await expect(t.page.getByRole("region", { name: "Nog uitwerken" })).toHaveCount(0);
  await t.ctx.close();
});
