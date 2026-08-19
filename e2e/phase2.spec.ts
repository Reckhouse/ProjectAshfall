import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("leave base, move, refresh the same coordinate, and return", async ({ page }) => {
  await registerCommander(page, `grid-${Date.now()}@ashfall.test`);
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
  await expect(page.locator("html[data-ash-ready='true']")).toBeAttached();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");
  await expect(page.getByTestId("player-coord")).toHaveText(fieldCoordinate!);

  await page.locator('[data-own-base="true"][data-adjacent="true"]').click();
  await expect(page.getByTestId("location-type")).toHaveText("BASE");
  await expect(page.getByTestId("player-coord")).toHaveText(await page.getByTestId("base-coord").innerText());
});
