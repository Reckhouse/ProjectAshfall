import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("commanders can found an alliance and see the tag in the shell", async ({ page }) => {
  await registerCommander(page, `alliance-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("player-alliance")).toHaveText("NONE");
  await page.getByTestId("alliance-link").click();
  await expect(page).toHaveURL(/\/alliance/);

  const tag = `Z${Date.now().toString(36).slice(-4).toUpperCase()}`.slice(0, 5);
  await page.getByTestId("alliance-tag-input").fill(tag);
  await page.getByTestId("alliance-name-input").fill("Ash Company");
  await page.getByTestId("alliance-found").click();
  await expect(page.getByTestId("alliance-tag")).toContainText(`[${tag}]`);

  await page.getByRole("link", { name: "Command shell" }).click();
  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByTestId("player-alliance")).toHaveText(`[${tag}]`);
});

test("unauthenticated visitors cannot open the alliance desk", async ({ page }) => {
  await page.goto("/alliance");
  await expect(page).toHaveURL(/\/login/);
});
