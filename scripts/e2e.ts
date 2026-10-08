/**
 * End-to-end run, started by `pnpm test:e2e` inside `firebase emulators:exec`: seeds the test emulators
 * with the demo data under a password made for this run (never stored), then runs Playwright.
 * Extra arguments go to Playwright, for example `pnpm test:e2e --project=desktop`.
 */
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const password = `e2e-${randomBytes(12).toString("base64url")}`

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run("pnpm", ["exec", "tsx", "--env-file=.env.e2e", "scripts/seed-demo.ts", `--password=${password}`])
run("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { E2E_PASSWORD: password })
