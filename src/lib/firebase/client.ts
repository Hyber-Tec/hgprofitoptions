"use client"

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from "firebase/auth"
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore"
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage"
import { firebaseWebConfig, publicEnv, useEmulators } from "@/lib/env.public"

const EMULATOR_PORTS = {
  auth: publicEnv.NEXT_PUBLIC_AUTH_EMULATOR_PORT,
  firestore: publicEnv.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
  storage: publicEnv.NEXT_PUBLIC_STORAGE_EMULATOR_PORT,
}

let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

export function firebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig)
}

export function clientAuth(): Auth {
  if (auth) return auth
  auth = getAuth(firebaseApp())
  if (useEmulators) connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true })
  void setPersistence(auth, browserLocalPersistence)
  return auth
}

export function clientDb(): Firestore {
  if (db) return db
  db = getFirestore(firebaseApp())
  if (useEmulators) connectFirestoreEmulator(db, "127.0.0.1", EMULATOR_PORTS.firestore)
  return db
}

export function clientStorage(): FirebaseStorage {
  if (storage) return storage
  storage = getStorage(firebaseApp())
  if (useEmulators) connectStorageEmulator(storage, "127.0.0.1", EMULATOR_PORTS.storage)
  return storage
}
