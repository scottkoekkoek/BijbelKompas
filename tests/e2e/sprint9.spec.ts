// Sprint 9: comparing translations (BK-011, AT-09), highlights (BK-013) and the Bible offline (BK-014).
// Fictitious user and the fictitious TEST/TEST2 texts only.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

async function noSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function offlineReady(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return Boolean(reg?.active && navigator.serviceWorker.controller && (await caches.match("/offline")));
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test("two translations side by side, with a different verse division marked (BK-011, AT-09)", async ({ page }) => {
  await login(page, "/bible/GEN/1?v=TEST");
  await page.getByRole("navigation", { name: "Vergelijk met" }).getByRole("link", { name: "TEST2" }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/1\?v=TEST&naast=TEST2$/);

  const table = page.locator(".compare-table");
  await expect(table.locator("thead th")).toHaveText(["Vers", "TEST", "TEST2"]);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  // TEST 1:1 and 1:2 are both TEST2 1:1: shown once, both marked
  await expect(rows.nth(0)).toContainText("andere versindeling");
  await expect(rows.nth(0)).toContainText("[TESTTEKST 2] Andere regel 1.1.");
  await expect(rows.nth(1)).toContainText("Zie hierboven (1:1).");
  // TEST 1:3 is TEST2 1:2: other number, same verse
  await expect(rows.nth(2)).toContainText("[TESTTEKST 2] Andere regel 1.2.");
  await expect(rows.nth(2)).not.toContainText("andere versindeling");
  await expect(page.locator(".compare-legend")).toBeVisible();
  await noSeriousViolations(page);

  // HSV/NBV21 are reference-only: never offered for comparing
  await expect(page.getByRole("navigation", { name: "Vergelijk met" }).getByRole("link", { name: /HSV|NBV21/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Vergelijken sluiten" }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/1\?v=TEST$/);
  await expect(page.locator(".bible-text")).toBeVisible();
});

test("highlight verses with a color and a note; it shows in every translation (BK-013)", async ({ page }) => {
  await login(page, "/bible/GEN/1?v=TEST");
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  await page.getByRole("button", { name: "Vers 3 selecteren" }).click();
  await page.getByRole("button", { name: "Markeren" }).click();
  await page.getByRole("radio", { name: "Groen" }).check();
  await page.getByLabel("Aantekening (optioneel)").fill("Licht en orde");
  await noSeriousViolations(page);
  await page.getByRole("button", { name: "Markering opslaan" }).click();

  await expect(page.locator("#v2")).toHaveClass(/hl-groen/);
  await expect(page.locator("#v3")).toHaveClass(/hl-groen/);
  await expect(page.locator("#v1")).not.toHaveClass(/hl-/);
  const list = page.locator(".highlight-list");
  await expect(list).toContainText("Genesis 1:2-3");
  await expect(list).toContainText("Licht en orde");
  await noSeriousViolations(page);

  // TEST2 numbers the same verses 1 and 2
  await page.goto("/bible/GEN/1?v=TEST2");
  await expect(page.locator("#v1")).toHaveClass(/hl-groen/);
  await expect(page.locator("#v2")).toHaveClass(/hl-groen/);

  // change and remove
  await page.getByRole("button", { name: "Markering Genesis 1:2-3 wijzigen" }).click();
  await list.getByRole("radio", { name: "Roze" }).check();
  await list.getByRole("button", { name: "Wijziging opslaan" }).click();
  await expect(page.locator("#v1")).toHaveClass(/hl-roze/);
  await page.getByRole("button", { name: "Markering Genesis 1:2-3 verwijderen" }).click();
  await expect(page.locator("#v1")).not.toHaveClass(/hl-/);
  await expect(list.getByRole("listitem")).toHaveCount(0);
});

test("keep an allowed translation on the device and read it offline (BK-014)", async ({ page, context }) => {
  await login(page, "/sync");
  await offlineReady(page);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Bijbel op dit apparaat" }) });
  // TEST2 may not be kept offline; it is not offered
  await expect(section.getByRole("button", { name: "TEST2 offline bewaren" })).toHaveCount(0);
  await section.getByRole("button", { name: /^TEST (offline|opnieuw) bewaren$/ }).click();
  await expect(section.getByRole("status")).toHaveText("Testvertaling (fictief) staat nu op dit apparaat (2 hoofdstukken).");

  await context.setOffline(true);
  await page.goto("/bible/GEN/2?v=TEST").catch(() => undefined);
  await expect(page).toHaveURL(/\/offline\?bijbel=TEST\/GEN\/2$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Genesis 2");
  await expect(page.locator(".bible-text")).toContainText("[TESTTEKST] Fictieve regel 2.1.");
  await page.getByRole("button", { name: "‹ Genesis 1" }).click();
  await expect(page.locator(".bible-text")).toContainText("[TESTTEKST] Fictieve regel 1.3.");

  // a translation that is not on the device
  await page.goto("/bible/GEN/1?v=TEST2").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Niet op dit apparaat" })).toBeVisible();
  await context.setOffline(false);

  await page.goto("/sync");
  await section.getByRole("button", { name: "TEST verwijderen" }).click();
  await expect(section.getByRole("status")).toHaveText("TEST is van dit apparaat verwijderd.");
  await expect(section).toContainText("niet op dit apparaat");
});

test("offline Bible text is only handed out for allowed translations (BK-014, afspraak 2)", async ({ page, playwright }, info) => {
  await login(page, "/dashboard");
  const list = await (await page.request.get("/api/v1/bible/offline")).json();
  expect(list.translations.map((t: { code: string }) => t.code)).toEqual(["TEST"]);
  expect((await page.request.get("/api/v1/bible/offline?translation=TEST2&book=GEN")).status()).toBe(403);
  expect((await page.request.get("/api/v1/bible/offline?translation=HSV&book=GEN")).status()).toBe(403);
  const ok = await (await page.request.get("/api/v1/bible/offline?translation=TEST&book=GEN")).json();
  expect(ok.chapters.map((c: { chapter: number }) => c.chapter)).toEqual([1, 2]);

  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  for (const url of ["/api/v1/bible/offline", "/api/v1/highlights?translation=TEST&book=GEN&chapter=1"]) {
    expect((await anon.get(url, { maxRedirects: 0 })).status()).toBe(401);
  }
  expect((await anon.post("/api/v1/highlights", { data: {}, maxRedirects: 0 })).status()).toBe(401);
  expect((await anon.delete(`/api/v1/highlights/${crypto.randomUUID()}`, { maxRedirects: 0 })).status()).toBe(401);
  await anon.dispose();
});
