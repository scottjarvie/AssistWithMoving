import { defineConfig, devices } from "@playwright/test";

// Override: run e2e against the already-running revamp dev server on :3829,
// no build, reuse server. Used for fast foundation verification.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global.setup.ts",
  use: {
    baseURL: "http://localhost:3829",
    trace: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
