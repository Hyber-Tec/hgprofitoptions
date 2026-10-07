/**
 * Firebase Admin for scripts. Scripts write to the local emulators by default (the *_EMULATOR_HOST
 * variables from .env.local). Writing to the real project needs `--prod` and Application Default
 * Credentials (`gcloud auth application-default login`).
 */
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

const EMULATOR_VARS = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
] as const

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

export function option(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

export function initAdmin() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!projectId || !storageBucket)
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET must be set (run with --env-file=.env.local).",
    )
  const production = flag("prod")
  if (production) {
    for (const name of EMULATOR_VARS) Reflect.deleteProperty(process.env, name)
  } else if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set. Start the emulators, or pass --prod to write to the real project.",
    )
  }
  const app = getApps()[0] ?? initializeApp({ projectId, storageBucket })
  const target = production ? `project ${projectId}` : `emulators (${process.env.FIRESTORE_EMULATOR_HOST ?? ""})`
  console.log(`Writing to ${target}`)
  return { db: getFirestore(app), auth: getAuth(app), bucket: getStorage(app).bucket(), production, projectId }
}
