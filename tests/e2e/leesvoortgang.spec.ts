// Feature 6: personal reading progress. Fictitious user and TEST text only (Genesis 1:1-3 in TEST;
// progress counts the canonical verses, so Genesis 1 has 31). The e2e user is shared: every test
// starts by clearing the chapters it uses.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const selectionBar = (page: Page) => page.getByRole("region", { name: "Geselecteerde verzen" });
const progress = (page: Page) => page.locator(".chapter-progress");

async function reset(page: Page, book: string, ...chapters: number[]) {
  for (const chapter of chapters) {
    const r = await page.request.post("/api/v1/reading", { data: { translation: "TEST", book, chapter, from: 1, to: 999, read: false } });
    expect(r.ok()).toBe(true);
  }
}

test("mark verses and a whole chapter as read, undo them, and jump to the next unread verse (feature 6)", async ({ page }) => {
  await login(page, "/dashboard");
  await reset(page, "GEN", 1, 2);

  // nothing read yet
  await page.goto("/bible/GEN?v=TEST");
  await expect(page.locator(".book-progress-count")).toHaveText("Genesis · 0 van 50 hoofdstukken gelezen");
  await expect(page.getByRole("link", { name: "Genesis 1", exact: true })).toContainText("Ongelezen");

  // a range: the chapter is partly read; opening it changed nothing
  await page.goto("/bible/GEN/1?v=TEST");
  await expect(progress(page).locator(".read-badge")).toHaveText("Ongelezen");
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  await selectionBar(page).getByRole("button", { name: "Markeer als gelezen" }).click();
  await expect(progress(page).locator(".read-badge")).toHaveText("Deels gelezen");
  await expect(progress(page)).toContainText("2 van 31 verzen");
  await expect(page.locator("#v1")).toHaveClass(/read/);
  await expect(page.locator("#v3")).not.toHaveClass(/read/);
  // marking the same again counts each verse once
  await expect(selectionBar(page).getByRole("button", { name: "Markeer als ongelezen" })).toBeVisible();
  await page.reload();
  await expect(progress(page)).toContainText("2 van 31 verzen");
  await progress(page).getByRole("link", { name: "Naar eerste ongelezen vers" }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/1\?v=TEST&vers=3#v3$/);

  // undo the range
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  await selectionBar(page).getByRole("button", { name: "Markeer als ongelezen" }).click();
  await expect(progress(page).locator(".read-badge")).toHaveText("Ongelezen");

  // the whole chapter, with the keyboard
  await progress(page).getByRole("button", { name: "Markeer hoofdstuk als gelezen" }).focus();
  await page.keyboard.press("Enter");
  await expect(progress(page).locator(".read-badge")).toHaveText("Gelezen");
  await expect(progress(page).getByRole("status")).toHaveText("Genesis 1 staat op Gelezen.");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  // the book counts it; the jump goes to the first unread verse in chapter and verse order
  await page.goto("/bible/GEN?v=TEST");
  await expect(page.locator(".book-progress-count")).toHaveText("Genesis · 1 van 50 hoofdstukken gelezen");
  await expect(page.getByRole("link", { name: "Genesis 1", exact: true })).toContainText("Gelezen");
  await expect(page.getByRole("link", { name: "Genesis 2", exact: true })).toContainText("Ongelezen");
  await page.goto("/bible");
  await expect(page.getByRole("link", { name: "Genesis · 1 van 50 hoofdstukken gelezen" })).toBeVisible();
  await page.goto("/bible/GEN?v=TEST");
  await page.getByRole("link", { name: /Naar eerstvolgende ongelezen vers/ }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/2\?v=TEST&vers=1#v1$/);

  // opening chapter 2 did not mark it
  await page.goto("/bible/GEN?v=TEST");
  await expect(page.getByRole("link", { name: "Genesis 2", exact: true })).toContainText("Ongelezen");

  // one verse unread again: partly read, and the book count goes back
  await page.goto("/bible/GEN/1?v=TEST");
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  await selectionBar(page).getByRole("button", { name: "Markeer als ongelezen" }).click();
  await expect(progress(page).locator(".read-badge")).toHaveText("Deels gelezen");
  await page.goto("/bible/GEN?v=TEST");
  await expect(page.locator(".book-progress-count")).toHaveText("Genesis · 0 van 50 hoofdstukken gelezen");

  // undo the whole chapter
  await page.goto("/bible/GEN/1?v=TEST");
  await progress(page).getByRole("button", { name: "Markeer hoofdstuk als ongelezen" }).click();
  await expect(progress(page).locator(".read-badge")).toHaveText("Ongelezen");
});

test("a failed save says so and changes nothing; a finished book has no jump (feature 6)", async ({ page }) => {
  await login(page, "/dashboard");
  await reset(page, "GEN", 1);
  await reset(page, "OBA", 1);

  await page.goto("/bible/GEN/1?v=TEST");
  await page.route("**/api/v1/reading", (route) => route.abort());
  // a click before the page is interactive does nothing; the failed request changes nothing either
  await expect(async () => {
    await progress(page).getByRole("button", { name: "Markeer hoofdstuk als gelezen" }).click();
    await expect(progress(page).getByRole("alert")).toHaveText("Je leesvoortgang is niet bewaard. Probeer het opnieuw.", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await page.unroute("**/api/v1/reading");
  await page.reload();
  await expect(progress(page).locator(".read-badge")).toHaveText("Ongelezen");

  // Obadja has one chapter; once read, the book says so and offers no jump
  const r = await page.request.post("/api/v1/reading", { data: { translation: "TEST", book: "OBA", chapter: 1, from: 1, to: 999, read: true } });
  expect(r.ok()).toBe(true);
  await page.goto("/bible/OBA");
  await expect(page.locator(".book-progress-count")).toHaveText("Obadja · 1 van 1 hoofdstuk gelezen");
  await expect(page.getByText("Je hebt Obadja helemaal gelezen.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Naar eerstvolgende ongelezen vers/ })).toHaveCount(0);
  await reset(page, "OBA", 1);
});

test("the reading route refuses visitors who are not signed in", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const r = await anon.post("/api/v1/reading", { data: { translation: "TEST", book: "GEN", chapter: 1, from: 1, to: 999, read: true }, maxRedirects: 0 });
  expect(r.status()).toBe(401);
  await anon.dispose();
});
