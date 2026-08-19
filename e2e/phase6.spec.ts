import { expect, test } from "@playwright/test";

test("leave with offense and keep the troop split visible after a cave command attempt", async ({ page }) => {
  const email = `combat-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByTestId("offense-troops")).toHaveText("2");
  await expect(page.getByTestId("clear-cave")).toBeVisible();

  await page.getByTestId("leave-base").click();
  await expect(page.getByTestId("location-type")).toHaveText("FIELD");
  await expect(page.getByTestId("offense-troops")).toContainText("2 field");
  await expect(page.getByTestId("command-feedback")).toBeVisible();
});
