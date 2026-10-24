import type { Route } from "next"
import Link from "next/link"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "alerts", label: "Trade alerts", href: "/members/alerts" },
  { key: "brief", label: "Market brief", href: "/members/alerts/brief" },
  { key: "spikes", label: "Spikes", href: "/members/alerts/spikes" },
] as const

/** Everything HG sends, in one place: his trade alerts, the market brief and the spike lists. */
export function AlertsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Alerts" className="-mt-2 flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href as Route}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            tab.key === current
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
