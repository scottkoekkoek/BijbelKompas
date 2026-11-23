// Feature 4: the reading view of a finished sermon. Fictitious user and TEST text only.
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const text = (t: string) => [{ type: "text", text: t }];
const ref = (translation: string, startVerse: number, endVerse: number) => ({
  translation, book: "GEN", startChapter: 1, startVerse, endChapter: 1, endVerse, label: `Genesis 1:${startVerse}${endVerse !== startVerse ? `-${endVerse}` : ""}`,
});
const para = (t: string, extra: Record<string, unknown> = {}) => ({ type: "paragraph", attrs: { blockId: randomUUID(), ...extra }, content: text(t) });

async function noteJson(page: Page, id: string) {
  const r = await page.request.get(`/api/v1/notes/${id}`);
  expect(r.ok()).toBe(true);
  return (await r.json()) as { status: string; currentRevision: number; documentVersion: number; title: string };
}

/** A sermon note through the API, saved as finished (or left as concept). */
async function sermon(page: Page, title: string, content: unknown[], finish = true) {
  const created = await page.request.post("/api/v1/notes", { data: { title, noteType: "preek" } });
  expect(created.status()).toBe(201);
  const note = (await created.json()) as { id: string; documentVersion: number };
  const saved = await page.request.put(`/api/v1/notes/${note.id}`, {
    data: {
      baseVersion: note.documentVersion, title, noteType: "preek", eventDate: null,
      document: { type: "doc", content }, ...(finish ? { reason: "afronden", status: "afgerond" } : {}),
    },
  });
  expect(saved.ok()).toBe(true);
  return note.id;
}

const filler = Array.from({ length: 14 }, (_, i) => para(`Alinea ${i + 1} van de preek. ${"Een rustige zin om te lezen tijdens de dienst. ".repeat(4)}`));

