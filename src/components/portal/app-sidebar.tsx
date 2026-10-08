"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LuCalendarCheck, LuChevronsUpDown, LuLayoutDashboard, LuShield } from "react-icons/lu"
import type { MembershipSummary } from "@/core/membership/summary"
import { cn } from "@/lib/utils"
import { LinkPendingIcon } from "@/components/shared/link-pending"
import { LogoMark } from "@/components/site/logo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useLiveAlerts } from "./live-alerts"
import { ADMIN_NAV, MEMBER_NAV, isActivePath, type NavGroup } from "./nav"

export type PortalArea = "members" | "admin"

const TONE_DOT: Record<MembershipSummary["tone"], string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  muted: "bg-muted-foreground",
  negative: "bg-negative",
}

function navFor(area: PortalArea, hasAccess: boolean): NavGroup[] {
  if (area === "admin") return ADMIN_NAV
  return MEMBER_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => (hasAccess ? item.href !== "/members/inactive" : item.inactive === true)),
  })).filter((group) => group.items.length > 0)
}

function AreaSwitcher({ area, isAdmin }: { area: PortalArea; isAdmin: boolean }) {
  const title = area === "admin" ? "Admin console" : "Member area"
  const brand = (
    <>
      <LogoMark className="size-8" />
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-semibold">HG Profit Options</span>
        <span className="truncate text-xs text-muted-foreground">{title}</span>
      </span>
    </>
  )
  if (!isAdmin) {
    return (
      <SidebarMenuButton size="lg" render={<Link href="/members" />}>
        {brand}
      </SidebarMenuButton>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
          />
        }
      >
        {brand}
        <LuChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch to</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/members" />}>
            <LuLayoutDashboard />
            Member area
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/admin" />}>
            <LuShield />
            Admin console
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({
  area,
  isAdmin,
  hasAccess,
  membership,
}: {
  area: PortalArea
  isAdmin: boolean
  hasAccess: boolean
  membership: MembershipSummary
}) {
  const pathname = usePathname()
  const { unread } = useLiveAlerts()
  const { isMobile, setOpenMobile } = useSidebar()
  const groups = navFor(area, hasAccess)

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <AreaSwitcher area={area} isAdmin={isAdmin} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActivePath(pathname, item.href)}
                    tooltip={item.title}
                    render={
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false)
                        }}
                      />
                    }
                  >
                    <LinkPendingIcon icon={item.icon} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.badge === "unread" && unread > 0 && (
                    <SidebarMenuBadge className="rounded-full bg-sidebar-primary px-1.5 text-sidebar-primary-foreground tabular-nums">
                      <span className="sr-only">Unread alerts: </span>
                      {unread > 9 ? "9+" : unread}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {area === "members" && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip={`${membership.label} · ${membership.detail}`}
                render={<Link href={hasAccess ? "/members/settings" : "/members/inactive"} />}
              >
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                  <LuCalendarCheck className="size-4" />
                  <span
                    className={cn(
                      "absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar",
                      TONE_DOT[membership.tone],
                    )}
                  />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{membership.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{membership.detail}</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  )
}
