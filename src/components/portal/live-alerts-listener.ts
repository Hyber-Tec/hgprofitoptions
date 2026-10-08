import { onAuthStateChanged } from "firebase/auth"
import {
  collection,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore"
import type { AlertKind } from "@/core/domain/types"
import { clientAuth } from "@/lib/firebase/client"
import { clientDb } from "@/lib/firebase/client-db"

export interface LiveAlert {
  id: string
  kind: AlertKind
  title: string
  publishedAt: number
}

/**
 * Listens to HG's latest alerts and this member's read receipts with the Firestore client SDK
 * (security rules allow it for active members) while the Firebase client user is this member.
 * LiveAlertsProvider loads this module after the page is interactive. Returns a function that stops
 * every listener.
 */
export function listenToAlerts(
  uid: string,
  feedSize: number,
  handlers: {
    onAlerts: (alerts: LiveAlert[]) => void
    onReads: (ids: Set<string>) => void
    /** The Firebase client user is not (or no longer) this member. */
    onIdle: () => void
  },
): () => void {
  let stopFeed: Unsubscribe | null = null
  let stopReads: Unsubscribe | null = null
  let readsKey = ""
  const stopListeners = () => {
    stopFeed?.()
    stopReads?.()
    stopFeed = null
    stopReads = null
    readsKey = ""
  }

  const stopAuth = onAuthStateChanged(clientAuth(), (user) => {
    stopListeners()
    if (user?.uid !== uid) {
      handlers.onIdle()
      return
    }
    const db = clientDb()
    const feed = query(
      collection(db, "alerts"),
      where("status", "in", ["published", "closed"]),
      orderBy("publishedAt", "desc"),
      limit(feedSize),
    )
    stopFeed = onSnapshot(
      feed,
      (snap) => {
        const alerts = snap.docs.map((d) => ({
          id: d.id,
          kind: d.get("kind") as AlertKind,
          title: String(d.get("title") ?? ""),
          publishedAt: (d.get("publishedAt") as Timestamp | null)?.toMillis() ?? 0,
        }))
        handlers.onAlerts(alerts)
        // Read receipts for exactly these alerts; the listener follows the feed as it changes.
        const key = alerts.map((a) => a.id).join(",")
        if (key === readsKey) return
        readsKey = key
        stopReads?.()
        stopReads = null
        if (alerts.length === 0) {
          handlers.onReads(new Set())
          return
        }
        const reads = query(
          collection(db, "members", uid, "alertReads"),
          where(
            documentId(),
            "in",
            alerts.map((a) => a.id),
          ),
        )
        stopReads = onSnapshot(
          reads,
          (receipts) => handlers.onReads(new Set(receipts.docs.map((d) => d.id))),
          (error) => console.warn("Read receipts are unavailable:", error.code),
        )
      },
      (error) => console.warn("Live alerts are unavailable:", error.code),
    )
  })

  return () => {
    stopAuth()
    stopListeners()
  }
}
