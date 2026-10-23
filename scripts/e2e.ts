/**
 * End-to-end run (`pnpm test:e2e`): starts the test emulators, seeds them with the demo data under a
 * password made for this run (never stored), then runs Playwright. Extra arguments go to Playwright, for
 * example `pnpm test:e2e --project=desktop tests/e2e/chat.spec.ts`.
 */
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const forwarded = process.argv.slice(2)

if (process.env.E2E_EMULATORS !== "1") {
  // Outside the emulators: start them and run this script again inside, with the same arguments.
  const quoted = forwarded.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")
  run("pnpm", [
    "exec",
    "tsx",
    "scripts/emulators-exec.ts",
    "--config",
    "firebase.test.json",
    "--only",
    "auth,firestore,storage",
    "--project",
    "demo-hgprofitoptions",
    `E2E_EMULATORS=1 tsx scripts/e2e.ts ${quoted}`.trim(),
  ])
  process.exit(0)
}

const password = `e2e-${randomBytes(12).toString("base64url")}`
run("pnpm", ["exec", "tsx", "--env-file=.env.e2e", "scripts/seed-demo.ts", `--password=${password}`])
run("pnpm", ["exec", "playwright", "test", ...forwarded], { E2E_PASSWORD: password })
