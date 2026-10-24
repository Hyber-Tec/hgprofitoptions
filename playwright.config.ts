import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { defineConfig, devices } from "@playwright/test"

/**
 * The app's port: 3100, or E2E_PORT when something else already listens there. Playwright never reuses
 * a server it finds on the port, since that may be another app entirely.
 */
const port = Number(process.env.E2E_PORT ?? 3100)
const baseURL = `http://localhost:${String(port)}`

/** The app under test reads its configuration from .env.e2e (demo project, test emulator ports). */
const appEnv = {
  ...(parseEnv(readFileSync(".env.e2e", "utf8")) as Record<string, string>),
  NEXT_PUBLIC_SITE_URL: baseURL,
}

/**
 * End-to-end tests against a production build (`next start`) and the test emulators. Run with
 * `pnpm test:e2e`, which starts the emulators, seeds demo data and then runs Playwright.
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
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /(public|member)\.spec\.ts/ },
  ],
  webServer: [
    {
      // Live quotes and ticker history come from a stand-in for the market data API.
      command: "pnpm exec tsx --env-file=.env.e2e scripts/fake-market-data.ts --port=7656",
      url: "http://127.0.0.1:7656/health",
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Quiz questions and class summaries come from a stand-in for the AI API.
      command: "pnpm exec tsx scripts/fake-ai.ts --port=7658",
      url: "http://127.0.0.1:7658/health",
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `pnpm exec next build && pnpm exec next start -p ${String(port)}`,
      env: appEnv,
      url: baseURL,
      timeout: 600_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
})
