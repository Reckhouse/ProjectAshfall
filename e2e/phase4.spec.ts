import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("first upgrade stays cheap and later upgrades cost more Metal", async ({ page }) => {
  await registerCommander(page, `caves-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("base-level")).toHaveText("1");
  await expect(page.getByTestId("energy-tool")).toHaveText("NONE");
  await expect(page.getByTestId("metal-tool")).toHaveText("NONE");
  await expect(page.getByTestId("clear-cave")).toBeVisible();
  await expect(page.getByTestId("upgrade-base")).toContainText("80 Metal");

  await page.getByTestId("upgrade-base").click();
  await expect(page.getByTestId("base-level")).toHaveText("2");
  await expect(page.getByTestId("upgrade-base")).toContainText("250 Metal");
  await expect(page.getByTestId("upgrade-base")).toBeDisabled();
});
