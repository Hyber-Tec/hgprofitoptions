// Each variable is referenced literally so Next.js can inline it into browser bundles. The checks are
// plain functions rather than a schema, so no validation library ships to every browser.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`)
  return value
}

function siteUrl(value: string | undefined): string {
  const url = value || "http://localhost:3000"
  if (!/^https?:\/\/[^/\s]+/.test(url)) throw new Error(`NEXT_PUBLIC_SITE_URL is not a web address: ${url}`)
  return url
}

function flag(name: string, value: string | undefined): "true" | "false" {
  if (!value) return "false"
  if (value !== "true" && value !== "false") throw new Error(`${name} must be "true" or "false".`)
  return value
}

function port(name: string, value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback
  if (!Number.isInteger(parsed)) throw new Error(`${name} is not a port number: ${value ?? ""}`)
  return parsed
}

export const publicEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: required("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: required(
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: required(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: required(
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: required(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  NEXT_PUBLIC_FIREBASE_APP_ID: required("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  /** Optional Web Push certificate key; without it the Firebase default key is used. */
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || undefined,
  NEXT_PUBLIC_SITE_URL: siteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: flag(
    "NEXT_PUBLIC_USE_FIREBASE_EMULATORS",
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
  ),
  /** Emulator ports for the browser; the defaults match firebase.json (tests use firebase.test.json). */
  NEXT_PUBLIC_AUTH_EMULATOR_PORT: port(
    "NEXT_PUBLIC_AUTH_EMULATOR_PORT",
    process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT,
    7399,
  ),
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: port(
    "NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT",
    process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
    7380,
  ),
  NEXT_PUBLIC_STORAGE_EMULATOR_PORT: port(
    "NEXT_PUBLIC_STORAGE_EMULATOR_PORT",
    process.env.NEXT_PUBLIC_STORAGE_EMULATOR_PORT,
    7499,
  ),
}

export const useEmulators = publicEnv.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"

export const firebaseWebConfig = {
  apiKey: publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: publicEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: publicEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
  ...(publicEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    ? { measurementId: publicEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID }
    : {}),
}
