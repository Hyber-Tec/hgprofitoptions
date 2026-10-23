import type { LiveQuote } from "@/core/domain/types"
import { cn } from "@/lib/utils"

type Session = LiveQuote["marketStatus"]

/** "Real-time", "15 min delayed", "Pre-market", "After hours" or "Market closed". */
export function sessionLabel(status: Session, realTime: boolean): string {
  if (status === "early_trading") return "Pre-market"
  if (status === "late_trading") return "After hours"
  if (status === "closed") return "Market closed"
  return realTime ? "Real-time" : "15 min delayed"
}

/**
 * A small dot next to a price that refreshes by itself: green and pulsing while the market is open,
 * amber before and after hours, gray when it is closed.
 */
export function LiveDot({ status, className }: { status: Session; className?: string }) {
  const open = status === "open" || status === null
  const extended = status === "early_trading" || status === "late_trading"
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      {open && <span className="absolute inline-flex size-full rounded-full bg-positive/60 motion-safe:animate-ping" />}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          open ? "bg-positive" : extended ? "bg-warning" : "bg-muted-foreground/60",
        )}
      />
      <span className="sr-only">{open ? "Live price" : extended ? "Extended-hours price" : "Market closed"}</span>
    </span>
  )
}
