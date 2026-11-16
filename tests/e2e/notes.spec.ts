// Sprint 3: notes (BK-016, BK-017, BK-018, BK-021, BK-022, BK-023, BK-024). Uses only the fictitious e2e user and TEST text.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

async function newNote(page: Page, title: string) {
  await login(page, "/notes");
  await page.locator(".page-head").getByRole("link", { name: "Nieuwe notitie" }).click();
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
}

test("write a note; it saves by itself and survives a reload", async ({ page }) => {
  const title = unique("Overdenking");
  await newNote(page, title);
  await page.getByLabel("Soort").selectOption("overdenking");
  await body(page).click();
  await page.keyboard.type("De Heer is mijn herder.");
  await expect(saveState(page)).toHaveText("Wijzigingen…");
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await page.reload();
  await expect(body(page)).toContainText("De Heer is mijn herder.");
  await expect(page.getByLabel("Titel")).toHaveValue(title);
  await expect(page.getByLabel("Soort")).toHaveValue("overdenking");

  await page.goto("/notes");
  await page.getByLabel("Zoek op titel").fill(title);
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.locator(".note-list a")).toHaveCount(1);
  await expect(page.locator(".note-list")).toContainText("Overdenking");
});

test("insert a Bible reference, finish the note and restore an older version", async ({ page }) => {
  await newNote(page, unique("Studie"));
  const ref = page.getByLabel("Bijbelverwijzing invoegen");
  await ref.fill("Genesis 99:1");
  await page.getByRole("button", { name: "Invoegen" }).click();
  await expect(page.locator(".ref-form .field-error")).toBeVisible();

  await ref.fill("Genesis 1:1-2");
  await page.getByRole("button", { name: "Invoegen" }).click();
  await expect(body(page).locator(".ref-block")).toContainText("Genesis 1:1-2");
  await page.keyboard.type("Eerste gedachte.");
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await page.getByRole("button", { name: "Afronden" }).click();
  await expect(page.locator(".note-status-row .badge")).toHaveText("Afgerond");
  await expect(page.getByRole("link", { name: "1 versie" })).toBeVisible();

  // Change it afterwards, then put version 1 back.
  await body(page).locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Later toegevoegd.");
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await page.getByRole("button", { name: "Opslaan als versie" }).click();
  await expect(page.getByRole("link", { name: "2 versies" })).toBeVisible();

  await page.getByRole("link", { name: "2 versies" }).click();
  await expect(page.getByRole("heading", { name: "Versiegeschiedenis" })).toBeVisible();
  await expect(page.locator(".note-list li")).toHaveCount(2);
  await page.getByRole("link", { name: /Versie 1: Afgerond/ }).click();
  await expect(page.locator(".note-body.readonly")).toContainText("Eerste gedachte.");
  await expect(page.locator(".note-body.readonly")).not.toContainText("Later toegevoegd.");
  await page.getByRole("button", { name: "Deze versie terugzetten" }).click();

  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(body(page)).toContainText("Eerste gedachte.");
  await expect(body(page)).not.toContainText("Later toegevoegd.");
  await expect(page.locator(".note-status-row .badge")).toHaveText("Concept");
  await expect(page.getByRole("link", { name: "3 versies" })).toBeVisible();
});

test("a change made elsewhere is never overwritten: keep a conflict copy", async ({ page, context }) => {
  const title = unique("Conflict");
  await newNote(page, title);
  const url = page.url();

  const other = await context.newPage();
  await other.goto(url);
  await expect(body(other)).toBeVisible();

  await body(page).click();
  await page.keyboard.type("Tekst uit tabblad één.");
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await body(other).click();
  await other.keyboard.type("Tekst uit tabblad twee.");
  await expect(saveState(other)).toHaveText("Niet opgeslagen: conflict.");
  const alert = other.locator(".alert.error[role=alert]");
  await expect(alert).toContainText("niet overschreven");

  await alert.getByRole("button", { name: "Bewaar mijn tekst als conflictkopie" }).click();
  await expect(other).not.toHaveURL(url);
  await expect(other.getByLabel("Titel")).toHaveValue(`${title} (conflictkopie)`);
  await expect(body(other)).toContainText("Tekst uit tabblad twee.");

  // The original keeps the text of tab one.
  await page.reload();
  await expect(body(page)).toContainText("Tekst uit tabblad één.");
  await expect(body(page)).not.toContainText("Tekst uit tabblad twee.");
});

test("archive a note and bring it back", async ({ page }) => {
  const title = unique("Archief");
  await newNote(page, title);
  await page.getByRole("button", { name: "Archiveren" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.locator(".note-list")).not.toContainText(title);

  await page.getByRole("link", { name: "Archief bekijken" }).click();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByText("Deze notitie staat in het archief.")).toBeVisible();
  await page.getByRole("button", { name: "Terughalen uit archief" }).click();
  await expect(page.getByText("Deze notitie staat in het archief.")).toBeHidden();
});

test("from the reader: put verses in a new note and see it in the chapter", async ({ page }) => {
  await login(page, "/bible/GEN/2");
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  const bar = page.getByRole("region", { name: "Geselecteerde verzen" });
  await bar.getByRole("button", { name: "In notitie zetten" }).click();

  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(body(page).locator(".ref-block")).toContainText("Genesis 2:2");
  await expect(page.getByLabel("Soort")).toHaveValue("bijbelstudie");
  const title = unique("Uit de lezer");
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");

  await body(page).locator(".ref-block").getByRole("link", { name: "Lees" }).click();
  await expect(page).toHaveURL(/\/bible\/GEN\/2/);
  const notes = page.getByRole("region", { name: "Notities bij dit hoofdstuk" });
  await expect(notes.getByRole("link", { name: title })).toBeVisible();
  await expect(page.locator('.verse[data-verse="2"] .note-dot')).toBeVisible();
});
