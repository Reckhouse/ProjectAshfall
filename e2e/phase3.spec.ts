import { expect, test } from "@playwright/test";

test("upgrade spends server Metal and persists after refresh", async ({ page }) => {
  const email = `economy-${Date.now()}@ashfall.test`;
  const password = "password1";

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/game/);
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
