// ADR-018: AI-opzet en samenvatting van een afgeronde notitie, with the local fictitious test provider.
// Nothing is sent anywhere: AI_PROVIDER=fictief only runs locally. Fictitious user and text only.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

async function setAi(page: Page, on: boolean) {
  const res = await page.request.patch("/api/v1/me/preferences", { data: on ? { aiEnabled: true } : { aiEnabled: false, autoAnalysis: false } });
  expect(res.ok()).toBe(true);
}

test.afterEach(async ({ page }) => {
  await setAi(page, false).catch(() => undefined);
});

test("an outline is only a proposal: the note stays as it is, and can be saved as a new note (ADR-018)", async ({ page }) => {
  await login(page, "/dashboard");
  await setAi(page, true);
  const title = unique("Preek over Noach");
  const res = await page.request.post("/api/v1/notes", { data: { title, noteType: "preek" } });
  expect(res.ok()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;

  await page.goto(`/notes/${id}`);
  await body(page).click();
  await page.keyboard.type("God is geduldig met Noach. Hij bouwt de ark.");
  await expect(saveState(page)).toHaveText("Opgeslagen");

  const panel = page.locator(".ai-outline");
  await panel.locator("summary").click();
  await expect(panel).toContainText("Testaanbieder: er gaat niets naar buiten.");
  await panel.getByRole("button", { name: "Opzet maken" }).click();
  await expect(panel.getByRole("status")).toHaveText("Een opzet wordt pas gemaakt nadat je de notitie hebt afgerond.");

  await page.getByRole("button", { name: "Afronden" }).click();
  await expect(page.locator(".note-head .badge")).toHaveText("Afgerond");
  await expect(saveState(page)).toHaveText("Opgeslagen");
  // Ronde 3: finishing keeps you in the editor (the reading view is for opening a finished note)
  await expect(page).toHaveURL(/bewerken=1/);
  await expect(body(page)).toBeVisible();
  await expect(panel).toHaveAttribute("open", "");
  await panel.getByRole("button", { name: "Opzet maken" }).click();
  await expect(panel.locator(".ai-answer")).toContainText(`Testsamenvatting van “${title}”`);
  await expect(panel.locator(".ai-answer")).toContainText("God is geduldig met Noach.");

  // the note itself is unchanged
  const note = await (await page.request.get(`/api/v1/notes/${id}`)).json();
  expect(JSON.stringify(note.document ?? note)).not.toContain("Testsamenvatting");

  // the same text again: nothing paid again
  const again = await page.request.post(`/api/v1/notes/${id}/outline`);
  expect((await again.json()).reused).toBe(true);

  await panel.getByRole("button", { name: "Als nieuwe notitie opslaan" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/notes/${id}$`));
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Titel")).toHaveValue(`Opzet: ${title}`);
  await expect(body(page)).toContainText("Kerngedachte");
  await expect(body(page)).toContainText("Testpunt");
});

test("the outline routes refuse visitors who are not signed in", async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  expect((await request.post(`/api/v1/notes/${id}/outline`)).status()).toBe(401);
  expect((await request.get(`/api/v1/notes/${id}/outline`)).status()).toBe(401);
});
