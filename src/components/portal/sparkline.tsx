import { cn } from "@/lib/utils"

/** A tiny inline line chart (no axes) for trends inside cards and tables. */
export function Sparkline({
  values,
  className,
  label,
}: {
  values: readonly number[]
  className?: string
  label?: string
}) {
  if (values.length < 2) return null
  const width = 100
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map(
    (v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(2)}`,
  )
  const up = (values.at(-1) ?? 0) >= (values[0] ?? 0)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-8 w-24 overflow-visible", up ? "text-positive" : "text-negative", className)}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
