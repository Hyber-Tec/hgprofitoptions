import { z } from "zod"

const schema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  /** Optional Web Push certificate key; without it the Firebase default key is used. */
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: z.enum(["true", "false"]).default("false"),
  /** Emulator ports for the browser; the defaults match firebase.json (tests use firebase.test.json). */
  NEXT_PUBLIC_AUTH_EMULATOR_PORT: z.coerce.number().int().default(7399),
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: z.coerce.number().int().default(7380),
  NEXT_PUBLIC_STORAGE_EMULATOR_PORT: z.coerce.number().int().default(7499),
})

// Each variable is referenced literally so Next.js can inline it into browser bundles.
export const publicEnv = schema.parse({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || undefined,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS || undefined,
  NEXT_PUBLIC_AUTH_EMULATOR_PORT: process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT || undefined,
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || undefined,
  NEXT_PUBLIC_STORAGE_EMULATOR_PORT: process.env.NEXT_PUBLIC_STORAGE_EMULATOR_PORT || undefined,
})

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
