import { expect, type Page } from "@playwright/test";

let callsignSerial = 0;

export function uniqueCallsign(prefix = "Ash"): string {
  callsignSerial += 1;
  const token = `${Date.now().toString(36)}${callsignSerial.toString(36)}`.replace(/[0-9]/g, (digit) =>
    String.fromCharCode(97 + Number(digit)),
  );
  return `${prefix}${token}`.slice(0, 16);
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
  const alert = page.getByRole("alert");
  if (await alert.isVisible().catch(() => false)) {
    throw new Error(`Registration failed: ${(await alert.textContent()) ?? "unknown error"}`);
  }
  await expect(page).toHaveURL(/\/game/, { timeout: 15_000 });
  return { email, password, callsign };
}
