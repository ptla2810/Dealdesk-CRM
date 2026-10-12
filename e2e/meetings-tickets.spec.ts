import { expect, test } from "@playwright/test";
import { login, pickCombobox, unique } from "./helpers";

test("schedule a meeting, record MOM with an action item and complete it", async ({ page }) => {
  const id = unique();
  await login(page, "manager@salesflow.demo");
  await page.goto("/meetings/new");
  await page.getByLabel("Meeting title").fill(`E2E Review ${id}`);
  await pickCombobox(page, "Account", "Apex Manufacturing");
  await page.getByRole("button", { name: "Save meeting" }).click();
  await expect(page.getByRole("heading", { name: `E2E Review ${id}` })).toBeVisible();

  await page.getByRole("button", { name: "Add MOM" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Discussion summary").fill("Agreed pilot scope");
  await dialog.getByLabel("Decisions taken").fill("Pilot with 5 units");
  await dialog.getByRole("button", { name: "Add action item" }).click();
  await dialog.getByPlaceholder("What needs to be done?").fill(`Send pilot quote ${id}`);
  await dialog.getByRole("button", { name: "Save minutes" }).click();
  await expect(page.getByText("Agreed pilot scope")).toBeVisible();
  await expect(page.getByText("Completed").first()).toBeVisible();

  const status = page.getByLabel("Action item status");
  await status.selectOption("DONE");
  await expect(page.getByText(`Send pilot quote ${id}`, { exact: true })).toHaveClass(/line-through/);
});

test("open a ticket, add an internal note and a customer reply, then resolve it", async ({ page }) => {
  const id = unique();
  await login(page, "support@salesflow.demo");
  await page.goto("/tickets/new");
  await page.getByLabel("Subject").fill(`E2E Leak ${id}`);
  await page.getByLabel("Description").fill("Valve leaking at the joint.");
  await pickCombobox(page, "Account", "Apex Manufacturing");
  await page.getByLabel("Internal note").fill("Probably a seal issue");
  await page.getByRole("button", { name: "Create ticket" }).click();
  await expect(page.getByRole("heading", { name: `E2E Leak ${id}` })).toBeVisible();
  await expect(page.getByText("Probably a seal issue")).toBeVisible();

  await page.getByRole("tab", { name: "Customer reply" }).click();
  await page.getByLabel("Message", { exact: true }).fill("We will send a technician tomorrow.");
  await expect(page.getByText(/NOT sent to the customer/)).toBeVisible();
  await page.getByRole("button", { name: "Add reply" }).click();
  await expect(page.getByText("Recorded only — not sent (no email provider)")).toBeVisible();

  await page.getByRole("button", { name: "→ Resolved" }).click();
  await expect(page.getByRole("button", { name: "Resolve" })).toBeDisabled(); // resolution note required
  await page.getByLabel("Resolution note").fill("Replaced the seal on site.");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Replaced the seal on site.")).toBeVisible();
  await expect(page.getByText("Resolved").first()).toBeVisible();
});
