/**
 * `firebase emulators:exec` with a temporary folder of its own; the arguments go to emulators:exec. The
 * Storage emulator keeps its files in the system temp folder and deletes that whole folder when it stops,
 * which would also delete the files of the development emulators (`pnpm emulators`) running alongside.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const dir = mkdtempSync(join(tmpdir(), "emulators-exec-"))
const result = spawnSync("pnpm", ["exec", "firebase", "emulators:exec", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, TMPDIR: dir },
})
rmSync(dir, { recursive: true, force: true })
process.exit(result.status ?? 1)
