/**
 * Bundles the Cloud Functions (functions/src plus the shared src/core and src/server code they import)
 * into functions/lib/index.js. firebase-admin and firebase-functions stay external: Cloud Build installs
 * them from functions/package.json.
 */
import { execFileSync } from "node:child_process"
import { build } from "esbuild"

const outfile = "functions/lib/index.js"

await build({
  entryPoints: ["functions/src/index.ts"],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  tsconfig: "functions/tsconfig.json",
  external: ["firebase-admin", "firebase-functions"],
  // Some bundled CommonJS code calls require(); give ESM output one. The import is renamed because
  // bundled packages (fflate) import createRequire themselves, and two imports of one name do not load.
  banner: {
    js: "import { createRequire as __bundleRequire } from 'node:module'; const require = __bundleRequire(import.meta.url);",
  },
  logLevel: "warning",
})
// Fail here, and in CI, rather than in the deploy when Firebase loads a bundle that does not parse.
execFileSync(process.execPath, ["--check", outfile], { stdio: "inherit" })
console.log(`build-functions: wrote ${outfile}`)
