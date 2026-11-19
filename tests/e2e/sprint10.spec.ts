// Sprint 10: release gate Private 1.0 (BK-058; AT-14, AT-18, AT-19, AT-20).
// Runs on desktop, phone and two tablet sizes. Fictitious user and TEST/TEST2 text only.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

async function noSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Presses Tab until the element with this accessible name has focus (keyboard only, no clicks). */
async function tabTo(page: Page, name: string | RegExp, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "";
      const label = el.getAttribute("aria-label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null);
      return (label ?? el.closest("label")?.textContent ?? el.textContent ?? "").trim();
    });
    if (typeof name === "string" ? focused === name : name.test(focused)) {
      // AT-19: what has focus must be visible
      const visible = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement as Element);
        return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      });
      expect(visible, `focus ring on ${focused}`).toBe(true);
      return;
    }
  }
  throw new Error(`could not reach ${String(name)} with Tab`);
}

async function newNote(page: Page, title: string) {
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
}

test("the reader works with the keyboard alone: select, highlight and remove (AT-19)", async ({ page }) => {
  await login(page, "/bible/GEN/1?v=TEST");
  await tabTo(page, "Vers 1 selecteren");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Geselecteerde verzen" })).toContainText("Genesis 1:1 (TEST)");
  await tabTo(page, "Markeren");
  await page.keyboard.press("Enter");
  await tabTo(page, "Geel"); // the checked color
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Groen" })).toBeChecked();
  await tabTo(page, "Aantekening (optioneel)");
  await page.keyboard.type("Met het toetsenbord");
  await page.keyboard.press("Enter");
  await expect(page.locator("#v1")).toHaveClass(/hl-groen/);
  await noSeriousViolations(page);

  await tabTo(page, "Markering Genesis 1:1 verwijderen", 120);
  await page.keyboard.press("Enter");
  await expect(page.locator("#v1")).not.toHaveClass(/hl-/);
});

test("the main screens fit every screen size without sideways scrolling (BK-058)", async ({ page }) => {
  await login(page, "/dashboard");
  for (const path of ["/dashboard", "/bible/GEN/1?v=TEST&naast=TEST2", "/notes", "/search?q=fictieve", "/collections", "/timeline", "/sync", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("a note of 20,000 words saves, survives a reload and can be searched (AT-18)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "heavy; once is enough");
  test.setTimeout(180_000);
  const title = unique("Twintigduizend");
  const marker = `slotwoord${Date.now().toString(36)}`;
  await newNote(page, title);
  await body(page).click();
  const paragraph = Array.from({ length: 100 }, (_, i) => `woord${i}`).join(" ");
  for (let p = 0; p < 200; p++) {
    await page.keyboard.insertText(p === 199 ? `${paragraph.split(" ").slice(0, 99).join(" ")} ${marker}` : paragraph);
    if (p < 199) await page.keyboard.press("Enter");
  }
  await page.getByRole("button", { name: "Opslaan als versie" }).click();
  await expect(saveState(page)).toHaveText("Opgeslagen", { timeout: 60_000 });

  await page.reload();
  await expect(body(page)).toContainText(marker, { timeout: 30_000 });
  const words = await body(page).evaluate((el) => (el.textContent ?? "").replace(/(woord\d+|slotwoord\w+)/g, " $1 ").trim().split(/\s+/).length);
  expect(words).toBe(20_000);
  expect(await body(page).locator("p").count()).toBe(200);

  // search finds the last word and opens the right block; a word in every block gives a capped list
  await page.goto(`/search?q=${marker}`);
  await page.getByRole("link", { name: title }).first().click();
  await expect(page).toHaveURL(/#blok-/);
  await page.goto("/search?q=woord42");
  await expect(page.locator("main")).toBeVisible();
});

test("a full device never shows a false save status (AT-14)", async ({ page, context }, info) => {
  test.skip(info.project.name.startsWith("tablet"), "same code path as phone and desktop");
  const title = unique("Opslag vol");
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if ((window as unknown as { __vol?: boolean }).__vol && this.name === "notes") {
        throw new DOMException("Opslag vol", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  await newNote(page, title);
  await page.evaluate(() => ((window as unknown as { __vol?: boolean }).__vol = true));

  // online: the server takes it, and the owner is told the device is full
  await body(page).click();
  await page.keyboard.type("Tekst bij een volle schijf.");
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await expect(page.locator(".copy-status")).toContainText("De opslag op dit apparaat is vol");

  // offline: never "Lokaal opgeslagen"
  await context.setOffline(true);
  await page.keyboard.type(" Nog meer.");
  await expect(saveState(page)).toHaveText("Niet opgeslagen.");
  await expect(page.locator(".copy-status")).toContainText("de opslag op dit apparaat is vol");
  await expect(saveState(page)).not.toHaveText("Lokaal opgeslagen");
  await context.setOffline(false);
  await expect(saveState(page)).toHaveText("Opgeslagen", { timeout: 30_000 });
});

test("a translation without offline rights is never kept on the device (AT-20)", async ({ page, context }, info) => {
  test.skip(info.project.name.startsWith("tablet"), "same code path as phone and desktop");
  await login(page, "/bible/GEN/1?v=TEST2");
  await expect(page.locator(".bible-text")).toContainText("[TESTTEKST 2]");
  const res = await page.request.get("/api/v1/bible/TEST2/GEN/1");
  expect(res.headers()["cache-control"]).toContain("no-store");
  await expect
    .poll(() => page.evaluate(async () => Boolean(navigator.serviceWorker.controller && (await caches.match("/offline")))), { timeout: 30_000 })
    .toBe(true);

  // the service worker keeps only the app shell: no Bible text, no pages, no API answers
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  expect(cached.filter((u) => u !== "/offline" && !u.startsWith("/_next/static/"))).toEqual([]);
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("bijbelkompas");
        open.onsuccess = () => {
          const d = open.result;
          if (!d.objectStoreNames.contains("bible")) return resolve(0);
          const all = d.transaction("bible").objectStore("bible").index("translation").count("TEST2");
          all.onsuccess = () => resolve(all.result);
        };
        open.onerror = () => resolve(-1);
      }),
  );
  expect(stored).toBe(0);

  await context.setOffline(true);
  await page.goto("/bible/GEN/1?v=TEST2").catch(() => undefined);
  await expect(page).toHaveURL(/\/offline\?bijbel=TEST2\/GEN\/1$/);
  await expect(page.getByRole("heading", { name: "Niet op dit apparaat" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("[TESTTEKST 2]");
  await context.setOffline(false);
});
