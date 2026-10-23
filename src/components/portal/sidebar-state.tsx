"use client"

import { useCallback, useState, type ReactNode } from "react"
import { saveSidebarCollapsed } from "@/lib/actions/settings"
import { SidebarProvider } from "@/components/ui/sidebar"

/**
 * Keeps the sidebar open or collapsed between visits. The choice is saved with the account, so the server
 * renders the sidebar the way it was left and nothing moves once the page loads.
 */
export function PortalSidebarProvider({ initialOpen, children }: { initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen)
  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    // A failed save only means the next visit opens the sidebar the way it was before.
    saveSidebarCollapsed(!next).catch(() => undefined)
  }, [])
  return (
    <SidebarProvider open={open} onOpenChange={onOpenChange}>
      {children}
    </SidebarProvider>
  )
}
