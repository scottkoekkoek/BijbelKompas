// Features 1, 2, 3 and 5: "Mijn studie bij dit vers", a quick note, a question from a verse, and
// search by Bible passage. Fictitious user and TEST text only (Genesis 1:1-3 in TEST).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const saveState = (page: Page) => page.locator(".save-state");
const selectionBar = (page: Page) => page.getByRole("region", { name: "Geselecteerde verzen" });

async function select(page: Page, ...verses: number[]) {
  await page.goto("/bible/GEN/1?v=TEST");
  for (const v of verses) await page.getByRole("button", { name: `Vers ${v} selecteren` }).click();
}

/** A note linked to these verses through "In notitie zetten". */
async function noteOn(page: Page, title: string, ...verses: number[]) {
  await select(page, ...verses);
  await selectionBar(page).getByRole("button", { name: "In notitie zetten" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
}

test("from a verse: my study, a question, and search by passage (features 1, 3, 5)", async ({ page }) => {
  await login(page, "/dashboard");
  const overlapping = unique("Studie 1-2");
  const other = unique("Alleen vers 3");
  await noteOn(page, overlapping, 1, 2);
  await noteOn(page, other, 3);

  // 1: verse 2 finds the note on 1-2 (partial overlap) once, and not the one on verse 3
  await select(page, 2);
  await selectionBar(page).getByRole("button", { name: "Mijn studie", exact: true }).click();
  const study = page.getByRole("dialog", { name: "Mijn studie bij Genesis 1:2" });
  await expect(study.getByRole("link", { name: new RegExp(overlapping) })).toHaveCount(1);
  await expect(study).not.toContainText(other);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(study).toBeHidden();
  await expect(selectionBar(page)).toContainText("Genesis 1:2"); // same selection after closing

  // 3: cancelling makes nothing; an empty question is refused; a saved one is Open and linked
  const question = unique("Wat betekent de wind");
  await selectionBar(page).getByRole("button", { name: "Stel een vraag" }).click();
  let ask = page.getByRole("dialog", { name: "Stel een vraag" });
  await ask.getByLabel("Je vraag").fill(`${question} (geannuleerd)`);
  await ask.getByRole("button", { name: "Annuleren" }).click();
  await expect(ask).toBeHidden();
  await selectionBar(page).getByRole("button", { name: "Stel een vraag" }).click();
  ask = page.getByRole("dialog", { name: "Stel een vraag" });
  await expect(ask.getByLabel("Je vraag")).toHaveValue("");
  await ask.getByRole("button", { name: "Vraag bewaren" }).click();
  await expect(ask.getByRole("status")).toHaveText("Schrijf eerst je vraag op.");
  await ask.getByLabel("Je vraag").fill(question);
  await ask.getByRole("button", { name: "Vraag bewaren" }).click();
  await expect(ask.getByRole("status")).toHaveText("Vraag bewaard met status Open.");
  await ask.getByRole("button", { name: "Verder lezen" }).click();
  await expect(selectionBar(page)).toContainText("Genesis 1:2");

  await selectionBar(page).getByRole("button", { name: "Mijn studie", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: new RegExp(question) })).toContainText("Open · Genesis 1:2");
  await page.keyboard.press("Escape");

  const all = (await (await page.request.get("/api/v1/questions")).json()).questions as { title: string }[];
  expect(all.filter((q) => q.title.startsWith(question)).map((q) => q.title)).toEqual([question]);
  await page.goto("/questions?status=open");
  await expect(page.getByRole("link", { name: new RegExp(question) })).toBeVisible();

  // 5: search by passage, grouped, each once; a whole chapter finds all three
  await page.goto("/search?q=Gen%201%3A2");
  const hit = page.locator(".passage-hit");
  await expect(hit.getByRole("region", { name: /Notities/ }).getByRole("link", { name: new RegExp(overlapping) })).toHaveCount(1);
  await expect(hit.getByRole("region", { name: /Onderzoeksvragen/ }).getByRole("link", { name: new RegExp(question) })).toBeVisible();
  await expect(hit).not.toContainText(other);
  await page.goto("/search?q=Genesis%201");
  for (const t of [overlapping, other, question]) await expect(page.locator(".passage-hit").getByRole("link", { name: new RegExp(t) })).toBeVisible();
  await page.goto("/search?q=Openbaring%2022%3A21");
  await expect(page.locator(".passage-hit")).toContainText("Je hebt nog geen notities of vragen aan dit gedeelte gekoppeld.");
});

test("a quick note from a verse and from Home is one concept, cancelling makes none (feature 2)", async ({ page }) => {
  await login(page, "/dashboard");
  const text = unique("Snelle gedachte");

  // cancel: nothing is made
  await select(page, 1);
  await selectionBar(page).getByRole("button", { name: "Snelle aantekening" }).click();
  let quick = page.getByRole("dialog", { name: "Snelle aantekening" });
  await expect(quick).toContainText("Genesis 1:1");
  await quick.getByLabel("Aantekening").fill(`${text} geannuleerd`);
  await quick.getByRole("button", { name: "Annuleren" }).click();

  // empty is refused; a double tap makes one concept with the passage
  await selectionBar(page).getByRole("button", { name: "Snelle aantekening" }).click();
  quick = page.getByRole("dialog", { name: "Snelle aantekening" });
  await quick.getByRole("button", { name: "Bewaar als concept" }).click();
  await expect(quick.getByRole("status")).toHaveText("Schrijf eerst iets op.");
  await quick.getByLabel("Aantekening").fill(`${text}\nTweede regel`);
  await quick.getByRole("button", { name: "Bewaar als concept" }).dblclick();
  await expect(quick.getByRole("status")).toHaveText("Opgeslagen als concept in Notities.", { timeout: 20_000 });

  const notes = (await (await page.request.get(`/api/v1/notes?q=${encodeURIComponent(text)}`)).json()).notes as { id: string; title: string; status: string }[];
  expect(notes.map((n) => [n.title, n.status])).toEqual([[text, "concept"]]);
  const note = await (await page.request.get(`/api/v1/notes/${notes[0]!.id}`)).json();
  expect(JSON.stringify(note.document)).toContain("Genesis 1:1");
  expect(JSON.stringify(note.document)).toContain("Tweede regel");

  // it opens in the normal editor
  await quick.getByRole("link", { name: "Open in de editor" }).click();
  await expect(page.locator(".note-body[contenteditable='true']")).toContainText("Tweede regel");

  // from Home, without a passage
  const home = unique("Thuis genoteerd");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Snelle aantekening" }).click();
  quick = page.getByRole("dialog", { name: "Snelle aantekening" });
  await quick.getByLabel("Aantekening").fill(home);
  await quick.getByRole("button", { name: "Bewaar als concept" }).click();
  await expect(quick.getByRole("status")).toHaveText("Opgeslagen als concept in Notities.", { timeout: 20_000 });
  const homeNotes = (await (await page.request.get(`/api/v1/notes?q=${encodeURIComponent(home)}`)).json()).notes as unknown[];
  expect(homeNotes).toHaveLength(1);
  const cancelled = (await (await page.request.get(`/api/v1/notes?q=${encodeURIComponent(`${text} geannuleerd`)}`)).json()).notes as unknown[];
  expect(cancelled).toHaveLength(0);
});

test("the study route refuses visitors who are not signed in", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  expect((await anon.get("/api/v1/passages/study?translation=TEST&book=GEN&chapter=1&from=1&to=2", { maxRedirects: 0 })).status()).toBe(401);
  await anon.dispose();
});
