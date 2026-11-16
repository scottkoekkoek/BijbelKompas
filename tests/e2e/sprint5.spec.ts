// Sprint 5: offline writing and sync (BK-025..BK-029, BK-033, BK-056; AT-01, AT-07). Fictitious user and TEST text only.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { login, newDevice } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const body = (page: Page) => page.locator(".note-body[contenteditable='true']");
const saveState = (page: Page) => page.locator(".save-state");
const indicator = (page: Page) => page.locator(".sync-indicator").filter({ visible: true });
const WAITING = "Lokaal opgeslagen · wordt verstuurd zodra er verbinding is";

async function newNote(page: Page, title: string) {
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(title);
  await expect(saveState(page)).toHaveText("Opgeslagen");
}

/** Waits until the service worker controls the page and has the offline screen cached. */
async function offlineReady(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return Boolean(reg?.active && navigator.serviceWorker.controller && (await caches.match("/offline")));
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test("write offline, reload offline, and it syncs when back online (AT-01)", async ({ page, context }) => {
  const title = unique("Offline");
  await newNote(page, title);
  await offlineReady(page);
  const url = page.url();
  const id = url.split("/").pop()!;

  await context.setOffline(true);
  await body(page).click();
  await page.keyboard.type("Geschreven zonder internet.");
  await expect(saveState(page)).toHaveText(WAITING);
  await expect(indicator(page)).toHaveText("Offline · 1 wijziging wacht");

  // the page cannot load from the server: the offline screen opens the same note from this browser
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/offline\\?notitie=${id}$`));
  await expect(body(page)).toContainText("Geschreven zonder internet.");
  await expect(page.getByLabel("Titel")).toHaveValue(title);
  await body(page).locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" En nog meer.");
  await expect(saveState(page)).toHaveText(WAITING);

  await context.setOffline(false);
  await expect(saveState(page)).toHaveText("Opgeslagen", { timeout: 20_000 });
  await expect(indicator(page)).toHaveText("Gesynchroniseerd");
  await page.goto(url);
  await expect(body(page)).toContainText("Geschreven zonder internet. En nog meer.");
});

test("a note made offline reaches the server exactly once", async ({ page, context }) => {
  const title = unique("Nieuw offline");
  await login(page, "/dashboard");
  await offlineReady(page);
  await context.setOffline(true);
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/offline$/);
  await expect(page.getByRole("heading", { name: "Offline notities" })).toBeVisible();

  await page.getByRole("button", { name: "Nieuwe notitie" }).click();
  await page.getByLabel("Titel").fill(title);
  await body(page).click();
  await page.keyboard.type("Bedacht in de trein.");
  await expect(saveState(page)).toHaveText(WAITING);
  const id = new URL(page.url()).searchParams.get("notitie");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  await context.setOffline(false);
  await expect(saveState(page)).toHaveText("Opgeslagen", { timeout: 20_000 });
  await page.goto(`/notes/${id}`);
  await expect(page.getByLabel("Titel")).toHaveValue(title);
  await expect(body(page)).toContainText("Bedacht in de trein.");

  await page.goto(`/notes?q=${encodeURIComponent(title)}`);
  await page.getByLabel("Zoek op titel").fill(title);
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.locator(".note-list a")).toHaveCount(1);
});

test("a conflict on a note that is not open becomes a conflict copy; nothing is overwritten", async ({ page, context, browser }, info) => {
  const title = unique("Achtergrond");
  await newNote(page, title);
  await offlineReady(page);
  const url = page.url();

  await context.setOffline(true);
  await body(page).click();
  await page.keyboard.type("Offline op apparaat één.");
  await expect(saveState(page)).toHaveText(WAITING);
  await page.goto("/offline"); // leave the note

  // meanwhile another device changes the same note
  const device = await newDevice(browser, info);
  const other = await device.newPage();
  await login(other, new URL(url).pathname);
  await body(other).click();
  await other.keyboard.type("Online op apparaat twee.");
  await expect(saveState(other)).toHaveText("Opgeslagen");
  await device.close();

  await context.setOffline(false);
  await expect(indicator(page)).toHaveText("1 conflictkopie", { timeout: 20_000 });

  await page.goto("/sync");
  const row = page.locator(".conflict-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Mijn kopie" }).click();
  await expect(page.getByLabel("Titel")).toHaveValue(new RegExp(`^${title} \\(conflictkopie `));
  await expect(body(page)).toContainText("Offline op apparaat één.");

  await page.goto(url);
  await expect(body(page)).toContainText("Online op apparaat twee.");
  await expect(body(page)).not.toContainText("Offline op apparaat één.");

  await page.goto("/sync");
  await page.locator(".conflict-row").filter({ hasText: title }).getByRole("button", { name: "Afgehandeld" }).click();
  await expect(page.locator(".conflict-row").filter({ hasText: title })).toHaveCount(0);
});

test("the same operation sent twice is applied once (AT-07)", async ({ page }) => {
  await login(page, "/dashboard");
  const deviceId = randomUUID();
  const noteId = randomUUID();
  const title = unique("Dubbel verstuurd");
  expect((await page.request.post("/api/v1/sync/devices", { data: { deviceId, label: "E2E-apparaat" } })).ok()).toBe(true);
  const op = {
    operationId: randomUUID(),
    type: "create",
    noteId,
    baseVersion: null,
    title,
    noteType: "vrij",
    eventDate: null,
    document: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: randomUUID() }, content: [{ type: "text", text: "Eén keer" }] }] },
  };
  const send = async () => (await (await page.request.post("/api/v1/sync/push", { data: { deviceId, operations: [op] } })).json()).results[0];
  expect(await send()).toMatchObject({ status: "accepted", note: { id: noteId } });
  expect(await send()).toMatchObject({ status: "duplicate", original: "accepted", note: { id: noteId } });

  const fetched = await (await page.request.get(`/api/v1/sync/notes?ids=${noteId}`)).json();
  expect(fetched.notes).toHaveLength(1);
  expect(fetched.notes[0]).toMatchObject({ title, documentVersion: 2 });
});

test("logging out with unsent changes warns first; otherwise this browser is wiped (BK-056)", async ({ page }) => {
  await newNote(page, unique("Uitloggen"));
  await page.route("**/api/v1/sync/push", (r) => r.abort());
  await body(page).click();
  await page.keyboard.type("Nog niet verstuurd.");
  await expect(saveState(page)).toHaveText(/^Lokaal opgeslagen/);

  await page.goto("/meer");
  await page.getByRole("button", { name: "Uitloggen" }).first().click();
  const warning = page.getByRole("alertdialog");
  await expect(warning).toContainText("1 wijziging");
  await expect(warning).toBeFocused();
  await warning.getByRole("button", { name: "Ingelogd blijven" }).click();
  await expect(page).toHaveURL(/\/meer$/);

  await page.unroute("**/api/v1/sync/push");
  await page.goto("/sync");
  await page.getByRole("button", { name: "Nu synchroniseren" }).click();
  await expect(page.getByText("Alles is verstuurd.")).toBeVisible();
  await page.goto("/meer");
  await page.getByRole("button", { name: "Uitloggen" }).first().click();
  await expect(page).toHaveURL(/\/login/);

  const left = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("bijbelkompas");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const count = req.result.transaction("notes").objectStore("notes").count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  expect(left).toBe(0);
});

test("a note is edited in one tab at a time", async ({ page, context }) => {
  await newNote(page, unique("Tabblad"));
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByText("Deze notitie is al geopend in een ander tabblad.")).toBeVisible();
  await expect(other.getByLabel("Titel")).toBeDisabled();
  await page.close();
  await expect(other.getByLabel("Titel")).toBeEnabled();
  await expect(other.locator(".note-body[contenteditable='true']")).toBeVisible();
});
