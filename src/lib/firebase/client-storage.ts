"use client"

import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage"
import { publicEnv, useEmulators } from "@/lib/env.public"
import { firebaseApp } from "./client"

let storage: FirebaseStorage | null = null

export function clientStorage(): FirebaseStorage {
  if (storage) return storage
  storage = getStorage(firebaseApp())
  if (useEmulators) connectStorageEmulator(storage, "127.0.0.1", publicEnv.NEXT_PUBLIC_STORAGE_EMULATOR_PORT)
  return storage
}
