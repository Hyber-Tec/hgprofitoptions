"use client"

import { onAuthStateChanged, type User } from "firebase/auth"
import { collection, documentId, limit, onSnapshot, orderBy, query, where, type Timestamp } from "firebase/firestore"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ALERT_KIND_LABEL } from "@/core/alerts"
import type { AlertKind } from "@/core/domain/types"
import { clientAuth, clientDb } from "@/lib/firebase/client"
import { toast } from "@/components/ui/toast"

interface LiveAlert {
  id: string
  kind: AlertKind
  title: string
  publishedAt: number
}

interface LiveAlertsValue {
  /** Unread alerts among the latest ones. */
  unread: number
  /** True once the realtime listeners are connected. */
  live: boolean
}

const LiveAlertsContext = createContext<LiveAlertsValue>({ unread: 0, live: false })

export function useLiveAlerts(): LiveAlertsValue {
  return useContext(LiveAlertsContext)
}

const FEED_SIZE = 30
/** Alerts this recent that arrive while the page is open get a toast. */
const TOAST_WINDOW_MS = 15 * 60 * 1000

/**
 * Listens to HG's alerts with the Firestore client SDK (security rules allow it for active members)
 * and to this member's read receipts, so the unread badge and toasts update without a reload.
 * Without a signed-in Firebase client user it keeps the server-rendered count.
 */
export function LiveAlertsProvider({
  uid,
  enabled,
  baselineMs,
  initialUnread,
  children,
}: {
  uid: string
  enabled: boolean
  baselineMs: number
  initialUnread: number
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [alerts, setAlerts] = useState<LiveAlert[] | null>(null)
  const [readIds, setReadIds] = useState<Set<string> | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const pathRef = useRef(pathname)

  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!enabled) return
    return onAuthStateChanged(clientAuth(), (u) => setUser(u?.uid === uid ? u : null))
  }, [enabled, uid])

  useEffect(() => {
    if (!user) return
    const feed = query(
      collection(clientDb(), "alerts"),
      where("status", "in", ["published", "closed"]),
      orderBy("publishedAt", "desc"),
      limit(FEED_SIZE),
    )
    return onSnapshot(
      feed,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          kind: d.get("kind") as AlertKind,
          title: String(d.get("title") ?? ""),
          publishedAt: (d.get("publishedAt") as Timestamp | null)?.toMillis() ?? 0,
        }))
        const previous = seen.current
        if (previous) {
          const fresh = list.filter((a) => !previous.has(a.id) && a.publishedAt > Date.now() - TOAST_WINDOW_MS)
          for (const alert of fresh) {
            toast.add({
              title: `${ALERT_KIND_LABEL[alert.kind]} · ${alert.title}`,
              description: "New alert from HG",
              type: "info",
              timeout: 12_000,
              actionProps: { children: "View", onClick: () => router.push(`/members/alerts/${alert.id}`) },
            })
          }
          const path = pathRef.current
          if (fresh.length > 0 && (path === "/members" || path.startsWith("/members/alerts"))) router.refresh()
        }
        seen.current = new Set(list.map((a) => a.id))
        setAlerts(list)
      },
      (error) => console.warn("Live alerts are unavailable:", error.code),
    )
  }, [user, router])

  const idsKey = alerts?.map((a) => a.id).join(",") ?? ""
  useEffect(() => {
    if (!user || idsKey === "") return
    const ids = idsKey.split(",").slice(0, FEED_SIZE)
    const reads = query(collection(clientDb(), "members", uid, "alertReads"), where(documentId(), "in", ids))
    return onSnapshot(
      reads,
      (snap) => setReadIds(new Set(snap.docs.map((d) => d.id))),
      (error) => console.warn("Read receipts are unavailable:", error.code),
    )
  }, [user, uid, idsKey])

  const value = useMemo<LiveAlertsValue>(() => {
    if (!alerts || !readIds) return { unread: initialUnread, live: false }
    return { unread: alerts.filter((a) => a.publishedAt > baselineMs && !readIds.has(a.id)).length, live: true }
  }, [alerts, readIds, baselineMs, initialUnread])

  return <LiveAlertsContext.Provider value={value}>{children}</LiveAlertsContext.Provider>
}
