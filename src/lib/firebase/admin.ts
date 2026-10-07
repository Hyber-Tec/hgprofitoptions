import "server-only"
import { getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getMessaging } from "firebase-admin/messaging"
import { getStorage } from "firebase-admin/storage"
import { publicEnv } from "@/lib/env.public"

/**
 * Admin SDK for server code. On App Hosting it authenticates as the backend's service account
 * (Application Default Credentials), so no key file is ever needed. Locally the *_EMULATOR_HOST
 * variables in .env.local point it at the Firebase Emulator Suite.
 */
function app(): App {
  return (
    getApps()[0] ??
    initializeApp({
      projectId: publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: publicEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  )
}

export const adminAuth = () => getAuth(app())
export const adminDb = () => {
  const db = getFirestore(app())
  return db
}
export const adminBucket = () => getStorage(app()).bucket()
export const adminMessaging = () => getMessaging(app())
