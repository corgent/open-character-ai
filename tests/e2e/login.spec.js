import { test, expect } from "@playwright/test";

test.describe("login page", () => {
  test("renders the Google sign-in option", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /Continue with Google/i }),
    ).toBeVisible();
  });
});
