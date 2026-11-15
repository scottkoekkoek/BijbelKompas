// BK-005: preferences are saved, validated and survive a new login.
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

test("preferences survive logging out and in again", async ({ page }) => {
  await login(page, "/settings");
  await page.getByLabel("Thema").selectOption("dark");
  await page.getByLabel(/Lettergrootte Bijbeltekst/).fill("22");
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByText("Opgeslagen")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/meer");
  await page.getByRole("button", { name: "Uitloggen" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "/settings");
  await expect(page.getByLabel("Thema")).toHaveValue("dark");
  await expect(page.getByLabel(/Lettergrootte Bijbeltekst/)).toHaveValue("22");

  // reset for the next run
  await page.getByLabel("Thema").selectOption("system");
  await page.getByLabel(/Lettergrootte Bijbeltekst/).fill("18");
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByText("Opgeslagen")).toBeVisible();
});

test("invalid preferences are refused with 422", async ({ page }) => {
  await login(page);
  const reset = await page.request.patch("/api/v1/me/preferences", { data: { bibleFontSize: 18 } });
  expect(reset.status()).toBe(200);
  const tooBig = await page.request.patch("/api/v1/me/preferences", { data: { bibleFontSize: 40 } });
  expect(tooBig.status()).toBe(422);
  expect((await tooBig.json()).error.code).toBe("INVALID_INPUT");

  const foreignKey = await page.request.patch("/api/v1/me/preferences", { data: { ownerId: "x" } });
  expect(foreignKey.status()).toBe(422);

  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).preferences.bibleFontSize).toBe(18);
});

test("automatic analysis cannot be switched on without AI", async ({ page }) => {
  await login(page);
  const res = await page.request.patch("/api/v1/me/preferences", { data: { autoAnalysis: true } });
  expect(res.status()).toBe(422);
});
