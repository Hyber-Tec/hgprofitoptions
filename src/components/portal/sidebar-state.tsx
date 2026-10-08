"use client"

import { useCallback, useSyncExternalStore, type ReactNode } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"

const COOKIE = "sidebar_state"
const MAX_AGE = 60 * 60 * 24 * 7
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const readOpen = () => !document.cookie.split("; ").includes(`${COOKIE}=false`)

/**
 * Keeps the sidebar open or collapsed between visits. The server renders from the cookie when it gets
 * it, but Firebase Hosting forwards only the session cookie, so the browser's copy decides.
 */
export function PortalSidebarProvider({ serverOpen, children }: { serverOpen: boolean; children: ReactNode }) {
  const open = useSyncExternalStore(subscribe, readOpen, () => serverOpen)
  const onOpenChange = useCallback((next: boolean) => {
    document.cookie = `${COOKIE}=${String(next)}; path=/; max-age=${MAX_AGE}; samesite=lax`
    for (const listener of listeners) listener()
  }, [])
  return (
    <SidebarProvider open={open} onOpenChange={onOpenChange}>
      {children}
    </SidebarProvider>
  )
}
