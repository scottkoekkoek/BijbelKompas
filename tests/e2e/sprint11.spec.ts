// Sprint 11: the AI foundation with the local, fictitious test provider (BK-039..BK-041, BK-044, BK-045; AT-10, AT-12).
// Nothing is sent anywhere: AI_PROVIDER=fictief only runs locally. Fictitious user and TEST text only.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

/** A note from the reader with Genesis 1:1 in it; returns its id. */
async function noteAboutGenesis(page: Page, title: string) {
  await page.goto("/bible/GEN/1?v=TEST");
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await page.getByRole("region", { name: "Geselecteerde verzen" }).getByRole("button", { name: "In notitie zetten" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(body(page).locator(".ref-block")).toContainText("Genesis 1:1");
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
  return page.url().split("/").pop()!;
}

async function setAi(page: Page, on: boolean) {
  const res = await page.request.patch("/api/v1/me/preferences", { data: on ? { aiEnabled: true } : { aiEnabled: false, autoAnalysis: false } });
  expect(res.ok()).toBe(true);
}

test.afterEach(async ({ page }) => {
  await setAi(page, false).catch(() => undefined);
});

test("links between notes are only suggested, and only become real when accepted (BK-039..041, AT-10)", async ({ page }) => {
  await login(page, "/dashboard");
  const older = unique("Oudere studie");
  const olderId = await noteAboutGenesis(page, older);
  const newer = unique("Nieuwe preek");
  const newerId = await noteAboutGenesis(page, newer);

  // AI off: nothing can be asked
  await setAi(page, false);
  await page.reload();
  const panel = page.locator(".ai-suggestions");
  await panel.locator("summary").click();
  await expect(panel).toContainText("AI-hulp staat uit");
  expect((await page.request.post(`/api/v1/notes/${newerId}/analyze`)).status()).toBe(403);

  // AI on, but the note is not finished yet
  await setAi(page, true);
  await page.reload();
  await panel.locator("summary").click();
  await expect(panel).toContainText("Testaanbieder: er gaat niets naar buiten.");
  await panel.getByRole("button", { name: "Verbanden laten zoeken" }).click();
  await expect(panel.getByRole("status")).toHaveText("Een notitie wordt pas geanalyseerd nadat je hem hebt afgerond.");

  await page.getByRole("button", { name: "Afronden" }).click();
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await panel.getByRole("button", { name: "Verbanden laten zoeken" }).click();
  await expect(panel.getByRole("status")).toContainText(/nieuwe? voorstel/);
  const suggestion = panel.locator(".suggestion-list li", { hasText: older });
  await expect(suggestion).toContainText("Beide notities gaan over Genesis 1:1.");

  // asking again for the same version pays nothing
  await panel.getByRole("button", { name: "Verbanden laten zoeken" }).click();
  await expect(panel.getByRole("status")).toHaveText("Deze versie is al geanalyseerd; er is niets opnieuw betaald.");

  // reject: no active link, and the other note is unchanged
  const before = await (await page.request.get(`/api/v1/notes/${olderId}`)).json();
  await suggestion.getByRole("button", { name: `Verband met ${older} afwijzen` }).click();
  await expect(panel.getByRole("status")).toHaveText("Voorstel: afgewezen.");
  await expect(suggestion).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".ai-suggestions")).not.toContainText(older);
  const after = await (await page.request.get(`/api/v1/notes/${olderId}`)).json();
  expect({ v: after.documentVersion, t: after.title, d: after.document }).toEqual({ v: before.documentVersion, t: before.title, d: before.document });

  // a third note: accept, and the link shows on both notes
  const third = unique("Derde notitie");
  const thirdId = await noteAboutGenesis(page, third);
  await page.getByRole("button", { name: "Afronden" }).click();
  await expect(saveState(page)).toHaveText("Opgeslagen");
  await page.locator(".ai-suggestions summary").click();
  await page.locator(".ai-suggestions").getByRole("button", { name: "Verbanden laten zoeken" }).click();
  await page.locator(".ai-suggestions").getByRole("button", { name: `Verband met ${newer} accepteren` }).click();
  await expect(page.locator(".ai-suggestions").getByRole("status")).toHaveText("Voorstel: geaccepteerd.");
  await page.goto(`/notes/${newerId}`);
  await expect(page.locator(".ai-suggestions").getByRole("link", { name: third })).toBeVisible();
  expect(thirdId).not.toBe(newerId);
});

test("the AI budget is visible and AI can be switched off (BK-044, BK-045)", async ({ page }) => {
  await login(page, "/settings");
  await expect(page.getByRole("heading", { name: "AI-budget" })).toBeVisible();
  await expect(page.locator(".settings-section", { hasText: "AI-budget" })).toContainText(/van €\s5,00 gebruikt/);
  await expect(page.getByRole("meter", { name: "AI-budget gebruikt deze maand" })).toBeVisible();
  const budget = await (await page.request.get("/api/v1/ai/budget")).json();
  expect(budget).toMatchObject({ limitEur: 5, stopAtEur: 4.5, enabled: false, provider: { name: "fictief", external: false } });
});

test("the AI routes refuse visitors who are not signed in", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const id = crypto.randomUUID();
  expect((await anon.get("/api/v1/ai/budget", { maxRedirects: 0 })).status()).toBe(401);
  expect((await anon.get(`/api/v1/ai/suggestions?note=${id}`, { maxRedirects: 0 })).status()).toBe(401);
  expect((await anon.post(`/api/v1/ai/suggestions/${id}`, { data: { status: "geaccepteerd" }, maxRedirects: 0 })).status()).toBe(401);
  expect((await anon.post(`/api/v1/notes/${id}/analyze`, { maxRedirects: 0 })).status()).toBe(401);
  await anon.dispose();
});
