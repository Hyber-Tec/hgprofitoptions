"use client"

import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore"
import { publicEnv, useEmulators } from "@/lib/env.public"
import { firebaseApp } from "./client"

let db: Firestore | null = null

export function clientDb(): Firestore {
  if (db) return db
  db = getFirestore(firebaseApp())
  if (useEmulators) connectFirestoreEmulator(db, "127.0.0.1", publicEnv.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT)
  return db
}
