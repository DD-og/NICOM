import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Full browser test of the portal on the dummy data. Run: npm run test:e2e
// (first time on a new machine: npx playwright install chromium)
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1400, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    // fresh throwaway database for every run; the demo's data/db.json is never touched
    command: `rm -f .e2e-db.json && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LOCAL_DB_FILE: ".e2e-db.json",
      DATA_BACKEND: "local",
      SESSION_SECRET: "e2e-test-secret-0123456789abcdefghijklmnop",
      GOOGLE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-secret",
      ALLOWED_EMAIL_DOMAIN: "nirmauni.ac.in",
      CONFERENCE_EMAIL: "",
    },
  },
});
