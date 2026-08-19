import { expect, test } from "@playwright/test";
import { registerCommander } from "./helpers";

test("commanders can post an alliance circular and see it in mail", async ({ page }) => {
  await registerCommander(page, `mail-${Date.now()}@ashfall.test`);
  await expect(page.getByTestId("mail-unread")).toHaveText("NONE");
  await page.getByTestId("alliance-link").click();
  const tag = `M${Date.now().toString(36).slice(-4).toUpperCase()}`.slice(0, 5);
  await page.getByTestId("alliance-tag-input").fill(tag);
  await page.getByTestId("alliance-name-input").fill("Mail Company");
  await page.getByTestId("alliance-found").click();
  await expect(page.getByTestId("alliance-tag")).toContainText(`[${tag}]`);

  await page.getByRole("link", { name: "Command shell" }).click();
  await expect(page).toHaveURL(/\/game/);
  await page.getByTestId("mail-link").click();
  await expect(page).toHaveURL(/\/mail/);
  await page.getByTestId("mail-body-input").fill("Muster at first light.");
  await page.getByTestId("mail-alliance").click();
  await expect(page.getByTestId("mail-item")).toContainText("Muster at first light.");
  await expect(page.getByTestId("mail-unread-count")).toHaveText("0 unread");

  await page.getByRole("link", { name: "Command shell" }).click();
  await expect(page.getByTestId("mail-unread")).toHaveText("NONE");
});

test("unauthenticated visitors cannot open mail", async ({ page }) => {
  await page.goto("/mail");
  await expect(page).toHaveURL(/\/login/);
});
