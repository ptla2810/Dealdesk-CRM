import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("redirects anonymous users to the login page", async ({ page }) => {
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login/);
});

test("shows a clear error for wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill("admin@salesflow.demo");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect" })).toContainText("Incorrect email/username or password");
});

test("signs in, shows the dashboard and signs out", async ({ page }) => {
  await login(page, "manager@salesflow.demo");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText("Total Leads")).toBeVisible();
  await page.getByRole("button", { name: "This Year" }).click();
  await expect(page).toHaveURL(/period=year/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("blocks a sales rep from admin pages and hides privileged actions", async ({ page }) => {
  await login(page, "priya@salesflow.demo");
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: /don.t have access/ })).toBeVisible();
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  const res = await page.request.get("/api/export/leads");
  expect(res.status()).toBe(403);
});
