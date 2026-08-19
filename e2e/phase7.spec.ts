import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("storage upgrade raises visible resource caps", async ({ page }) => {
  await registerCommander(page, `storage-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("storage-level")).toHaveText("1");
  await expect(page.getByTestId("metal-stock")).toContainText("/ 2200");
  await expect(page.getByTestId("upgrade-storage")).toContainText("60 Metal");
  await expect(page.getByTestId("raid-base")).toBeVisible();

  await page.getByTestId("upgrade-storage").click();
  await expect(page.getByTestId("storage-level")).toHaveText("2");
  await expect(page.getByTestId("metal-stock")).toContainText("/ 3800");
  await expect(page.getByTestId("energy-stock")).toContainText("/ 1400");
});
