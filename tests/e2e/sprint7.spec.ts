// Sprint 7: collections, research questions and the timeline (BK-047..BK-053). Fictitious user and TEST text only.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, newDevice, openNoteDetails } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const saveState = (page: Page) => page.locator(".save-state");

async function noSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** A new note (already signed in); returns its id. */
async function newNote(page: Page, title: string, date?: string) {
  await page.goto("/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  if (date) {
    await openNoteDetails(page);
    await page.getByLabel("Datum").fill(date);
  }
  await expect(saveState(page)).toHaveText("Opgeslagen");
  return page.url().split("/").pop()!;
}

async function newCollection(page: Page, name: string, type = "Dossier") {
  await page.goto("/collections");
  await page.getByText("Nieuwe collectie", { exact: true }).click();
  await page.getByLabel("Naam").fill(name);
  await page.getByLabel("Soort").selectOption({ label: type });
  await page.getByRole("button", { name: "Collectie maken" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/").pop()!;
}

async function addNote(page: Page, title: string) {
  await page.getByLabel("Notitie toevoegen").selectOption({ label: title });
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await expect(page.locator(".collection-items").getByRole("link", { name: title })).toBeVisible();
}

test("collections: nested, ordered, and one note in several collections without copies (BK-047, BK-048)", async ({ page }) => {
  await login(page, "/dashboard");
  const first = unique("Preek een");
  const second = unique("Preek twee");
  const firstId = await newNote(page, first);
  await newNote(page, second);

  const serie = unique("Serie");
  const serieId = await newCollection(page, serie, "Preekserie");
  await addNote(page, first);
  await addNote(page, second);
  const items = page.locator(".collection-items li");
  await expect(items.first()).toContainText(first);

  // order: move the second note up
  await page.getByRole("button", { name: `${second} omhoog` }).click();
  await expect(items.first()).toContainText(second);
  await expect(page.getByRole("status").filter({ hasText: "staat nu op plaats 1" })).toBeAttached();
  await page.reload();
  await expect(page.locator(".collection-items li").first()).toContainText(second);
  await noSeriousViolations(page);

  // a subcollection; a collection can never be put under its own subcollection
  await page.getByRole("link", { name: "Subcollectie maken" }).click();
  const deel = unique("Deel");
  await page.getByLabel("Naam").fill(deel);
  await expect(page.getByLabel("Onderdeel van")).toHaveValue(serieId);
  await page.getByRole("button", { name: "Collectie maken" }).click();
  await expect(page.getByRole("heading", { level: 1, name: deel })).toBeVisible();
  await expect(page.locator(".crumb")).toContainText(serie);
  await page.goto(`/collections/${serieId}`);
  await expect(page.getByRole("region", { name: "Subcollecties" }).getByRole("link", { name: new RegExp(deel) })).toBeVisible();
  await page.getByRole("button", { name: "Collectie bewerken" }).click();
  await expect(page.getByLabel("Onderdeel van").locator("option", { hasText: deel })).toHaveCount(0);
  await page.getByRole("button", { name: "Annuleren" }).click();

  // the same note also goes into a theme, from the note page; nothing is copied
  const thema = unique("Genade");
  await newCollection(page, thema, "Thema");
  await page.goto(`/notes/${firstId}`);
  await page.locator(".note-relations summary").click();
  await page.getByRole("checkbox", { name: thema }).check();
  await expect(page.getByRole("status").filter({ hasText: `Toegevoegd aan ${thema}.` })).toBeAttached();
  await page.goto("/collections");
  await expect(page.getByRole("link", { name: new RegExp(`^${thema}`) })).toContainText("1 notitie");
  await page.goto("/notes");
  await expect(page.getByRole("link", { name: new RegExp(first) })).toHaveCount(1);

  // removing it from the series leaves the note alone
  await page.goto(`/collections/${serieId}`);
  await page.getByRole("button", { name: `${first} uit deze collectie halen` }).click();
  await expect(page.locator(".collection-items").getByRole("link", { name: first })).toHaveCount(0);
  await page.goto(`/notes/${firstId}`);
  await expect(page.getByLabel("Titel")).toHaveValue(first);
});

test("research questions: link verses and notes, answer by hand (BK-049, BK-050, BK-051)", async ({ page }) => {
  await login(page, "/dashboard");
  const noteTitle = unique("Over het licht");
  const noteId = await newNote(page, noteTitle);

  const question = unique("Wat betekent licht in Genesis 1");
  await page.goto("/questions");
  await page.getByText("Nieuwe vraag", { exact: true }).click();
  await page.getByLabel("Vraag", { exact: true }).fill(question);
  await page.getByRole("button", { name: "Vraag bewaren" }).click();
  await expect(page.getByRole("heading", { level: 1, name: question })).toBeVisible();
  await expect(page.locator(".badge").first()).toHaveText("Open");

  await page.getByLabel("Bijbelgedeelte koppelen").fill("Gen 1:2-3");
  await page.getByRole("button", { name: "Koppel gedeelte" }).click();
  await expect(page.getByRole("link", { name: "Genesis 1:2-3" })).toBeVisible();
  await page.getByLabel("Bijbelgedeelte koppelen").fill("Gen 99");
  await page.getByRole("button", { name: "Koppel gedeelte" }).click();
  await expect(page.locator(".field-error")).toContainText("Genesis heeft");

  await page.getByLabel("Notitie koppelen").selectOption({ label: noteTitle });
  await page.getByRole("button", { name: "Koppel notitie" }).click();
  await expect(page.getByRole("link", { name: noteTitle })).toBeVisible();
  await noSeriousViolations(page);

  // only the owner closes a question, with their own answer
  await page.getByLabel("Status").selectOption({ label: "Beantwoord" });
  await page.getByLabel("Mijn antwoord").fill("Licht is het eerste wat God schept.");
  await page.getByRole("button", { name: "Vraag opslaan" }).click();
  await expect(page.locator(".badge").first()).toHaveText("Beantwoord");
  await expect(page.locator("article > .note-list-meta")).toContainText("beantwoord op");
  await page.reload();
  await expect(page.getByLabel("Mijn antwoord")).toHaveValue("Licht is het eerste wat God schept.");

  await page.goto("/questions?status=beantwoord");
  await expect(page.getByRole("link", { name: new RegExp(question) })).toBeVisible();

  // the question shows up in the reader and on the note
  await page.goto("/bible/GEN/1");
  await expect(page.getByRole("region", { name: "Vragen bij dit hoofdstuk" }).getByRole("link", { name: question })).toBeVisible();
  await page.goto(`/notes/${noteId}`);
  await expect(page.locator(".note-relations")).toContainText(question);
});

test("timeline: sorted on the event date, with writing dates apart, filtered by collection (BK-052, BK-053)", async ({ page }) => {
  await login(page, "/dashboard");
  const older = unique("Kerst");
  const newer = unique("Pasen");
  await newNote(page, newer, "2025-04-20");
  await newNote(page, older, "2019-12-25"); // written later, but about an earlier day
  const name = unique("Feestdagen");
  const id = await newCollection(page, name);
  await addNote(page, newer);
  await addNote(page, older);

  await page.goto("/timeline");
  // Ronde 3: on narrow screens the filters sit behind "Filters"
  if ((page.viewportSize()?.width ?? 0) < 900) await page.locator("details.list-filters > summary").click();
  await page.getByLabel("Thema of collectie").selectOption({ label: name });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(new RegExp(`collectie=${id}`));
  const entries = page.locator(".timeline li");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText(newer);
  await expect(entries.nth(1)).toContainText(older);
  await expect(page.getByRole("heading", { level: 2, name: "2019" })).toBeVisible();
  await expect(entries.nth(1).locator(".timeline-date")).toContainText("25 december 2019");
  await expect(entries.nth(1).locator(".timeline-written")).toContainText("Geschreven op");

  await page.getByLabel("Vanaf").fill("2020-01-01");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText(newer);
  await noSeriousViolations(page);
});

test("a collection can be kept offline on a device", async ({ page, browser }, info) => {
  await login(page, "/dashboard");
  const title = unique("Voor onderweg");
  const noteId = await newNote(page, title);
  const name = unique("Onderweg");
  const id = await newCollection(page, name);
  await addNote(page, title);

  // a second device keeps that collection offline
  const ctx = await newDevice(browser, info);
  const other = await ctx.newPage();
  await login(other, `/collections/${id}`);
  await other.getByLabel("Deze collectie offline beschikbaar houden").check();
  await expect
    .poll(
      () =>
        other.evaluate(
          ([cid, nid]) =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open("bijbelkompas");
              open.onsuccess = () => {
                const tx = open.result.transaction(["meta", "notes"]);
                const meta = tx.objectStore("meta").get("meta");
                const note = tx.objectStore("notes").get(nid!);
                tx.oncomplete = () => {
                  const pinned = (meta.result?.pinnedCollections ?? {})[cid!];
                  resolve(Boolean(pinned?.noteIds?.includes(nid) && note.result?.server));
                };
              };
              open.onerror = () => resolve(false);
            }),
          [id, noteId],
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await other.reload();
  await expect(other.getByLabel("Deze collectie offline beschikbaar houden")).toBeChecked();
  await other.goto("/offline");
  await expect(other.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await ctx.close();
});
