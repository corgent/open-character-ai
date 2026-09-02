import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || "3000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// When pointing at an external deployment (E2E_BASE_URL set), skip the local web server.
const isExternal = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(isExternal
    ? {}
    : {
        webServer: {
          command: `npx next start -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            DATABASE_URL: "******localhost:5432/e2e",
            DIRECT_URL: "******localhost:5432/e2e",
            NEXTAUTH_SECRET: "e2e_dummy_nextauth_secret",
            NEXTAUTH_URL: baseURL,
            GOOGLE_CLIENT_ID: "e2e_dummy_google_client_id",
            GOOGLE_CLIENT_SECRET: "e2e_dummy_google_client_secret",
            STRIPE_SECRET_KEY: "sk_test_e2e_dummy",
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_e2e_dummy",
            STRIPE_WEBHOOK_SECRET: "whsec_e2e_dummy",
            MU_API_KEY: "e2e_dummy_muapi_key",
            WEBHOOK_URL: baseURL,
            NEXT_PUBLIC_THEME: "midnight",
          },
        },
      }),
});
