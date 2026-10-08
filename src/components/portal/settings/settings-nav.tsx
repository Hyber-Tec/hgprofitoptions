"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const ITEMS: { href: Route; label: string }[] = [
  { href: "/members/settings", label: "Profile and security" },
  { href: "/members/settings/notifications", label: "Notifications" },
  { href: "/members/settings/brokerages", label: "Brokerages" },
  { href: "/members/settings/sessions", label: "Sessions" },
]

export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b">
      {ITEMS.map((item) => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
