// Sprint 6: verse links on text blocks and the data export (BK-030, BK-031, BK-032, BK-054; AT-02).
// Fictitious user and TEST text only.
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const { unzipSync, strFromU8 } = createRequire(path.resolve(__dirname, "../../apps/web/package.json"))("fflate") as typeof import("fflate");

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

async function newNote(page: Page, title: string) {
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
}

test("link a paragraph to a verse; the link stays with its text and shows up in the reader (AT-02)", async ({ page }) => {
  const title = unique("Koppeling");
  await newNote(page, title);
  await body(page).click();
  await page.keyboard.type("Inleiding.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("De Geest zweefde over de wateren.");

  // the cursor is in the second paragraph: link it to Genesis 1:2
  await page.getByLabel("Bijbelverwijzing invoegen").fill("Gen 1:2");
  await page.getByRole("button", { name: "Koppel aan alinea" }).click();
  const links = page.getByRole("group", { name: "Koppelingen van deze alinea" });
  await expect(links.getByRole("link", { name: "Genesis 1:2" })).toBeVisible();
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await expect(body(page)).toBeFocused(); // the editor takes focus back one animation frame later

  // change the text ABOVE it and add a block in between: the link stays with "De Geest zweefde"
  await body(page).locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Aangevuld.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Tussenregel.");
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await page.reload();
  const linked = body(page).locator("[data-passage-labels]");
  await expect(linked).toHaveCount(1);
  await expect(linked).toHaveAttribute("data-passage-labels", "Genesis 1:2");
  await expect(linked).toHaveText("De Geest zweefde over de wateren.");

  // remove and re-add through the chips
  await linked.click();
  await links.getByRole("button", { name: "Koppeling Genesis 1:2 verwijderen" }).click();
  await expect(body(page).locator("[data-passage-labels]")).toHaveCount(0);
  await expect(body(page)).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(body(page).locator("[data-passage-labels]")).toHaveCount(1);
  await expect(saveState(page)).toHaveText("Opgeslagen");

  // BK-031: in the reader, the verse shows this note and the linked paragraph
  await page.goto("/bible/GEN/1");
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  const found = page.getByRole("region", { name: "Notities bij deze verzen" });
  await expect(found.getByRole("link", { name: title })).toBeVisible();
  await expect(found).toContainText("De Geest zweefde over de wateren.");
  await found.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}#blok-[0-9a-f-]{36}$/);
  // the found block is marked with a style rule (see the editor); <style> text is read via evaluate
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll("style")].some((s) => s.textContent?.includes("animation: found"))))
    .toBe(true);
});

test("export everything as a zip with JSON and Markdown (BK-054)", async ({ page }) => {
  const title = unique("Exporteer mij");
  await newNote(page, title);
  await body(page).click();
  await page.keyboard.type("Tekst voor de export.");
  await page.getByRole("button", { name: "Opslaan als versie" }).click();
  await expect(page.getByRole("link", { name: "1 versie" })).toBeVisible();

  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Alles exporteren" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^bijbelkompas-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const bytes = await (await import("node:fs/promises")).readFile(await download.path());
  const files = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(["LEESMIJ.md", "bijbelkompas.json"]));

  const data = JSON.parse(strFromU8(files["bijbelkompas.json"]!));
  expect(data).toMatchObject({ format: "bijbelkompas-export", version: 1 });
  expect(Array.isArray(data.collections) && Array.isArray(data.questions)).toBe(true); // Sprint 7 (ADR-008)
  const note = data.notes.find((n: { title: string }) => n.title === title);
  expect(note.revisions).toHaveLength(1);
  expect(JSON.stringify(note.document)).toContain("Tekst voor de export.");
  const md = Object.entries(files).find(([name, f]) => name.startsWith("notities/") && strFromU8(f).startsWith(`# ${title}`));
  expect(md).toBeTruthy();
  expect(strFromU8(md![1])).toContain("Tekst voor de export.");
});

test("the export needs a signed-in owner", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const res = await anon.get("/api/v1/export", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
  await anon.dispose();
});
