// Audit 20 November (phase 1 and small P2 points): exact verse links with a way back (BK-01),
// Bible references in search (BK-02), clearer dates and versions (BK-03), timeline and
// question counts (BK-04). Fictitious user and TEST text only.
import { expect, test, type Page } from "@playwright/test";
import { login, openNoteDetails } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const saveState = (page: Page) => page.locator(".save-state");

test("a reference in a note opens the exact verse, and leads back to the note (BK-01)", async ({ page }) => {
  await login(page, "/bible/GEN/1?v=TEST");
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  await page.getByRole("button", { name: "Vers 3 selecteren" }).click();
  await page.getByRole("region", { name: "Geselecteerde verzen" }).getByRole("button", { name: "In notitie zetten" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const title = unique("Verwijzing");
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
  const notePath = new URL(page.url()).pathname;

  const read = page.locator(".ref-block").getByRole("link", { name: /lezen$/ }).first();
  await expect(read).toHaveAttribute("href", /\/bible\/GEN\/1\?v=TEST&vers=2-3&terug=.*#v2$/);
  await read.click();
  await expect(page).toHaveURL(/vers=2-3/);
  await expect(page.locator("#v2")).toHaveClass(/target/);
  await expect(page.locator("#v3")).toHaveClass(/target/);
  await expect(page.locator("#v1")).not.toHaveClass(/target/);
  await page.reload();
  await expect(page.locator("#v2")).toHaveClass(/target/);

  await page.getByRole("link", { name: `Terug naar ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`${notePath}$`));

  // a verse that does not exist: the whole chapter, with an explanation
  await page.goto("/bible/GEN/1?v=TEST&vers=90");
  await expect(page.locator(".target-missing")).toContainText("Vers 90 bestaat hier niet");
  // only a note can be the way back
  await page.goto("/bible/GEN/1?v=TEST&terug=https%3A%2F%2Fexample.test");
  await expect(page.getByRole("link", { name: /^Terug naar/ })).toHaveCount(0);
});

test("a Bible reference in search goes straight to the passage (BK-02)", async ({ page }) => {
  await login(page, "/search?q=Gen%201%3A2%E2%80%933");
  const hit = page.locator(".passage-hit");
  await expect(hit.getByRole("heading", { level: 2 })).toContainText("Genesis 1:2-3");
  await hit.getByRole("link", { name: "Lees in de Bijbel" }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/1\?v=\w+&vers=2-3#v2$/);
  await expect(page.locator("#v2")).toHaveClass(/target/);

  await page.goto("/search?q=Gen%2099%3A1");
  await expect(page.getByRole("status").filter({ hasText: "Genesis heeft 50 hoofdstukken." })).toBeVisible();
  await page.goto("/search?q=fictieve");
  await expect(page.locator(".passage-hit")).toHaveCount(0);
});

test("the timeline puts notes without a date in their own group, and counts match their page (BK-04)", async ({ page }) => {
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await openNoteDetails(page);
  await expect(page.getByLabel("Datum van preek of gebeurtenis")).toBeVisible();
  const title = unique("Zonder datum");
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await page.goto("/timeline");
  const undated = page.getByRole("region", { name: "Zonder datum" });
  await expect(undated.getByRole("link", { name: title })).toBeVisible();
  for (const year of await page.locator(".timeline-year h2").allTextContents()) {
    if (/^\d{4}$/.test(year)) await expect(page.getByRole("region", { name: year }).getByRole("link", { name: title })).toHaveCount(0);
  }

  await page.goto("/dashboard");
  const tile = page.locator("a.stat", { hasText: /lopende vra/ });
  const count = Number(await tile.locator(".stat-value").textContent());
  await tile.click();
  await expect(page).toHaveURL(/\/questions$/);
  await expect(page.locator("main .note-list > li")).toHaveCount(count);
});
