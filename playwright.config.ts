import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { defineConfig, devices } from "@playwright/test"

/** The app under test reads its configuration from .env.e2e (demo project, test emulator ports). */
const appEnv = parseEnv(readFileSync(".env.e2e", "utf8")) as Record<string, string>

/**
 * End-to-end tests against a production build (`next start` on port 3100) and the test emulators.
 * Run with `pnpm test:e2e`, which starts the emulators, seeds demo data and then runs Playwright.
 */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  // The tests share one seeded database and some of them change it.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /(public|member)\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm exec next build && pnpm exec next start -p 3100",
    env: appEnv,
    url: "http://localhost:3100",
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
})
