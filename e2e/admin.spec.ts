import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("ordinary commanders cannot open the admin panel", async ({ page }) => {
  await registerCommander(page, `noadmin-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("admin-link")).toHaveCount(0);
  await expect(page.getByTestId("admin-command-link")).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByTestId("player-callsign")).toBeVisible();
});
