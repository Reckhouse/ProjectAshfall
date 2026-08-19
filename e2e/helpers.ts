import { expect, type Page } from "@playwright/test";

export function uniqueCallsign(prefix = "Ash"): string {
  return `${prefix}${String(Date.now()).slice(-8)}`.slice(0, 16);
}

export async function fillRegisterForm(
  page: Page,
  input: { email: string; password: string; callsign: string },
): Promise<void> {
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Callsign").fill(input.callsign);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByLabel("Confirm password").fill(input.password);
}

export async function registerCommander(
  page: Page,
  email: string,
  password = "password1",
  callsign = uniqueCallsign(),
): Promise<{ email: string; password: string; callsign: string }> {
  await page.goto("/register");
  await fillRegisterForm(page, { email, password, callsign });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/game/);
  return { email, password, callsign };
}
