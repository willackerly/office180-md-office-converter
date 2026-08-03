// Verification: CONTRACT:C4-PPTV-SOURCE.2.0
// Verification: CONTRACT:C6-PPTV-RESOLVED.2.0
// Verification: CONTRACT:C8-PPTV-TEXT-FIT.2.0

import { defineConfig, devices } from "@playwright/test";

const port = 4178;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-browser-conformance.mjs",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], userAgent: undefined },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], userAgent: undefined },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], userAgent: undefined },
    },
  ],
});
