"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment } from "react"
import { LuBell } from "react-icons/lu"
import { formatDate } from "@/core/format"
import { isIsoDate } from "@/core/dates"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { UserMenu } from "@/components/shared/user-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandSearch } from "./command-search"
import { useLiveAlerts } from "./live-alerts"
import { SEGMENT_LABELS } from "./nav"
import type { PortalArea } from "./app-sidebar"

const ADMIN_LABELS: Record<string, string> = {
  members: "Members",
  alerts: "Alerts",
  targets: "Strike targets",
  "market-data": "Market data",
  settings: "Settings",
  presentations: "Presentations",
  files: "Files",
}
const NEW_LABELS: Record<string, string> = { members: "Add member", alerts: "New alert", targets: "New update" }

function crumbLabel(segment: string, parent: string | undefined, area: PortalArea): string {
  if (area === "admin") {
    if (segment === "new" && parent) return NEW_LABELS[parent] ?? "New"
    const adminLabel = ADMIN_LABELS[segment]
    if (adminLabel) return adminLabel
    if (parent === "alerts") return "Alert"
    if (parent === "targets") return "Update"
  }
  const known = SEGMENT_LABELS[segment]
  if (known) return known
  const decoded = decodeURIComponent(segment)
  if (parent === "stocks") return decoded.toUpperCase()
  if (parent === "targets" && isIsoDate(decoded)) return formatDate(decoded)
  if (parent === "alerts") return "Alert"
  if (parent === "journal") return "Trade"
  if (parent === "members") return "Member"
  return decoded
}

/** Path prefixes with no page of their own: shown in the trail, but not as links. */
const WITHOUT_PAGE = new Set(["/members/stocks"])

function Crumbs({ area }: { area: PortalArea }) {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const crumbs = segments.map((segment, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: crumbLabel(segment, segments[i - 1], area),
  }))
  // The area root is implied by the sidebar; start from the page's own section.
  const visible =
    crumbs.length > 1
      ? crumbs.slice(1)
      : crumbs.map((c) => ({ ...c, label: area === "admin" ? "Overview" : "Dashboard" }))
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {visible.map((crumb, i) => {
          const last = i === visible.length - 1
          return (
            <Fragment key={crumb.href}>
              {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={last ? "min-w-0" : "hidden md:inline-flex"}>
                {last ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : WITHOUT_PAGE.has(crumb.href) ? (
                  <span className="text-muted-foreground">{crumb.label}</span>
                ) : (
                  <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function AlertsBell() {
  const { unread } = useLiveAlerts()
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
      render={<Link href="/members/alerts" />}
      nativeButton={false}
    >
      <LuBell />
      {unread > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] leading-none font-semibold text-background tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  )
}

export function PortalHeader({
  area,
  viewer,
  hasAccess,
}: {
  area: PortalArea
  viewer: { fullName: string; email: string; role: "admin" | "member" }
  hasAccess: boolean
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
      <Crumbs area={area} />
      <div className="ml-auto flex items-center gap-1">
        <CommandSearch isAdmin={viewer.role === "admin"} hasAccess={hasAccess} />
        {hasAccess && <AlertsBell />}
        <ThemeToggle />
        <UserMenu viewer={viewer} compact />
      </div>
    </header>
  )
}
