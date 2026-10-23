import type { CSSProperties } from "react"
import { formatFixed, formatPrice } from "@/core/format"
import { cn } from "@/lib/utils"

/**
 * One stock's channel ladder laid out like HG's sheet: the channel lines in a row with the last close in
 * the middle, the BOC levels between them on the row above, and a track below with the price on it.
 * `steps` is how many lines to show on each side (the sheet shows 4).
 */
export function ChannelStrip({
  lines,
  bocBelow,
  bocAbove,
  price,
  steps,
  className,
}: {
  /** anchor + k x CH for k = -4..4. */
  lines: readonly (number | null)[]
  /** Nearest first. */
  bocBelow: readonly (number | null)[]
  bocAbove: readonly (number | null)[]
  price: number
  steps: number
  className?: string
}) {
  const middle = (lines.length - 1) / 2
  const shownLines = lines.slice(middle - steps, middle + steps + 1)
  const shownBoc = [...bocBelow.slice(0, steps).reverse(), ...bocAbove.slice(0, steps)]
  const columns = shownLines.length * 2
  // Left to right the levels alternate line, BOC, line, ... and sit 1/columns apart.
  const sequence = shownLines
    .flatMap((line, k) => (k < shownBoc.length ? [line, shownBoc[k] ?? null] : [line]))
    .map((value, i) => ({ value, x: (i + 1) / columns }))
    .filter((p): p is { value: number; x: number } => p.value !== null)
  const marker = position(sequence, price)
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }

  return (
    <div className={cn("grid gap-y-1", className)} style={grid}>
      {shownBoc.map((value, j) => (
        <span
          key={`b${j}`}
          style={{ gridColumn: `${2 * j + 2} / span 2`, gridRow: 1 }}
          className="truncate text-center text-[11px] leading-4 text-muted-foreground tabular-nums"
        >
          {value === null ? "" : formatFixed(value)}
        </span>
      ))}
      {shownLines.map((value, k) => (
        <span
          key={`l${k}`}
          style={{ gridColumn: `${2 * k + 1} / span 2`, gridRow: 2 }}
          className={cn(
            "mx-0.5 truncate rounded-md py-0.5 text-center text-[13px] leading-5 tabular-nums sm:text-sm",
            k === steps ? "bg-muted font-semibold text-foreground" : "text-foreground/80",
          )}
        >
          {value === null ? "" : formatFixed(value)}
        </span>
      ))}
      <div style={{ gridColumn: "1 / -1", gridRow: 3 }} className="relative mx-1 mt-1 h-3">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {sequence.map((p) => (
          <span
            key={p.x}
            className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-muted-foreground/40"
            style={{ left: `${p.x * 100}%` }}
          />
        ))}
        {marker !== null && (
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
            style={{ left: `${marker * 100}%` }}
            role="img"
            aria-label={`Price ${formatPrice(price)}`}
          />
        )}
      </div>
    </div>
  )
}

/** Where a price falls along the levels, as a fraction of the width (kept inside the ends). */
function position(sequence: readonly { value: number; x: number }[], price: number): number | null {
  const first = sequence[0]
  const last = sequence.at(-1)
  if (!first || !last) return null
  if (price <= first.value) return Math.max(0.01, first.x - 0.5 / sequence.length)
  if (price >= last.value) return Math.min(0.99, last.x + 0.5 / sequence.length)
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i]
    const b = sequence[i + 1]
    if (a && b && price >= a.value && price <= b.value) {
      return a.x + ((price - a.value) / (b.value - a.value || 1)) * (b.x - a.x)
    }
  }
  return null
}
