/**
 * Bundles the Cloud Functions (functions/src plus the shared src/core and src/server code they import)
 * into functions/lib/index.js. firebase-admin and firebase-functions stay external: Cloud Build installs
 * them from functions/package.json.
 */
import { build } from "esbuild"

await build({
  entryPoints: ["functions/src/index.ts"],
  outfile: "functions/lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  tsconfig: "functions/tsconfig.json",
  external: ["firebase-admin", "firebase-functions"],
  // Some bundled CommonJS code calls require(); give ESM output one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
})
console.log("build-functions: wrote functions/lib/index.js")
