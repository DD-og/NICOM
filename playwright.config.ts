import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const FAKE_SCRIPT_PORT = 3199;
// E2E_BACKEND=appsscript runs the same journeys with the Google Sheet behind the Apps Script bridge
// (apps-script/Code.gs executed against an in-memory spreadsheet).
const appsScript = process.env.E2E_BACKEND === "appsscript";
const SECRET = "e2e-bridge-secret";

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
  webServer: [
    ...(appsScript
      ? [{
          command: "node tests/support/fake-apps-script-server.mjs",
          url: `http://localhost:${FAKE_SCRIPT_PORT}/`,
          reuseExistingServer: false,
          env: { FAKE_APPS_SCRIPT_PORT: String(FAKE_SCRIPT_PORT), APPS_SCRIPT_SECRET: SECRET },
        }]
      : []),
    {
      // fresh throwaway data for every run; the demo's data/db.json is never touched
      command: `node tests/support/make-test-seed.mjs && rm -f .e2e-db.json && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        SEED_FILE: ".e2e-seed.json",
        LOCAL_DB_FILE: ".e2e-db.json",
        DATA_BACKEND: appsScript ? "appsscript" : "local",
        APPS_SCRIPT_URL: `http://localhost:${FAKE_SCRIPT_PORT}/exec`,
        APPS_SCRIPT_SECRET: SECRET,
        SEED_DEMO_DATA: appsScript ? "true" : "",
        SESSION_SECRET: "e2e-test-secret-0123456789abcdefghijklmnop",
        GOOGLE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com",
        GOOGLE_OAUTH_CLIENT_SECRET: "test-secret",
        ALLOWED_EMAIL_DOMAIN: "nirmauni.ac.in",
        CONFERENCE_EMAIL: "",
      },
    },
  ],
});
