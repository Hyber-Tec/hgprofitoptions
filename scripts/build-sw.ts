/**
 * Bundles the push notification service worker into public/firebase-messaging-sw.js with the
 * Firebase web config baked in (it is public by design). Runs before `next dev` and `next build`.
 */
import { build } from "esbuild"

const env = (name: string) => process.env[name] ?? ""

const config = {
  apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: env("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("NEXT_PUBLIC_FIREBASE_APP_ID"),
}

const missing = Object.entries(config)
  .filter(([, v]) => v === "")
  .map(([k]) => k)
if (missing.length > 0)
  console.warn(`build-sw: missing ${missing.join(", ")}; push notifications will not work in this build.`)

await build({
  entryPoints: ["src/sw/firebase-messaging-sw.ts"],
  outfile: "public/firebase-messaging-sw.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  legalComments: "none",
  tsconfig: "src/sw/tsconfig.json",
  define: { __FIREBASE_CONFIG__: JSON.stringify(config) },
  logLevel: "warning",
})
console.log("build-sw: wrote public/firebase-messaging-sw.js")
