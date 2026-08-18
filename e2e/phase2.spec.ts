import { expect, test } from "@playwright/test";

test("leave base, move, refresh the same coordinate, and return", async ({ page }) => {
  const email = `grid-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByTestId("location-type")).toHaveText("BASE");
  await expect(page.getByTestId("world-grid")).toBeVisible();

  await page.getByTestId("leave-base").click();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");

  const destination = page.locator('[data-adjacent="true"][data-passable="true"]').first();
  await expect(destination).toBeVisible();
  await destination.click();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");
  await expect(page.getByTestId("player-coord")).not.toHaveText(await page.getByTestId("base-coord").innerText());

  const fieldCoordinate = (await page.getByTestId("player-coord").textContent())?.trim();
  expect(fieldCoordinate).toMatch(/^\d+, \d+$/);

  await page.reload();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");
  await expect(page.getByTestId("player-coord")).toHaveText(fieldCoordinate!);

  await page.locator('[data-own-base="true"][data-adjacent="true"]').click();
  await expect(page.getByTestId("location-type")).toHaveText("BASE");
  await expect(page.getByTestId("player-coord")).toHaveText(await page.getByTestId("base-coord").innerText());
});
