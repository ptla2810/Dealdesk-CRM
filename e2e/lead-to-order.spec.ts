import { expect, test } from "@playwright/test";
import { login, unique, uniquePhone } from "./helpers";

test("lead lifecycle: create → discuss → mature → convert → order → confirm", async ({ page }) => {
  const id = unique();
  const company = `E2E Turbines ${id}`;
  await login(page, "manager@salesflow.demo");

  // Create lead
  await page.goto("/leads/new");
  await page.getByLabel("Lead name").fill(`E2E Buyer ${id}`);
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Email").fill(`e2e.${id}@turbines.example`);
  await page.getByLabel("Phone number").fill(uniquePhone());
  await page.getByLabel("Estimated deal value (USD)").fill("42000");
  await page.getByLabel("Description and sales insights").fill("Needs 10 pumps for a new turbine hall.");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: `E2E Buyer ${id}` })).toBeVisible();
  await expect(page.getByText("Qualified Lead").first()).toBeVisible();

  // Validation: a skipped stage is not offered; move to In Discussion
  await page.getByRole("button", { name: "Change stage" }).click();
  await expect(page.getByLabel("New stage").locator("option")).toHaveText(["In Discussion"]);
  await page.getByRole("button", { name: "Update stage" }).click();
  await expect(page.getByRole("button", { name: "Add discussion update" })).toBeVisible();

  // Discussion update
  await page.getByRole("button", { name: "Add discussion update" }).click();
  await page.getByLabel("Summary").fill("Reviewed technical specs");
  await page.getByLabel("Customer objections").fill("Lead time too long");
  await page.getByLabel("Next follow-up date").fill("2031-01-10");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Reviewed technical specs")).toBeVisible();

  // Mature
  await page.getByRole("button", { name: "Change stage" }).click();
  await page.getByLabel("New stage").selectOption({ label: "Lead Mature" });
  await page.getByRole("button", { name: "Update stage" }).click();
  await expect(page.getByRole("button", { name: "Convert lead" })).toBeVisible();

  // Convert into a new account
  await page.getByRole("button", { name: "Convert lead" }).click();
  await page.getByLabel("Create a new account").check();
  await page.getByLabel("Country (ISO code)").fill("US");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("Lead Converted").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert lead" })).toHaveCount(0);
  await page.getByRole("tab", { name: /Orders/ }).click();

  // Create an order from the converted lead
  await page.getByRole("link", { name: "New order" }).click();
  await expect(page.getByRole("combobox", { name: "Account" })).toContainText(company);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Centrifugal Pump CP-200 (PMP-CP200)" });
  await page.getByLabel("Quantity").fill("2");
  // 2 × 1850 = 3700 + 18% tax 666 = 4366
  await expect(page.getByText("$4,366.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Create draft order" }).click();
  await expect(page.getByRole("heading", { name: /Order ORD-/ })).toBeVisible();
  await expect(page.getByText("$4,366.00").first()).toBeVisible();

  // Confirm
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm order" }).click();
  await expect(page.getByText("Order confirmed").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);
});

test("account duplicate warning before creating a possible duplicate", async ({ page }) => {
  await login(page, "manager@salesflow.demo");
  await page.goto("/accounts/new");
  await page.getByLabel("Company name").fill("apex manufacturing");
  await page.getByLabel("Business email").fill(`new.${unique()}@apex.example`);
  await page.getByLabel("Business phone").fill(uniquePhone());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("dialog")).toContainText("Possible duplicate account");
  await expect(page.getByRole("dialog")).toContainText("Apex Manufacturing Co.");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/accounts\/new/);
});

test("global search finds records across modules", async ({ page }) => {
  await login(page, "admin@salesflow.demo");
  await page.getByRole("button", { name: "Search everything" }).click();
  await page.getByPlaceholder("Type at least 2 characters…").fill("Apex");
  const accounts = page.getByRole("group", { name: "Accounts" });
  await expect(accounts.getByRole("option", { name: /Apex Manufacturing Co\./ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Leads" })).toBeVisible();
  await accounts.getByRole("option", { name: /Apex Manufacturing Co\./ }).click();
  await expect(page).toHaveURL(/\/accounts\//);
  await expect(page.getByRole("heading", { name: "Apex Manufacturing Co." })).toBeVisible();
});
