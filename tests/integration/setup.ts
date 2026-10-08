import { deleteApp, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

/** An Admin SDK app on the Firestore emulator started by `pnpm test:emulators`. */
export function emulatorDb(name: string): {
  db: Firestore
  app: App
  clear: () => Promise<void>
  close: () => Promise<void>
} {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (!host) throw new Error("Run integration tests with `pnpm test:emulators` (needs the Firestore emulator).")
  const projectId = "demo-hgprofitoptions"
  const app = initializeApp({ projectId }, name)
  const db = getFirestore(app)
  return {
    db,
    app,
    clear: async () => {
      await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
        method: "DELETE",
      })
    },
    close: () => deleteApp(app),
  }
}
