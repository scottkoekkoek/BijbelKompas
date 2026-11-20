// Sprint 2: Bible reader (BK-009, BK-010, BK-012). Uses only the fictitious TEST text of the local seed.
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

test("find a book, pick a chapter and read it", async ({ page }) => {
  await login(page, "/bible");
  await expect(page.getByRole("heading", { name: "Oude Testament" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nieuwe Testament" })).toBeVisible();
  await expect(page.locator(".book-list a")).toHaveCount(66);

  await page.getByLabel("Zoek een boek").fill("genesis");
  await expect(page.locator(".book-list a")).toHaveCount(1);
  await page.locator(".book-list").getByRole("link", { name: "Genesis" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Genesis" })).toBeVisible();
  await expect(page.locator(".chapter-grid a")).toHaveCount(50);
  await page.getByRole("link", { name: "Genesis 1", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Genesis 1" })).toBeVisible();
  await expect(page.locator(".verse")).toHaveCount(3);
  await expect(page.locator(".bible-text")).toContainText("[TESTTEKST] Fictieve regel 1.1.");
  await expect(page.getByText("Fictieve testtekst, geen echte Bijbelvertaling")).toBeVisible();
});

test("select a verse range and copy the reference", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, "/bible/GEN/1");

  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await page.getByRole("button", { name: "Vers 3 selecteren" }).click();
  const bar = page.getByRole("region", { name: "Geselecteerde verzen" });
  await expect(bar).toContainText("Genesis 1:1-3 (TEST)");
  await expect(page.getByRole("button", { name: "Vers 2 selecteren" })).toHaveAttribute("aria-pressed", "true");

  await bar.getByRole("button", { name: "Kopieer verwijzing" }).click();
  // the reader page also has the reading-progress status (feature 6)
  await expect(page.getByRole("status").filter({ hasText: "Verwijzing gekopieerd." })).toHaveCount(1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Genesis 1:1-3 (TEST)");

  await bar.getByRole("button", { name: "Wissen" }).click();
  await expect(bar).toBeHidden();
});

test("move to the next chapter and continue reading later", async ({ page }) => {
  await login(page, "/bible/GEN/1");
  await page.getByRole("link", { name: /Genesis 2/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Genesis 2" })).toBeVisible();
  await expect(page.locator(".verse")).toHaveCount(2);

  // A chapter without test text explains that instead of showing an error.
  await page.getByRole("link", { name: /Genesis 3/ }).click();
  await expect(page.getByText("Van Genesis 3 is in de Testvertaling (fictief) nog geen tekst ingeladen.")).toBeVisible();

  await page.goto("/bible");
  await expect(page.getByRole("link", { name: /Verder lezen: Genesis \d/ })).toBeVisible();
});

test("HSV and NBV21 are only external links, never text", async ({ page }) => {
  await login(page, "/bible/GEN/1");
  const hsv = page.getByRole("navigation", { name: "Vertaling" }).getByRole("link", { name: /HSV/ });
  await expect(hsv).toHaveAttribute("href", "https://www.debijbel.nl");
  await expect(hsv).toHaveAttribute("target", "_blank");

  const res = await page.request.get("/api/v1/bible/HSV/GEN/1");
  expect(res.status()).toBe(403);
  expect(JSON.stringify(await res.json())).toContain("FORBIDDEN");
});

test("the chapter API validates input and requires login", async ({ page, playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/v1/bible/TEST/GEN/1")).status()).toBe(401);
  await anon.dispose();

  await login(page);
  const ok = await page.request.get("/api/v1/bible/TEST/GEN/1");
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.verses.map((v: { verse: number }) => v.verse)).toEqual([1, 2, 3]);
  expect((await page.request.get("/api/v1/bible/TEST/OBA/2")).status()).toBe(404);
  expect((await page.request.get("/api/v1/bible/TEST/GEN/abc")).status()).toBe(422);
  expect((await page.request.put("/api/v1/me/reading-position", { data: { book: "GEN" } })).status()).toBe(422);
});
