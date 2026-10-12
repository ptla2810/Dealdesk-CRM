import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("mobile layout uses a navigation drawer and has no horizontal page scroll", async ({ page }) => {
  await login(page, "admin@salesflow.demo");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Orders & Delivery" }).click();
  await expect(page.getByRole("heading", { name: "Orders & Delivery" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
