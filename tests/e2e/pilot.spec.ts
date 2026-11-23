// Ronde 3 (ADR-019): besloten pilot. Two testers are invited with a link, each gets an own account,
// and nothing of one is visible to the other: not in notes, search, passage panels, offline data
// or AI. Also: account switch on one device, revoking access, the AI budget in Beheer, the model
// choice in Instellingen, the Joh 16:12–14 search case, the reading view and the trash.
// Only the local stack and the local, fictitious AI provider: nothing is sent anywhere.
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "./fixtures";

const PASSWORD = "Pilot-Test-2026x";
const unique = (s: string) => `${s} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const mail = (who: string) => `${who}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

async function invite(page: Page, email: string): Promise<string> {
  await page.goto("/beheer");
  await page.getByLabel("E-mailadres van de tester").fill(email);
  await page.getByRole("button", { name: "Uitnodiging maken" }).click();
  const link = page.locator(".link-value");
  await expect(link).toBeVisible();
  return new URL(await link.inputValue()).pathname;
}

async function redeem(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Kies een wachtwoord").fill(PASSWORD);
  await page.getByLabel("Herhaal wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function signOut(page: Page) {
  await page.goto("/settings");
  // the sidebar on wide screens, "Meer" on the phone
  const button = page.getByRole("button", { name: "Uitloggen" });
  if (!(await button.first().isVisible())) await page.goto("/meer");
  await page.getByRole("button", { name: "Uitloggen" }).first().click();
  await page.waitForURL(/\/login/);
}

/** Everything in this browser's offline note storage (IndexedDB "bijbelkompas"), as text. */
function offlineTitles(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open("bijbelkompas");
        req.onerror = () => resolve("");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("notes")) return resolve("");
          const all = db.transaction("notes").objectStore("notes").getAll();
          all.onsuccess = () => resolve(JSON.stringify(all.result));
          all.onerror = () => resolve("");
        };
      }),
  );
}

const accounts = (page: Page) => page.getByRole("region", { name: "Accounts" });

async function newTester(browser: Browser, admin: Page, who: string) {
  const email = mail(who);
  const path = await invite(admin, email);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await redeem(page, path, email);
  return { email, path, page, ctx };
}

test.describe.configure({ mode: "serial" });

test("two invited testers each work in their own, separate account", async ({ page, browser }) => {
  await login(page, "/beheer");
  await expect(page.getByRole("heading", { level: 1, name: "Beheer" })).toBeVisible();
  const a = await newTester(browser, page, "tester-a");
  const b = await newTester(browser, page, "tester-b");

  // a link works once
  const again = await (await browser.newContext()).newPage();
  await again.goto(a.path);
  await expect(again.locator(".alert")).toContainText(/gebruikt/i);

  // A writes a note linked to Joh 16:13; B sees nothing of it
  const title = unique("Geheim van A");
  const created = await a.page.request.post("/api/v1/notes", { data: { title, noteType: "bijbelstudie" } });
  expect(created.status()).toBe(201);
  const { id, documentVersion } = (await created.json()) as { id: string; documentVersion: number };
  const verse13 = { translation: "TEST", book: "JHN", startChapter: 16, startVerse: 13, endChapter: 16, endVerse: 13, label: "Johannes 16:13" };
  const saved = await a.page.request.put(`/api/v1/notes/${id}`, {
    data: {
      baseVersion: documentVersion, title, noteType: "bijbelstudie", eventDate: null,
      document: { type: "doc", content: [{ type: "bibleReference", attrs: { blockId: randomUUID(), ...verse13 } }, { type: "paragraph", attrs: { blockId: randomUUID() }, content: [{ type: "text", text: "De Geest der waarheid." }] }] },
    },
  });
  expect(saved.ok()).toBeTruthy();

  // Joh 16:12–14: A's note is shown at the passage, without a general "nothing found"
  await a.page.goto(`/search?q=${encodeURIComponent("Joh 16:12-14")}`);
  await expect(a.page.getByRole("link", { name: title })).toBeVisible();
  await expect(a.page.getByText(/Geen notities gevonden|Niets gevonden/)).toHaveCount(0);

  expect((await b.page.request.get(`/api/v1/notes/${id}`)).status()).toBe(404);
  await b.page.goto(`/search?q=${encodeURIComponent("Joh 16:12-14")}`);
  await expect(b.page.getByText(title)).toHaveCount(0);
  await b.page.goto("/notes");
  await expect(b.page.getByText(title)).toHaveCount(0);
  await b.page.goto(`/notes/${id}`);
  await expect(b.page.getByText(title)).toHaveCount(0);
  const ask = await b.page.request.get("/api/v1/notes");
  expect(JSON.stringify(await ask.json())).not.toContain(title);

  // the admin never sees content either: only accounts and counts
  await page.goto("/beheer");
  await expect(accounts(page).locator(".admin-row", { hasText: a.email })).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);

  // revoking access signs B out and blocks signing in again
  await accounts(page).locator(".admin-row", { hasText: b.email }).getByRole("button", { name: "Toegang intrekken" }).click();
  await expect(accounts(page).locator(".admin-row", { hasText: b.email }).getByRole("button", { name: "Toegang herstellen" })).toBeVisible();
  await b.page.goto("/dashboard");
  await expect(b.page).toHaveURL(/\/login/);
  expect((await b.page.request.get("/api/v1/notes")).status()).toBe(401);
  await b.page.getByLabel("E-mailadres").fill(b.email);
  await b.page.getByLabel("Wachtwoord").fill(PASSWORD);
  await b.page.getByRole("button", { name: "Inloggen" }).click();
  await expect(b.page).toHaveURL(/\/login/);
  await a.ctx.close();
  await b.ctx.close();
});

