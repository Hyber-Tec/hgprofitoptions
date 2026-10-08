import { cookies } from "next/headers"
import type { ReactNode } from "react"
import { membershipSummary } from "@/core/membership/summary"
import type { Viewer } from "@/lib/auth/guards"
import { countUnread } from "@/lib/data/alerts"
import { SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar, type PortalArea } from "./app-sidebar"
import { LiveAlertsProvider } from "./live-alerts"
import { PortalHeader } from "./portal-header"
import { PortalSidebarProvider } from "./sidebar-state"

/** The signed-in app frame shared by the member area and the admin console. */
export async function PortalShell({
  area,
  viewer,
  children,
}: {
  area: PortalArea
  viewer: Viewer
  children: ReactNode
}) {
  const cookieStore = await cookies()
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const since = viewer.member.createdAt
  // Alerts published after the count are news to this page, so they get a toast.
  const unread = viewer.hasAccess ? await countUnread(viewer.uid, since) : { count: 0, countedAt: 0 }
  const summary = membershipSummary(viewer.status)
  const person = { fullName: viewer.fullName, email: viewer.email, role: viewer.role }

  return (
    <LiveAlertsProvider
      uid={viewer.uid}
      enabled={viewer.hasAccess}
      baselineMs={since.getTime()}
      countedAtMs={unread.countedAt}
      initialUnread={unread.count}
    >
      <PortalSidebarProvider serverOpen={sidebarOpen}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
        >
          Skip to content
        </a>
        <AppSidebar area={area} isAdmin={viewer.role === "admin"} hasAccess={viewer.hasAccess} membership={summary} />
        <SidebarInset className="min-w-0">
          <PortalHeader area={area} viewer={person} hasAccess={viewer.hasAccess} />
          <div id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-6 p-4 outline-none sm:p-6 lg:p-8">
            {children}
          </div>
        </SidebarInset>
      </PortalSidebarProvider>
    </LiveAlertsProvider>
  )
}
