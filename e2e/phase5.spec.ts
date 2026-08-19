import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("recruit offense, leave with troops, and return them home", async ({ page }) => {
  await registerCommander(page, `troops-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("defense-troops")).toHaveText("2");
  await expect(page.getByTestId("offense-troops")).toHaveText("2");
  await expect(page.getByTestId("recruit-offense")).toBeVisible();

  await page.getByTestId("recruit-offense").click();
  await expect(page.getByTestId("offense-troops")).toHaveText("3");

  await page.getByTestId("leave-base").click();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");
  await expect(page.getByTestId("offense-troops")).toContainText("field");

  await page.getByTestId("enter-base").click();
  await expect(page.getByTestId("location-type")).toHaveText("BASE");
  await expect(page.getByTestId("offense-troops")).toHaveText("3");
  await expect(page.getByTestId("defense-troops")).toHaveText("2");
});
