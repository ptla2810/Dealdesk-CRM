import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Demo@12345";

export async function login(page: Page, identifier: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Selects an option in one of the app's searchable comboboxes. */
export async function pickCombobox(page: Page, label: string, search: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByPlaceholder(`Search ${label.toLowerCase()}…`).fill(search);
  await page.getByRole("option").filter({ hasText: search }).first().click();
}

export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** A random, valid US phone number so repeated runs don't trip duplicate detection. */
export const uniquePhone = () => `+1 415 ${200 + Math.floor(Math.random() * 800)} ${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;
