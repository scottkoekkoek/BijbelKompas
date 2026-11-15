// BK-003, BK-004: secure e-mail login, no public registration.
import { expect, test } from "@playwright/test";
import { E2E_USER, login } from "./fixtures";

test("a visitor without a session is sent to the login page", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
});

test("a wrong password gives a clear, non-revealing message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(E2E_USER.email);
  await page.getByLabel("Wachtwoord").fill("fout-wachtwoord");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.locator(".alert.error")).toHaveText("E-mailadres of wachtwoord klopt niet.");
  await expect(page).toHaveURL(/\/login/);
});

test("login returns to the requested page, logout ends the session", async ({ page }) => {
  await login(page, "/settings");
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto("/meer");
  await page.getByRole("button", { name: "Uitloggen" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login refuses open redirects", async ({ page }) => {
  await login(page, "//evil.example");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("there is no registration page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: /registr/i })).toHaveCount(0);
  const res = await page.goto("/registreren");
  // without a session the proxy sends you to login; it never shows a sign-up form
  expect(res?.url()).toMatch(/\/login/);
});

test("the API answers 401 without a session", async ({ request }) => {
  const res = await request.get("/api/v1/me");
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe("UNAUTHENTICATED");
  expect(body.error.requestId).toBeTruthy();
  expect(res.headers()["cache-control"]).toContain("no-store");
});
