import { expect, test } from "@playwright/test";

test("register provisions a base that survives refresh, logout, and login", async ({ page }) => {
  const email = `commander-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PROJECT ASHFALL" })).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).click();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByText("ESTABLISHED")).toBeVisible();
  await expect(page.getByText("ASHFALL-01")).toBeVisible();
  const coordinate = page.getByText(/^\d+, \d+$/);
  await expect(coordinate).toBeVisible();
  const firstCoordinate = (await coordinate.textContent())?.trim();
  expect(firstCoordinate).toMatch(/^\d+, \d+$/);
  await expect(page.getByText("250")).toBeVisible();
  await expect(page.getByText("150")).toBeVisible();

  await page.reload();
  await expect(page.getByText(firstCoordinate!)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/game");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByText(firstCoordinate!)).toBeVisible();
});

test("unauthenticated visitors cannot open the command shell", async ({ page }) => {
  await page.goto("/game");
  await expect(page).toHaveURL(/\/login/);
});
