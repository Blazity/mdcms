import { defineConfig, devices } from "@playwright/test";

// The e2e suite currently targets a running Studio example dev/preview server
// (Vite preview defaults to port 4173). Start that server manually before
// running `bun run e2e`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  // Studio boot streams a ~13MB runtime bundle on first visit; keep the
  // per-test timeout generous enough to absorb that without masking real
  // regressions.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
