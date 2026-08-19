import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("upgrade spends server Metal and persists after refresh", async ({ page }) => {
  await registerCommander(page, `economy-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("base-level")).toHaveText("1");
  await expect(page.getByText("150")).toBeVisible();
  await expect(page.getByTestId("gather-node")).toBeVisible();
  await expect(page.getByText(/G gathers/i)).toBeVisible();

  await page.getByTestId("upgrade-base").click();
  await expect(page.getByTestId("base-level")).toHaveText("2");
  await expect(page.getByText("70")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("base-level")).toHaveText("2");
  await expect(page.getByText("70")).toBeVisible();
});
