import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("standings show the commander rank without exposing other bunkers", async ({ page }) => {
  const { callsign } = await registerCommander(page, `standings-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("world-rank")).toContainText("#");
  await page.getByTestId("standings-link").click();
  await expect(page).toHaveURL(/\/standings/);
  await expect(page.getByTestId("standings-you-rank")).toContainText(callsign);
  await expect(page.locator('[data-testid="standing-row"][data-you="true"]')).toContainText(callsign);
  await expect(page.getByTestId("standings-board")).not.toContainText("UNASSIGNED");
});

test("unauthenticated visitors cannot open standings", async ({ page }) => {
  await page.goto("/standings");
  await expect(page).toHaveURL(/\/login/);
});
