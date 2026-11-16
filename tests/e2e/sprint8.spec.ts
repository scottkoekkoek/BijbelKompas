// Sprint 8: putting an export back (AT-15), the health check (BK-059) and API authorization (BK-057).
// Fictitious user and TEST text only.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

const { unzipSync, zipSync, strFromU8, strToU8 } = createRequire(path.resolve(__dirname, "../../apps/web/package.json"))("fflate") as typeof import("fflate");

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");

async function downloadExport(page: Page) {
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Alles exporteren" }).click()]);
  const bytes = await (await import("node:fs/promises")).readFile(await download.path());
  return JSON.parse(strFromU8(unzipSync(new Uint8Array(bytes))["bijbelkompas.json"]!));
}

test("an export goes back in: only what is missing is added, with its text and history (AT-15)", async ({ page }, info) => {
  const title = unique("Terug te zetten");
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await body(page).click();
  await page.keyboard.type("Tekst die terug moet komen.");
  await page.getByRole("button", { name: "Opslaan als versie" }).click();
  await expect(page.getByRole("link", { name: "1 versie" })).toBeVisible();
  await expect(saveState(page)).toHaveText("Opgeslagen");

  const data = await downloadExport(page);
  const original = data.notes.find((n: { title: string }) => n.title === title);
  expect(original.revisions).toHaveLength(1);

  // 1) the export as it is: everything is already there, nothing changes
  const dir = info.outputDir;
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });
  const same = path.join(dir, "zelfde.zip");
  await fs.writeFile(same, zipSync({ "bijbelkompas.json": strToU8(JSON.stringify({ ...data, notes: [original], collections: [], collectionItems: [], questions: [], questionNotes: [], questionPassages: [], templates: [] })) }));
  await page.goto("/settings");
  await page.getByLabel("Exportbestand kiezen").setInputFiles(same);
  await expect(page.locator(".import-summary")).toContainText("1 notitie met 1 versie");
  await page.getByRole("button", { name: "Terugzetten" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Klaar." })).toContainText("0 notities teruggezet, 1 stond er al en is overgeslagen");

  // 2) as if that note were lost: it comes back as a separate note with its text and its version
  const lost = { ...original, id: randomUUID(), title: `${title} (terug)` };
  const file = path.join(dir, "kwijt.zip");
  await fs.writeFile(file, zipSync({ "bijbelkompas.json": strToU8(JSON.stringify({ ...data, notes: [lost], collections: [], collectionItems: [], questions: [], questionNotes: [], questionPassages: [], templates: [] })) }));
  await page.getByLabel("Exportbestand kiezen").setInputFiles(file);
  await page.getByRole("button", { name: "Terugzetten" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Klaar." })).toContainText("1 notitie teruggezet");

  await page.goto(`/notes/${lost.id}`);
  await expect(page.getByLabel("Titel")).toHaveValue(`${title} (terug)`);
  await expect(body(page)).toContainText("Tekst die terug moet komen.");
  await expect(page.getByRole("link", { name: "1 versie" })).toBeVisible();
  // the original is untouched
  await page.goto(`/notes/${original.id}`);
  await expect(page.getByLabel("Titel")).toHaveValue(title);
});

test("a file that is not an export is refused with a clear message", async ({ page }, info) => {
  await login(page, "/settings");
  const fs = await import("node:fs/promises");
  await fs.mkdir(info.outputDir, { recursive: true });
  const file = path.join(info.outputDir, "iets-anders.json");
  await fs.writeFile(file, JSON.stringify({ hallo: "wereld" }));
  await page.getByLabel("Exportbestand kiezen").setInputFiles(file);
  await expect(page.locator(".import-export").getByRole("alert")).toHaveText("Dit is geen BijbelKompas-export.");
  await expect(page.getByRole("button", { name: "Terugzetten" })).toHaveCount(0);
});

test("the health check answers without login and without personal data (BK-059)", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const res = await anon.get("/api/v1/health");
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(Object.keys(json).sort()).toEqual(["database", "status", "time", "version"]);
  expect(json).toMatchObject({ status: "ok", database: "bereikbaar" });
  await anon.dispose();
});

test("every private API route refuses visitors who are not signed in (BK-057, AT-08)", async ({ playwright }, info) => {
  const anon = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const id = randomUUID();
  const gets = [
    "/api/v1/me", "/api/v1/notes", `/api/v1/notes/${id}`, `/api/v1/notes/${id}/revisions`,
    `/api/v1/notes/${id}/revisions/1`, "/api/v1/templates", `/api/v1/templates/${id}`, "/api/v1/export",
    "/api/v1/passages/notes?translation=TEST&book=GEN&chapter=1&from=1&to=1", "/api/v1/sync/pull", `/api/v1/sync/notes?ids=${id}`,
    "/api/v1/collections", `/api/v1/collections/${id}`, `/api/v1/collections/offline?ids=${id}`, "/api/v1/questions", `/api/v1/questions/${id}`,
  ];
  const posts = [
    "/api/v1/notes", `/api/v1/notes/${id}/archive`, `/api/v1/notes/${id}/revisions/1/restore`, "/api/v1/templates", "/api/v1/sync/devices",
    "/api/v1/sync/push", "/api/v1/collections", `/api/v1/collections/${id}/items`, "/api/v1/questions", `/api/v1/questions/${id}/links`, "/api/v1/import",
  ];
  const patches = [`/api/v1/templates/${id}`, `/api/v1/collections/${id}`, `/api/v1/questions/${id}`, "/api/v1/me/preferences"];
  const results: string[] = [];
  for (const url of gets) results.push(`GET ${url} ${(await anon.get(url, { maxRedirects: 0 })).status()}`);
  for (const url of posts) results.push(`POST ${url} ${(await anon.post(url, { data: {}, maxRedirects: 0 })).status()}`);
  for (const url of patches) results.push(`PATCH ${url} ${(await anon.patch(url, { data: {}, maxRedirects: 0 })).status()}`);
  results.push(`PUT /api/v1/notes/${id} ${(await anon.put(`/api/v1/notes/${id}`, { data: {}, maxRedirects: 0 })).status()}`);
  results.push(`PUT /api/v1/me/reading-position ${(await anon.put("/api/v1/me/reading-position", { data: {}, maxRedirects: 0 })).status()}`);
  expect(results.filter((r) => !r.endsWith(" 401"))).toEqual([]);
  await anon.dispose();
});
