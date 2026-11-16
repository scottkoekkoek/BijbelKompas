// Sprint 4: sermon details (BK-019), templates (BK-020), keyword search (BK-034, BK-035, BK-038).
// Uses only the fictitious e2e user and the fictitious TEST text.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const word = () => `zoekwoord${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

test("make an own template and start a note from it", async ({ page }) => {
  const name = unique("Mijn opzet");
  await login(page, "/templates");
  await page.getByRole("link", { name: "Nieuw sjabloon" }).click();
  await page.getByLabel("Naam").fill(name);
  await page.getByLabel("Soort notitie").selectOption("overdenking");
  await page.getByLabel("Onderdeel 1: Kop").fill("Inleiding");
  await page.getByLabel("Soort onderdeel").selectOption("bijbelverwijzing");
  await page.getByRole("button", { name: "Onderdeel toevoegen" }).click();
  await page.getByLabel("Onderdeel 2: Bijbelverwijzing").fill("Genesis 1:1-2");
  await page.getByLabel("Soort onderdeel").selectOption("gebed");
  await page.getByRole("button", { name: "Onderdeel toevoegen" }).click();
  await page.getByRole("button", { name: "Onderdeel 3 omhoog" }).click();
  await page.getByRole("button", { name: "Sjabloon bewaren" }).click();

  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator(".note-list")).toContainText(name);

  await page.goto("/notes/new");
  await page.getByRole("button", { name: `Begin met ${name}`, exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Soort")).toHaveValue("overdenking");
  const blocks = body(page);
  await expect(blocks.locator("h2").first()).toHaveText("Inleiding");
  await expect(blocks.locator("h3")).toHaveText("Gebed");
  await expect(blocks.locator(".ref-block")).toContainText("Genesis 1:1-2");
  // order: Inleiding, Gebed (moved up), then the reference
  const order = await blocks.locator("h2, h3, .ref-block").allTextContents();
  expect(order[0]).toBe("Inleiding");
  expect(order[1]).toBe("Gebed");
  await expect(saveState(page)).toHaveText("Opgeslagen");
});

test("copy a built-in template, edit it and archive it", async ({ page }) => {
  await login(page, "/templates");
  await page.getByRole("link", { name: "Kopiëren als eigen sjabloon: Bijbelstudie" }).click();
  const name = unique("Studie-opzet");
  await page.getByLabel("Naam").fill(name);
  await page.getByRole("button", { name: "Onderdeel 1 verwijderen" }).click();
  await page.getByRole("button", { name: "Sjabloon bewaren" }).click();
  await expect(page.locator(".note-list")).toContainText(name);

  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.locator(".part-row")).toHaveCount(5);
  await page.getByRole("button", { name: "Archiveren" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator("main")).not.toContainText(name);
  await page.getByRole("link", { name: "Gearchiveerde sjablonen" }).click();
  await expect(page.locator(".note-list")).toContainText(name);
});

test("a template without a name is refused with a clear message", async ({ page }) => {
  await login(page, "/templates/new");
  await page.getByRole("button", { name: "Sjabloon bewaren" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Geef het sjabloon een naam" })).toBeVisible();
});

test("sermon details are saved with the note and help to search", async ({ page }) => {
  const speaker = unique("Ds. Testpredikant");
  const w = word();
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Begin met Preek", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("group", { name: "Preekgegevens" })).toBeVisible();
  await page.getByLabel("Spreker").fill(speaker);
  await page.getByLabel("Kerk of gemeente").fill("Fictieve Kerk");
  await page.getByLabel("Dienst").fill("Ochtenddienst");
  await page.getByLabel("Titel").fill(unique("Preek"));
  await body(page).locator("p").first().click();
  await page.keyboard.type(`Over ${w} gesproken.`);
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await page.reload();
  await expect(page.getByLabel("Spreker")).toHaveValue(speaker);
  await expect(page.getByLabel("Dienst")).toHaveValue("Ochtenddienst");

  await page.goto(`/search?q=${w}&spreker=${encodeURIComponent(speaker)}`);
  await expect(page.locator(".search-results li")).toHaveCount(1);
  await page.goto(`/search?q=${w}&spreker=${encodeURIComponent("Iemand anders")}`);
  await expect(page.locator(".search-results li")).toHaveCount(0);
  await expect(page.getByText("Geen notities gevonden met deze filters.")).toBeVisible();
});

test("search finds a note and opens it at the right block", async ({ page }) => {
  const w = word();
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await page.getByLabel("Titel").fill(unique("Lange notitie"));
  await body(page).click();
  for (let i = 1; i <= 30; i++) {
    await page.keyboard.type(`Alinea ${i}.`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type(`Hier staat het ${w} helemaal onderaan.`);
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await page.goto("/search");
  await page.getByLabel("Zoekwoorden").fill(w.slice(0, -2)); // prefix search
  await page.getByRole("button", { name: "Zoeken" }).click();
  const results = page.getByRole("region", { name: /Notities/ });
  await expect(results.locator("li")).toHaveCount(1);
  await expect(results.locator("mark")).toContainText(w);
  await results.locator("li a").click();

  await expect(page).toHaveURL(/#blok-[0-9a-f-]{36}$/);
  const blockId = new URL(page.url()).hash.slice("#blok-".length);
  const found = body(page).locator(`[data-block-id="${blockId}"]`);
  await expect(found).toContainText(w);
  await expect(found).toBeInViewport();
  // briefly marked
  await expect
    .poll(() => page.evaluate((id) => [...document.querySelectorAll("style")].some((el) => el.textContent?.includes(id)), blockId))
    .toBe(true);
});

test("search also finds Bible text and links to the verse", async ({ page }) => {
  await login(page, "/search?q=fictieve");
  const bible = page.getByRole("region", { name: /Bijbel/ });
  await expect(bible.locator("li").first()).toContainText("Genesis 1:1");
  await bible.getByRole("link", { name: "Genesis 1:1" }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/1\?v=TEST#v1$/);
  await expect(page.locator("#v1")).toBeVisible();
});
