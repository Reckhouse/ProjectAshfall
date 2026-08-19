import { expect, test } from "@playwright/test";

test("storage upgrade raises visible resource caps", async ({ page }) => {
  const email = `storage-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByTestId("storage-level")).toHaveText("1");
  await expect(page.getByTestId("metal-stock")).toContainText("/ 2200");
  await expect(page.getByTestId("upgrade-storage")).toContainText("60 Metal");
  await expect(page.getByTestId("raid-base")).toBeVisible();

  await page.getByTestId("upgrade-storage").click();
  await expect(page.getByTestId("storage-level")).toHaveText("2");
  await expect(page.getByTestId("metal-stock")).toContainText("/ 3800");
  await expect(page.getByTestId("energy-stock")).toContainText("/ 1400");
});
