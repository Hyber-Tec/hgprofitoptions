import type { ReactNode } from "react"
import { answersQuestions } from "@/core/levels"
import { membershipSummary } from "@/core/membership/summary"
import type { Viewer } from "@/lib/auth/guards"
import { countUnread } from "@/lib/data/alerts"
import { chatBadge } from "@/lib/data/chat"
import { countOpenAssignments } from "@/lib/data/quizzes"
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
  const since = viewer.member.createdAt
  // Alerts published after the count are news to this page, so they get a toast.
  const [unread, chatCount, tests] = await Promise.all([
    viewer.hasAccess ? countUnread(viewer.uid, since) : { count: 0, countedAt: 0 },
    chatBadge(viewer),
    viewer.hasAccess ? countOpenAssignments(viewer.uid) : 0,
  ])
  const summary = membershipSummary(viewer.status)
  const person = { fullName: viewer.fullName, email: viewer.email, role: viewer.role }

  return (
    <>
      <LiveAlertsProvider
        uid={viewer.uid}
        enabled={viewer.hasAccess}
        baselineMs={since.getTime()}
        countedAtMs={unread.countedAt}
        initialUnread={unread.count}
      >
        <PortalSidebarProvider initialOpen={!viewer.member.sidebarCollapsed}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
          >
            Skip to content
          </a>
          <AppSidebar
            area={area}
            isAdmin={viewer.role === "admin"}
            hasAccess={viewer.hasAccess}
            membership={summary}
            chat={{ count: chatCount, staff: answersQuestions(viewer.member) }}
            tests={tests}
          />
          <SidebarInset className="min-w-0">
            <PortalHeader area={area} viewer={person} hasAccess={viewer.hasAccess} />
            <div id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-6 p-4 outline-none sm:p-6 lg:p-8">
              {children}
            </div>
          </SidebarInset>
        </PortalSidebarProvider>
      </LiveAlertsProvider>
    </>
  )
}
