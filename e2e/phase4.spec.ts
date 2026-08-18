import { expect, test } from "@playwright/test";

test("first upgrade stays cheap and later upgrades cost more Metal", async ({ page }) => {
  const email = `caves-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
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
