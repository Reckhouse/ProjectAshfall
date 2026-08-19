import { expect, test } from "@playwright/test";

test("recruit offense, leave with troops, and return them home", async ({ page }) => {
  const email = `troops-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
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
