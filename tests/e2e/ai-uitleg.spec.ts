// ADR-017: AI-uitleg bij geselecteerde verzen, with the local fictitious test provider.
// Nothing is sent anywhere: AI_PROVIDER=fictief only runs locally. Fictitious user and TEST text only.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

async function setAi(page: Page, on: boolean) {
  const res = await page.request.patch("/api/v1/me/preferences", { data: on ? { aiEnabled: true } : { aiEnabled: false, autoAnalysis: false } });
  expect(res.ok()).toBe(true);
}

test.afterEach(async ({ page }) => {
  await setAi(page, false).catch(() => undefined);
});

test("explains selected verses only with AI on and a translation that may go to AI (ADR-017)", async ({ page }) => {
  await login(page, "/dashboard");
  const bar = page.getByRole("region", { name: "Geselecteerde verzen" });

  // AI off: no button, and the API refuses
  await setAi(page, false);
  await page.goto("/bible/GEN/1?v=TEST");
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await expect(bar.getByRole("button", { name: "Uitleg (AI)" })).toHaveCount(0);
  const off = await page.request.post("/api/v1/ai/explain", { data: { translation: "TEST", book: "GEN", chapter: 1, from: 1, to: 2 } });
  expect(off.status()).toBe(403);

  // AI on: explain Genesis 1:1-2
  await setAi(page, true);
  await page.reload();
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await page.getByRole("button", { name: "Vers 2 selecteren" }).click();
  await expect(bar).toContainText("Testaanbieder: er gaat niets naar buiten.");
  await bar.getByRole("button", { name: "Uitleg (AI)" }).click();
  await expect(bar.locator(".ai-answer")).toContainText("Testuitleg bij Genesis 1:1-2 (2 verzen)");
  await expect(bar.getByRole("link", { name: "Johannes 1:1" })).toHaveAttribute("href", "/search?q=Johannes%201%3A1");

  // the same verses again: the stored explanation, nothing paid again
  const again = await page.request.post("/api/v1/ai/explain", { data: { translation: "TEST", book: "GEN", chapter: 1, from: 1, to: 2 } });
  expect(again.ok()).toBe(true);
  expect((await again.json()).reused).toBe(true);

  // a translation without AI rights is refused, also directly via the API
  const refused = await page.request.post("/api/v1/ai/explain", { data: { translation: "TEST2", book: "GEN", chapter: 1, from: 1, to: 1 } });
  expect(refused.status()).toBe(403);
  await page.goto("/bible/GEN/1?v=TEST2");
  await page.getByRole("button", { name: "Vers 1 selecteren" }).click();
  await expect(bar.getByRole("button", { name: "Uitleg (AI)" })).toHaveCount(0);
});
