"use client"

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from "firebase/auth"
import { firebaseWebConfig, publicEnv, useEmulators } from "@/lib/env.public"

// Firestore and Storage have their own modules (client-db.ts, client-storage.ts), so a page loads only
// the Firebase SDKs it uses.

let auth: Auth | null = null

export function firebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig)
}

export function clientAuth(): Auth {
  if (auth) return auth
  auth = getAuth(firebaseApp())
  if (useEmulators)
    connectAuthEmulator(auth, `http://127.0.0.1:${publicEnv.NEXT_PUBLIC_AUTH_EMULATOR_PORT}`, { disableWarnings: true })
  void setPersistence(auth, browserLocalPersistence)
  return auth
}
