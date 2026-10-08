import { cn } from "@/lib/utils"

/**
 * A compact horizontal channel ladder: main lines as tall ticks, BOC lines as short ticks,
 * the 30-day median as a hollow marker and the price as a solid dot.
 */
export function MiniLadder({
  price,
  lines,
  bocLevels,
  median,
  width = 120,
  className,
}: {
  price: number
  lines: readonly number[]
  bocLevels: readonly number[]
  median?: number | null
  /** Drawing width in pixels at the ladder's 24px height. It keeps its proportions when the box is wider. */
  width?: number
  className?: string
}) {
  const values = [...lines, ...bocLevels, price, ...(median ? [median] : [])]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (v: number) => 4 + ((v - min) / span) * (width - 8)
  return (
    <svg
      viewBox={`0 0 ${width} 24`}
      style={{ width }}
      className={cn("h-6 max-w-full", className)}
      role="img"
      aria-label={`Price ${price.toFixed(2)} on its channel ladder`}
    >
      <line x1={4} x2={width - 4} y1={12} y2={12} className="stroke-border" strokeWidth={1} />
      {lines.map((v) => (
        <line key={`l${v}`} x1={x(v)} x2={x(v)} y1={5} y2={19} className="stroke-muted-foreground/70" strokeWidth={1} />
      ))}
      {bocLevels.map((v) => (
        <line key={`b${v}`} x1={x(v)} x2={x(v)} y1={9} y2={15} className="stroke-muted-foreground/40" strokeWidth={1} />
      ))}
      {median ? (
        <circle cx={x(median)} cy={12} r={3} className="fill-background stroke-warning" strokeWidth={1.5} />
      ) : null}
      <circle cx={x(price)} cy={12} r={3.5} className="fill-foreground" />
    </svg>
  )
}
