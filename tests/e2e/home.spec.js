import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("loads and shows the character dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    // Search box is the primary filter control on the dashboard.
    await expect(page.getByPlaceholder("Search characters...")).toBeVisible();
  });

  test("renders default character cards", async ({ page }) => {
    await page.goto("/");
    // Default personas are hardcoded and always available, even without a DB.
    await expect(page.getByText("Albert Einstein").first()).toBeVisible();
  });

  test("switches category tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Community" }).click();
    await page.getByRole("button", { name: "My Characters" }).click();
    await page.getByRole("button", { name: "Featured" }).click();
    // Returning to Featured shows default personas again.
    await expect(page.getByText("Albert Einstein").first()).toBeVisible();
  });

  test("filters characters with the search box", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Search characters...").fill("Einstein");
    await expect(page.getByText("Albert Einstein").first()).toBeVisible();
    await expect(page.getByText("Steve Jobs")).toHaveCount(0);
  });
});
