// BK-008, AT-19: responsive, keyboard-usable base interface without serious accessibility issues.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("login page has no serious accessibility problems", async ({ page }) => {
  await page.goto("/login");
  await expectNoSeriousViolations(page);
});

for (const path of ["/dashboard", "/settings", "/bible", "/bible/GEN", "/bible/GEN/1", "/notes", "/notes/new", "/templates", "/templates/new", "/search?q=fictieve", "/sync", "/offline", "/collections", "/questions", "/timeline"]) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await login(page, path);
    await expectNoSeriousViolations(page);
  });
}

test("dark theme keeps enough contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await login(page, "/settings");
  await expectNoSeriousViolations(page);
});

test("navigation matches the screen size", async ({ page }) => {
  await login(page);
  const narrow = (page.viewportSize()?.width ?? 1280) < 768; // phones and tablets held upright
  const sidebar = page.locator(".sidebar");
  const bottom = page.locator(".bottom-nav");
  if (narrow) {
    await expect(sidebar).toBeHidden();
    await expect(bottom).toBeVisible();
    for (const label of ["Home", "Bijbel", "Notities", "Zoeken", "Meer"]) {
      await expect(bottom.getByRole("link", { name: label })).toBeVisible();
    }
  } else {
    await expect(sidebar).toBeVisible();
    await expect(bottom).toBeHidden();
  }
});

test("the skip link and menu work with the keyboard", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 768, "the sidebar is only there on wide screens");
  await login(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Naar de inhoud" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#inhoud")).toBeFocused();
  await page.locator(".sidebar").getByRole("link", { name: "Instellingen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
});

test("pages never scroll sideways", async ({ page }) => {
  await login(page, "/settings");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the note editor has no serious accessibility problems", async ({ page }) => {
  await login(page, "/notes");
  await page.locator(".page-head").getByRole("link", { name: "Nieuwe notitie" }).click();
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.locator(".note-body[contenteditable='true']")).toBeVisible();
  await expectNoSeriousViolations(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