test("a finished sermon opens in a calm reading view that changes nothing (feature 4)", async ({ page }) => {
  await login(page, "/dashboard");
  const title = unique("Preek over het licht");
  const id = await sermon(page, title, [
    { type: "bibleReference", attrs: { blockId: randomUUID(), ...ref("TEST", 1, 2) } },
    { type: "heading", attrs: { blockId: randomUUID(), level: 2 }, content: text("Eerste punt") },
    para("Het licht komt eerst.", { passages: [ref("TEST", 3, 3)] }),
    { type: "bulletList", attrs: { blockId: randomUUID() }, content: [{ type: "listItem", content: [{ type: "paragraph", content: text("Een opsomming") }] }] },
    { type: "blockquote", attrs: { blockId: randomUUID() }, content: [{ type: "paragraph", content: text("Een citaat uit de preek") }] },
    { type: "bibleReference", attrs: { blockId: randomUUID(), ...ref("HSV", 1, 1) } },
    ...filler,
    { type: "heading", attrs: { blockId: randomUUID(), level: 2 }, content: text("Slot") },
    { type: "bibleReference", attrs: { blockId: randomUUID(), ...ref("TEST", 3, 3) } },
    para("Tot slot."),
  ]);
  const before = await noteJson(page, id);

  // a finished sermon opens straight in the reading view (Ronde 3 §2); the old address still works
  await page.goto(`/notes/${id}/preek`);
  await expect(page).toHaveURL(new RegExp(`/notes/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const view = page.locator(".sermon-text");
  await expect(view.getByRole("heading", { level: 2, name: "Eerste punt" })).toBeVisible();
  await expect(view.locator("li")).toHaveText("Een opsomming");
  await expect(view.locator("blockquote")).toHaveText("Een citaat uit de preek");
  await expect(view.getByRole("link", { name: "Genesis 1:1-2 lezen" })).toBeVisible();

  // A− and A+, kept after a reload; never wider than the screen
  const size = () => view.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const start = await size();
  await page.getByRole("button", { name: "A+ groter" }).click();
  await expect.poll(size).toBeGreaterThan(start);
  const bigger = await size();
  await page.reload();
  await expect.poll(size).toBe(bigger);
  await page.getByRole("button", { name: "A+ groter" }).click();
  await page.getByRole("button", { name: "A+ groter" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "A− kleiner" }).click();
  await page.getByRole("button", { name: "A− kleiner" }).click();
  await page.getByRole("button", { name: "A− kleiner" }).click();
  await expect.poll(size).toBe(start);

  // the passage: beside the text on a wide screen, behind "Bijbelgedeelte" on a phone
  const toggle = page.getByRole("button", { name: "Bijbelgedeelte" });
  const panel = page.getByRole("complementary", { name: "Bijbelgedeelte" });
  if (await toggle.isVisible()) {
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Genesis 1:1-2");
  await expect(panel.locator(".sermon-verses p")).toHaveCount(2);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  // more than one passage: choose; a reference-only translation shows no text, only the link
  const choose = panel.getByLabel("Kies gedeelte");
  await expect(choose.locator("option")).toHaveCount(3);
  await choose.selectOption({ label: "Genesis 1:1 (HSV)" });
  await expect(panel).toContainText("tonen we alleen de verwijzing");
  await expect(panel.locator(".sermon-verses")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: /HSV op externe website/ })).toHaveAttribute("target", "_blank");
  await choose.selectOption({ label: "Genesis 1:1-2 (TEST)" });

  // "Open in Bijbel" opens the exact verses, with a way back to the sermon
  await panel.getByRole("link", { name: "Open in Bijbel" }).click();
  await expect(page).toHaveURL(new RegExp(`/bible/GEN/1\\?v=TEST&vers=1-2&terug=%2Fnotes%2F${id}#v1$`));
  await expect(page.locator("#v1")).toHaveClass(/target/);
  await page.getByRole("link", { name: `Terug naar ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${id}$`));

  // a passage far down in the sermon: back from the reader at the same place
  const late = page.locator(".sermon-text").getByRole("link", { name: "Genesis 1:3 lezen" });
  await page.waitForTimeout(1500); // past the moment the view still restores the earlier place
  await late.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const place = await page.evaluate(() => window.scrollY);
  expect(place).toBeGreaterThan(200);
  await late.click();
  await expect(page).toHaveURL(/\/bible\/GEN\/1\?v=TEST&vers=3&terug=/);
  await page.getByRole("link", { name: `Terug naar ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${id}$`));
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeGreaterThan(place - 60);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(place + 60);

  // editing is an explicit step
  await page.getByRole("link", { name: "Bewerken" }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${id}\\?bewerken=1$`));
  await expect(page.getByLabel("Titel")).toHaveValue(title);

  // reading and the font size changed nothing about the note
  const after = await noteJson(page, id);
  expect({ status: after.status, revision: after.currentRevision, version: after.documentVersion }).toEqual({
    status: before.status, revision: before.currentRevision, version: before.documentVersion,
  });
});

test("only a finished sermon has the view; one without a passage reads in full (feature 4)", async ({ page }) => {
  await login(page, "/dashboard");
  const draft = await sermon(page, unique("Preek in concept"), [para("Nog niet af.")], false);
  await page.goto(`/notes/${draft}`);
  await expect(page.getByLabel("Titel")).toBeVisible(); // a draft opens in the editor
  await expect(page.getByRole("link", { name: "Naar leesweergave" })).toHaveCount(0);
  await page.goto(`/notes/${draft}/preek`);
  await expect(page.getByText("De preekweergave opent zodra de preek is afgerond.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terug naar notitie" })).toHaveAttribute("href", `/notes/${draft}`);

  const plain = await sermon(page, unique("Preek zonder tekstverwijzing"), [para("Alleen eigen woorden."), para("En nog een alinea.")]);
  await page.goto(`/notes/${plain}/preek`);
  await expect(page.locator(".sermon-text p")).toHaveText(["Alleen eigen woorden.", "En nog een alinea."]);
  await expect(page.getByRole("button", { name: "Bijbelgedeelte" })).toHaveCount(0);
  await expect(page.locator(".sermon-passage")).toHaveCount(0);
});
