// Ronde 4 (ADR-020): the features to validate with testers. Your margin in the reader (B1, B2),
// toepassingen (B4), a reading plan (C2) and gespreksvragen (D1, local fictitious AI only).
// A fresh, fictitious tester and TEST text only; nothing is sent anywhere.
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "./fixtures";

const PASSWORD = "Pilot-Test-2026x";
const mail = (who: string) => `${who}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
const text = (t: string) => [{ type: "text", text: t }];
const para = (t: string, extra: Record<string, unknown> = {}) => ({ type: "paragraph", attrs: { blockId: randomUUID(), ...extra }, content: text(t) });
const heading = (t: string) => ({ type: "heading", attrs: { level: 2, blockId: randomUUID() }, content: text(t) });
const gen = (v: number) => ({ translation: "TEST", book: "GEN", startChapter: 1, startVerse: v, endChapter: 1, endVerse: v, label: `Genesis 1:${v}` });

async function newTester(browser: Browser, admin: Page, who: string) {
  const email = mail(who);
  await admin.goto("/beheer");
  await admin.getByLabel("E-mailadres van de tester").fill(email);
  await admin.getByRole("button", { name: "Uitnodiging maken" }).click();
  const link = admin.locator(".link-value");
  await expect(link).toBeVisible();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(await link.inputValue()).pathname);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Kies een wachtwoord").fill(PASSWORD);
  await page.getByLabel("Herhaal wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  return { page, ctx };
}

async function note(page: Page, title: string, content: unknown[], finish: boolean, noteType = "preek") {
  const created = await page.request.post("/api/v1/notes", { data: { title, noteType } });
  expect(created.status()).toBe(201);
  const n = (await created.json()) as { id: string; documentVersion: number };
  const saved = await page.request.put(`/api/v1/notes/${n.id}`, {
    data: { baseVersion: n.documentVersion, title, noteType, eventDate: "2025-03-02", document: { type: "doc", content }, ...(finish ? { reason: "afronden", status: "afgerond" } : {}) },
  });
  expect(saved.ok()).toBe(true);
  return n.id;
}

test.describe.configure({ mode: "serial" });

test("your margin in the reader: notes per verse and what you wrote here before (B1, B2)", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "kantlijn");
  await note(t.page, "Eerste preek", [para("Licht.", { passages: [gen(3)] })], true);
  await note(t.page, "Tweede studie", [para("Nog eens licht.", { passages: [gen(3)] })], false, "bijbelstudie");
  await t.page.goto("/bible/GEN/1?v=TEST");
  await expect(t.page.locator("#v3 .note-dot.counted")).toHaveText("2(2 notities)");
  await expect(t.page.locator(".earlier-line")).toContainText("Je schreef hierover op 2 maart 2025.");
  await t.page.locator(".earlier-line").getByRole("link", { name: "Teruglezen" }).click();
  await expect(t.page.getByRole("heading", { name: "Eerste preek" })).toBeVisible();
  await t.ctx.close();
});

test("toepassingen come back, and closing them never changes the note (B4)", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "toepassing");
  const id = await note(t.page, "Zondag", [para("Over vergeving."), heading("Toepassing"), para("Deze week Marja bellen"), heading("Gebed"), para("Amen")], true);
  const before = await (await t.page.request.get(`/api/v1/notes/${id}`)).json();

  await t.page.goto("/dashboard");
  // the note is dated in 2025, so it is not "this fortnight" on Home; the overview has it
  await t.page.goto("/toepassingen");
  const open = t.page.getByRole("region", { name: /Open/ });
  const item = open.getByRole("listitem").filter({ hasText: "Deze week Marja bellen" });
  await expect(item).toBeVisible();
  await expect(open).not.toContainText("Amen");
  await item.getByLabel(/Terugblik bij/).fill("Gebeld, fijn gesprek.");
  await item.getByRole("button", { name: "Gedaan" }).click();
  const closed = t.page.getByRole("region", { name: /Gedaan of losgelaten/ });
  await expect(closed.getByRole("listitem").filter({ hasText: "Deze week Marja bellen" })).toContainText("Gedaan");
  await t.page.reload();
  await expect(t.page.getByRole("region", { name: /Gedaan of losgelaten/ }).getByLabel(/Terugblik bij/)).toHaveValue("Gebeld, fijn gesprek.");

  const after = await (await t.page.request.get(`/api/v1/notes/${id}`)).json();
  expect(after.documentVersion).toBe(before.documentVersion);
  expect(after.document).toEqual(before.document);
  await t.ctx.close();
});

test("a reading plan shows today's portion; reading on is fine when behind (C2)", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "leesplan");
  await t.page.goto("/leesplan");
  await t.page.getByRole("listitem").filter({ hasText: "Psalmen en Spreuken in een maand" }).getByRole("button", { name: "Begin dit plan" }).click();
  const today = t.page.getByRole("region", { name: "Vandaag lezen" });
  await expect(today).toContainText("Psalmen 1-7");
  await expect(today).toContainText("dag 1 van 30");
  await today.getByRole("button", { name: "Gelezen" }).click();
  await expect(today).toContainText("dag 2 van 30");

  await t.page.goto("/dashboard");
  await expect(t.page.getByRole("region", { name: "Vandaag lezen" })).toContainText("Psalmen 8-");
  await t.page.goto("/leesplan");
  await t.page.getByRole("button", { name: "Stoppen met het leesplan" }).click();
  await expect(t.page.getByRole("region", { name: "Vandaag lezen" })).toHaveCount(0);
  await t.ctx.close();
});

test("gespreksvragen are a proposal next to a finished note, never in it (D1)", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "gesprek");
  expect((await t.page.request.patch("/api/v1/me/preferences", { data: { aiEnabled: true } })).ok()).toBe(true);
  const id = await note(t.page, "Kringpreek", [para("God is trouw.")], true);
  const before = await (await t.page.request.get(`/api/v1/notes/${id}`)).json();

  await t.page.goto(`/notes/${id}`);
  const panel = t.page.locator(".ai-discussion");
  await panel.locator("summary").click();
  await expect(panel).toContainText("Testaanbieder: er gaat niets naar buiten.");
  await panel.getByRole("button", { name: "Maak 5 gespreksvragen" }).click();
  await expect(panel.locator(".discussion-list li")).toHaveCount(5);
  await expect(panel).toContainText("Testvraag 1: wat raakte je in “Kringpreek”?");

  const after = await (await t.page.request.get(`/api/v1/notes/${id}`)).json();
  expect(after.document).toEqual(before.document);
  // a concept gets no questions
  const draft = await note(t.page, "Concept", [para("Nog niet af.")], false);
  expect((await t.page.request.post(`/api/v1/notes/${draft}/gespreksvragen`)).status()).toBe(422);
  await t.ctx.close();
});
