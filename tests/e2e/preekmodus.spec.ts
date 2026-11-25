// Ronde 4 (A1, A2, V6): preekmodus. A quick note can be a sermon note of today, with the church of
// the last sermon; a reference typed in the text is linked with one tap, in the quick note and in
// the editor. Fictitious user, TEST text only.
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

test("a quick note during a sermon is a sermon note of today, linked to the verse typed in it", async ({ page }) => {
  await login(page, "/dashboard");
  const first = unique("Blijf in Mij");
  await page.getByRole("button", { name: "Snelle aantekening" }).click();
  const quick = page.getByRole("dialog", { name: "Snelle aantekening" });
  await quick.getByLabel("Ik zit in een preek").check();
  await quick.getByLabel("Gemeente").fill("Testgemeente");
  await expect(quick.getByLabel("Dienst")).not.toHaveValue("");
  await quick.getByLabel("Aantekening").fill(`${first}\nGen 1:2 de Geest zweefde\nom 10:30 koffie`);
  const refs = quick.getByRole("group", { name: "Herkende Bijbelverwijzingen" });
  await expect(refs.getByRole("button")).toHaveCount(1); // the time is not a reference
  await refs.getByRole("button", { name: /Genesis 1:2/ }).click();
  await expect(refs.getByRole("button", { name: /Genesis 1:2/ })).toHaveAttribute("aria-pressed", "true");
  await quick.getByRole("button", { name: "Bewaar als concept" }).click();
  await expect(quick.getByRole("status")).toHaveText("Opgeslagen als concept in Notities.", { timeout: 20_000 });

  const [hit] = (await (await page.request.get(`/api/v1/notes?q=${encodeURIComponent(first)}`)).json()).notes as { id: string; noteType: string; eventDate: string }[];
  expect(hit).toMatchObject({ noteType: "preek", eventDate: today() });
  const note = await (await page.request.get(`/api/v1/notes/${hit!.id}`)).json();
  expect(note.sermon.organization).toBe("Testgemeente");
  const lines = note.document.content as { attrs: { passages?: { book: string; startVerse: number }[] } }[];
  expect(lines[1]!.attrs.passages).toEqual([expect.objectContaining({ book: "GEN", startChapter: 1, startVerse: 2 })]);
  expect(lines[0]!.attrs.passages).toBeUndefined();

  // the next sermon starts with the same church
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Snelle aantekening" }).click();
  const next = page.getByRole("dialog", { name: "Snelle aantekening" });
  await next.getByLabel("Ik zit in een preek").check();
  await expect(next.getByLabel("Gemeente")).toHaveValue("Testgemeente");
  await next.getByRole("button", { name: "Annuleren" }).click();
});

test("the editor offers to link a reference typed in a paragraph", async ({ page }) => {
  await login(page, "/notes/new");
  await page.getByRole("button", { name: "Lege notitie" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Titel").fill(unique("Verwijzing typen"));
  const body = page.locator(".note-body[contenteditable='true']");
  await body.click();
  await page.keyboard.type("Zie ook Gen 1:3 over het licht");
  const offer = page.getByRole("group", { name: "Herkende verwijzingen in deze alinea" });
  await offer.getByRole("button", { name: "Genesis 1:3 koppelen aan deze alinea" }).click();
  const links = page.getByRole("group", { name: "Koppelingen van deze alinea" });
  await expect(links.getByRole("link", { name: "Genesis 1:3" })).toBeVisible();
  await expect(offer).toHaveCount(0);
  await expect(page.locator(".save-state")).toHaveText("Opgeslagen", { timeout: 20_000 });
});
