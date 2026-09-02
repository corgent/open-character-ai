import { test, expect } from "@playwright/test";

test.describe("character builder", () => {
  test("opens the create character modal", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Create Character").first().click();
    await expect(
      page.getByRole("heading", { name: "Create Custom Character" }),
    ).toBeVisible();
  });

  test("blocks submission when required fields are empty", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Create Character").first().click();

    const dialogHeading = page.getByRole("heading", { name: "Create Custom Character" });
    await expect(dialogHeading).toBeVisible();

    // All fields are `required`; submitting empty keeps the modal open.
    await page.getByRole("button", { name: /Save|Create/ }).last().click();
    await expect(dialogHeading).toBeVisible();
  });
});
