import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("leave with offense and keep the troop split visible after a cave command attempt", async ({ page }) => {
  await registerCommander(page, `combat-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("offense-troops")).toHaveText("2");
  await expect(page.getByTestId("clear-cave")).toBeVisible();

  await page.getByTestId("leave-base").click();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");
  await expect(page.getByTestId("offense-troops")).toContainText("2 field");
  await expect(page.getByTestId("command-feedback")).toBeVisible();
});
