// Ronde 4 (V12, V14, B6): the verse text unfolds under a reference in the reading view, a finished
// note shows your other notes on the same passage (without AI), and the timeline jumps to a year.
// A fresh, fictitious tester and TEST text only.
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "./fixtures";

const PASSWORD = "Pilot-Test-2026x";
const mail = (who: string) => `${who}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
const para = (t: string, extra: Record<string, unknown> = {}) => ({ type: "paragraph", attrs: { blockId: randomUUID(), ...extra }, content: [{ type: "text", text: t }] });
const gen = (from: number, to: number) => ({ translation: "TEST", book: "GEN", startChapter: 1, startVerse: from, endChapter: 1, endVerse: to, label: `Genesis 1:${from}${to !== from ? `-${to}` : ""}` });

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

async function note(page: Page, title: string, content: unknown[], eventDate: string | null, finish: boolean) {
  const created = await page.request.post("/api/v1/notes", { data: { title, noteType: "bijbelstudie" } });
  expect(created.status()).toBe(201);
  const n = (await created.json()) as { id: string; documentVersion: number };
  const saved = await page.request.put(`/api/v1/notes/${n.id}`, {
    data: { baseVersion: n.documentVersion, title, noteType: "bijbelstudie", eventDate, document: { type: "doc", content }, ...(finish ? { reason: "afronden", status: "afgerond" } : {}) },
  });
  expect(saved.ok()).toBe(true);
  return n.id;
}

test("reading view: verse text unfolds in place, and other notes on the passage show without AI", async ({ page, browser }) => {
  await login(page);
  const t = await newTester(browser, page, "samenhang");
  const id = await note(t.page, "Het begin", [{ type: "bibleReference", attrs: { ...gen(1, 2), blockId: randomUUID() } }, para("In het begin.")], "2025-03-02", true);
  await note(t.page, "Geest op het water", [para("De Geest zweefde.", { passages: [gen(2, 2)] })], "2026-01-11", false);

  await t.page.goto(`/notes/${id}`);
  const ref = t.page.locator(".note-body .ref-block").first();
  await ref.getByRole("button", { name: "Toon de tekst" }).click();
  await expect(ref.getByRole("button", { name: "Verberg de tekst" })).toHaveAttribute("aria-expanded", "true");
  await expect(ref.locator(".verse-text-body sup")).toHaveCount(2);
  await expect(t.page).toHaveURL(new RegExp(`/notes/${id}$`)); // never left the note

  const related = t.page.getByRole("region", { name: "Bij dezelfde passage" });
  await expect(related).toContainText("Ook bij Genesis 1:1-2:");
  await expect(related.getByRole("link", { name: "1 notitie" })).toBeVisible();
  await related.getByRole("link", { name: "Geest op het water" }).click();
  await expect(t.page.getByLabel("Titel")).toHaveValue("Geest op het water");

  // the timeline jumps to a year
  await t.page.goto("/timeline");
  const jump = t.page.getByRole("navigation", { name: "Spring naar een jaar" });
  await expect(jump.getByRole("link", { name: "2026" })).toBeVisible();
  await expect(jump.getByRole("link")).toHaveCount(2);
  await jump.getByRole("link", { name: "2025" }).click();
  await expect(t.page).toHaveURL(/#jaar-2025$/);
  await expect(t.page.getByRole("heading", { name: "2025" })).toBeInViewport();
  await t.ctx.close();
});
