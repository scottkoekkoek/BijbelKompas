// Sprint 12: questions to your notes with checked sources, automatic analysis and outdated
// suggestions (BK-042, BK-043, BK-046; AT-11). Only the local, fictitious test provider: nothing
// is sent anywhere. Fictitious user and TEST text only.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

async function prefs(page: Page, aiEnabled: boolean, autoAnalysis = false) {
  const res = await page.request.patch("/api/v1/me/preferences", { data: { aiEnabled, autoAnalysis: aiEnabled && autoAnalysis } });
  expect(res.ok()).toBe(true);
}

/** A note from the reader with Genesis 1:1 in it and some own text; returns its id. */
async function noteAboutGenesis(page: Page, title: string, text: string) {
  await page.goto("/bible/GEN/1?v=TEST");
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await page.getByRole("region", { name: "Geselecteerde verzen" }).getByRole("button", { name: "In notitie zetten" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await body(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
  await expect(saveState(page)).toHaveText("Opgeslagen");
  return page.url().split("/").pop()!;
}

test.afterEach(async ({ page }) => {
  await prefs(page, false).catch(() => undefined);
});

test("a question to your notes gets checked sources, or says it found nothing (BK-042, BK-043, AT-11)", async ({ page }) => {
  await login(page, "/dashboard");
  const word = `kompaswoord${tag()}`;
  const title = `Vraagnotitie ${tag()}`;
  await prefs(page, false);
  const id = await noteAboutGenesis(page, title, `Over ${word} schreef ik dit. Een tweede zin.`);

  // AI off: no question box, and the API refuses
  await page.goto(`/search?q=${word}`);
  await expect(page.getByRole("link", { name: title })).toBeVisible(); // plain search works without AI
  await expect(page.getByRole("heading", { name: "Vraag het je notities" })).toHaveCount(0);
  expect((await page.request.post("/api/v1/ai/ask", { data: { question: word } })).status()).toBe(403);

  await prefs(page, true);
  await page.reload();
  const ask = page.locator(".ask-notes");
  await expect(ask).toContainText("Testaanbieder: er gaat niets naar buiten.");
  await expect(ask.getByLabel("Je vraag")).toHaveValue(word);
  await ask.getByRole("button", { name: "Vraag stellen" }).click();
  await expect(ask.getByRole("status")).toHaveText("Antwoord ontvangen.");
  const source = ask.locator(".ai-sources li").first();
  await expect(source.locator("blockquote")).toHaveText(`Over ${word} schreef ik dit.`);
  await expect(ask).not.toContainText("Onzeker");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  // the same question about the same text pays nothing
  await ask.getByRole("button", { name: "Vraag stellen" }).click();
  await expect(ask.getByRole("status")).toHaveText("Deze vraag is al eens beantwoord; er is niets opnieuw betaald.");

  // the source opens the note at that paragraph
  await source.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${id}#blok-[0-9a-f-]{36}$`));

  // nothing about it in the notes: uncertain, and no source is made up
  await page.goto("/search");
  await page.locator(".ask-notes").getByLabel("Je vraag").fill(`onbekendwoord${tag()}`);
  await page.locator(".ask-notes").getByRole("button", { name: "Vraag stellen" }).click();
  await expect(page.locator(".ai-answer")).toContainText("Onzeker");
  await expect(page.locator(".ai-answer")).toContainText("Geen bron gevonden. Er is niets verzonnen.");
  await expect(page.locator(".ai-sources")).toHaveCount(0);
});

test("automatic analysis after finishing, and outdated suggestions are marked (BK-046)", async ({ page }) => {
  await login(page, "/dashboard");
  await prefs(page, true, true);
  const older = `Oudere ${tag()}`;
  const olderId = await noteAboutGenesis(page, older, "Eerste gedachte.");
  const newer = `Nieuwere ${tag()}`;
  const newerId = await noteAboutGenesis(page, newer, "Tweede gedachte.");

  // finishing is enough: the suggestion appears without asking
  await page.getByRole("button", { name: "Afronden" }).click();
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await expect
    .poll(async () => {
      const r = await page.request.get(`/api/v1/ai/suggestions?note=${newerId}`);
      return ((await r.json()).suggestions as { otherNoteId: string }[]).some((s) => s.otherNoteId === olderId);
    }, { timeout: 20_000 })
    .toBe(true);
  await page.reload();
  const suggestion = page.locator(".ai-suggestions .suggestion-list li", { hasText: older });
  await expect(suggestion).toBeVisible();
  await expect(suggestion).not.toContainText("Verouderd");

  // the other note changes: the suggestion is marked as outdated, and nothing is changed by itself
  await page.goto(`/notes/${olderId}`);
  await body(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Later aangevuld.");
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await page.goto(`/notes/${newerId}`);
  await expect(suggestion).toContainText("Verouderd");
  await expect(suggestion).toContainText("Een van beide notities is gewijzigd sinds dit voorstel.");
});

test("the question route refuses visitors who are not signed in", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  expect((await anon.post("/api/v1/ai/ask", { data: { question: "test" }, maxRedirects: 0 })).status()).toBe(401);
  await anon.dispose();
});
