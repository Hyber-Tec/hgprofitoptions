import type { ReactNode } from "react"
import { LuArrowDownRight, LuArrowUpRight, LuMinus } from "react-icons/lu"
import { formatPercent, formatSigned, formatSignedMoney } from "@/core/format"
import { cn } from "@/lib/utils"

export type Tone = "positive" | "negative" | "warning" | "muted" | "neutral"

export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "muted"
  return value > 0 ? "positive" : "negative"
}

const TONE_TEXT: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  muted: "text-muted-foreground",
  neutral: "text-foreground",
}

const TONE_BADGE: Record<Tone, string> = {
  positive: "border-transparent bg-positive/12 text-positive",
  negative: "border-transparent bg-negative/12 text-negative",
  warning: "border-transparent bg-warning/15 text-warning",
  muted: "border-transparent bg-muted text-muted-foreground",
  neutral: "border-border text-foreground",
}

/** A signed value with a direction icon, so gains and losses never rely on color alone. */
export function Signed({
  value,
  as = "percent",
  digits = 2,
  icon = true,
  className,
}: {
  value: number | null | undefined
  as?: "percent" | "money" | "number"
  digits?: number
  icon?: boolean
  className?: string
}) {
  const tone = toneOf(value)
  const text =
    as === "percent"
      ? formatPercent(value, { digits })
      : as === "money"
        ? formatSignedMoney(value)
        : formatSigned(value, digits)
  const Icon = tone === "positive" ? LuArrowUpRight : tone === "negative" ? LuArrowDownRight : LuMinus
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums", TONE_TEXT[tone], className)}>
      {icon && value !== null && value !== undefined && <Icon aria-hidden="true" className="size-[0.95em] shrink-0" />}
      {text}
    </span>
  )
}

export function ToneBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-4xl border px-2 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xl font-semibold tracking-tight tabular-nums">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Small uppercase label used above groups of numbers. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-medium tracking-wide text-muted-foreground uppercase", className)}>{children}</p>
  )
}
