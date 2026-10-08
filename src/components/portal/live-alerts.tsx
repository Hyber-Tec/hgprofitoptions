"use client"

import { usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react"
import { ALERT_KIND_LABEL } from "@/core/alerts"
import { toast } from "@/components/ui/toast"
import type { LiveAlert } from "./live-alerts-listener"

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
 * Keeps the unread badge and new-alert toasts live with Firestore listeners (live-alerts-listener.ts).
 * The listener and the Firebase SDK load after the page is interactive, so they never delay a page;
 * until they connect, and without a signed-in Firebase client user, the server-rendered count shows.
 */
export function LiveAlertsProvider({
  uid,
  enabled,
  baselineMs,
  countedAtMs,
  initialUnread,
  children,
}: {
  uid: string
  enabled: boolean
  baselineMs: number
  /** When the server counted initialUnread. Alerts published later are news to this page. */
  countedAtMs: number
  initialUnread: number
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [alerts, setAlerts] = useState<LiveAlert[] | null>(null)
  const [readIds, setReadIds] = useState<Set<string> | null>(null)
  const seen = useRef<Set<string> | null>(null)

  const showAlerts = useEffectEvent((list: LiveAlert[]) => {
    const previous = seen.current
    // The first snapshot can arrive a moment after the page loads, so it is compared with what the
    // server counted; later snapshots with the one before.
    const isNew = (a: LiveAlert) => (previous ? !previous.has(a.id) : a.publishedAt > countedAtMs)
    const fresh = list.filter((a) => isNew(a) && a.publishedAt > Date.now() - TOAST_WINDOW_MS)
    if (fresh.length > 0) {
      for (const alert of fresh) {
        toast.add({
          title: `${ALERT_KIND_LABEL[alert.kind]} · ${alert.title}`,
          description: "New alert from HG",
          type: "info",
          timeout: 12_000,
          actionProps: { children: "View", onClick: () => router.push(`/members/alerts/${alert.id}`) },
        })
      }
      if (pathname === "/members" || pathname.startsWith("/members/alerts")) router.refresh()
    }
    seen.current = new Set(list.map((a) => a.id))
    setAlerts(list)
  })

  useEffect(() => {
    if (!enabled) return
    let stop: (() => void) | null = null
    let cancelled = false
    import("./live-alerts-listener")
      .then(({ listenToAlerts }) => {
        if (cancelled) return
        stop = listenToAlerts(uid, FEED_SIZE, {
          onAlerts: (list) => showAlerts(list),
          onReads: setReadIds,
          onIdle: () => {
            seen.current = null
            setAlerts(null)
            setReadIds(null)
          },
        })
      })
      .catch(() => console.warn("Live alerts are unavailable: the listener did not load."))
    return () => {
      cancelled = true
      stop?.()
    }
  }, [enabled, uid])

  const value = useMemo<LiveAlertsValue>(() => {
    if (!alerts || !readIds) return { unread: initialUnread, live: false }
    return { unread: alerts.filter((a) => a.publishedAt > baselineMs && !readIds.has(a.id)).length, live: true }
  }, [alerts, readIds, baselineMs, initialUnread])

  return <LiveAlertsContext.Provider value={value}>{children}</LiveAlertsContext.Provider>
}
