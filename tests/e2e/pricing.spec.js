import { test, expect } from "@playwright/test";

test.describe("pricing page", () => {
  test("renders all credit pack plans with prices", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /Buy Credits Packs/i }),
    ).toBeVisible();

    for (const name of ["Basic Pack", "Standard Pack", "Professional Pack", "Business Pack"]) {
      await expect(page.getByText(name)).toBeVisible();
    }
    for (const price of ["$5", "$10", "$20", "$50"]) {
      await expect(page.getByText(price, { exact: true }).first()).toBeVisible();
    }
  });

  test("shows purchase buttons for each plan", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("button", { name: /Purchase Credits/i })).toHaveCount(4);
  });
});