test("switching accounts on one device never shows the other account's data", async ({ page, browser }) => {
  await login(page, "/dashboard");
  const a = await newTester(browser, page, "wissel-a");
  const b = await newTester(browser, page, "wissel-b");
  await b.ctx.close();

  // A writes in the editor, so the note is also stored on this device
  const title = unique("Alleen van A");
  await a.page.goto("/notes/new");
  await a.page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(a.page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await a.page.getByLabel("Titel").fill(title);
  await a.page.locator(".note-body[contenteditable='true']").click();
  await a.page.keyboard.type("Tekst die alleen A mag zien.");
  await expect(a.page.locator(".save-state")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await expect.poll(() => offlineTitles(a.page)).toContain(title);

  await signOut(a.page);
  await signIn(a.page, b.email);
  await a.page.goto("/sync");
  await expect(a.page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(a.page.getByText(title)).toHaveCount(0);
  // the browser storage of this device no longer holds A's note
  await expect.poll(() => offlineTitles(a.page)).not.toContain(title);
  await a.page.goto("/notes");
  await expect(a.page.getByText(title)).toHaveCount(0);
  await a.page.goto(`/search?q=${encodeURIComponent("alleen A")}`);
  await expect(a.page.getByText(title)).toHaveCount(0);
  await a.ctx.close();
});

test("Beheer sets the AI budget; Instellingen offers the allowed models per account", async ({ page }) => {
  await login(page, "/beheer");
  await page.getByLabel("Per account per maand (euro)").fill("6");
  await page.getByLabel("Hele pilot samen per maand (euro)").fill("30");
  await page.getByRole("button", { name: "Budget opslaan" }).click();
  await expect(page.getByText("Opgeslagen")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText(/van €\s6,00 gebruikt/)).toBeVisible();
  await expect(page.getByText(/van €\s30,00 gebruikt/)).toBeVisible();
  const ai = page.getByLabel("AI-hulp toestaan");
  if (!(await ai.isChecked())) await ai.check();
  const model = page.getByLabel("AI-model");
  await model.selectOption("lokaal-snel");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(page.getByText("Opgeslagen")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("AI-model")).toHaveValue("lokaal-snel");

  // the server refuses a model it does not allow
  const bad = await page.request.patch("/api/v1/me/preferences", { data: { aiModel: "claude-opus-5-5" } });
  expect(bad.status()).toBe(422);
  const budget = await (await page.request.get("/api/v1/ai/budget")).json();
  expect(budget).toMatchObject({ limitEur: 6, stopAtEur: 5.4, pilot: { limitEur: 30, stopAtEur: 27 }, provider: { name: "fictief", model: "lokaal-snel", fellBack: false } });

  // back to the defaults, so other tests see the familiar budget
  await page.request.patch("/api/v1/me/preferences", { data: { aiModel: null, aiEnabled: false } });
  await page.goto("/beheer");
  await page.getByLabel("Per account per maand (euro)").fill("5");
  await page.getByLabel("Hele pilot samen per maand (euro)").fill("25");
  await page.getByRole("button", { name: "Budget opslaan" }).click();
  await expect(page.getByText("Opgeslagen")).toBeVisible();
});

test("only an admin reaches Beheer", async ({ page, browser }) => {
  await login(page, "/dashboard");
  const t = await newTester(browser, page, "geen-beheer");
  await t.page.goto("/beheer");
  // not found (with streaming the status can stay 200): no admin content at all
  await expect(t.page.getByText(/niet gevonden|bestaat niet/i).first()).toBeVisible();
  await expect(t.page.getByLabel("E-mailadres van de tester")).toHaveCount(0);
  await expect(t.page.getByRole("link", { name: "Beheer" })).toHaveCount(0);
  await t.ctx.close();
});
