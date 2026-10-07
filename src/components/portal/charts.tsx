"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  Rectangle,
  ReferenceLine,
  Sector,
  XAxis,
  YAxis,
  type BarShapeProps,
  type PieSectorShapeProps,
} from "recharts"
import { formatPercent, formatPrice, formatSignedMoney } from "@/core/format"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  )
const shortMonth = (ym: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${ym}-15T12:00:00Z`),
  )

export type ValueFormat = "percent" | "money" | "signed-money"

function formatValue(value: number, format: ValueFormat): string {
  if (format === "percent") return formatPercent(value, { digits: 1 })
  if (format === "signed-money") return formatSignedMoney(value)
  return formatPrice(value)
}

/**
 * An equity curve. For "percent", pass growth relative to the start (0.12 = +12%).
 */
export function EquityCurve({
  points,
  format = "percent",
  height = 240,
  label = "Value",
}: {
  points: { date: string; value: number }[]
  format?: ValueFormat
  height?: number
  label?: string
}) {
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig
  const last = points.at(-1)?.value ?? 0
  const first = points[0]?.value ?? 0
  const up = last >= (format === "percent" ? 0 : first)
  const color = up ? "var(--positive)" : "var(--negative)"
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} tickFormatter={shortDate} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => formatValue(v, format === "signed-money" ? "money" : format)}
          domain={["auto", "auto"]}
        />
        {format === "percent" && <ReferenceLine y={0} stroke="var(--border)" />}
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                shortDate((payload[0]?.payload as { date?: string } | undefined)?.date ?? "")
              }
              formatter={(value) => (
                <span className="font-medium tabular-nums">{formatValue(Number(value), format)}</span>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill="url(#equity-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Monthly results as bars, green above zero and red below. */
export function MonthlyBars({
  data,
  height = 220,
  label = "Average result",
  format = "percent",
}: {
  data: { month: string; value: number; count?: number }[]
  height?: number
  label?: string
  format?: "percent" | "money"
}) {
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={shortMonth} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={format === "money" ? 72 : 56}
          tickFormatter={(v: number) =>
            format === "money" ? formatPrice(v).replace(/\.\d{2}$/, "") : formatPercent(v, { digits: 0 })
          }
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                shortMonth((payload[0]?.payload as { month?: string } | undefined)?.month ?? "")
              }
              formatter={(value, _name, item) => (
                <span className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">
                    {(item.payload as { count?: number }).count ?? 0} closed
                  </span>
                  <span className="font-medium tabular-nums">
                    {format === "money"
                      ? formatSignedMoney(Number(value))
                      : formatPercent(Number(value), { digits: 1 })}
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          radius={4}
          maxBarSize={56}
          isAnimationActive={false}
          shape={(props: BarShapeProps) => (
            <Rectangle {...props} fill={(data[props.index]?.value ?? 0) >= 0 ? "var(--positive)" : "var(--negative)"} />
          )}
        />
      </BarChart>
    </ChartContainer>
  )
}

/** A histogram of member returns (used by admin performance). */
export function Histogram({
  buckets,
  height = 220,
}: {
  buckets: { label: string; count: number; positive: boolean }[]
  height?: number
}) {
  const config = { count: { label: "Members", color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={buckets} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
        <Bar
          dataKey="count"
          radius={4}
          maxBarSize={48}
          isAnimationActive={false}
          shape={(props: BarShapeProps) => (
            <Rectangle {...props} fill={buckets[props.index]?.positive ? "var(--positive)" : "var(--negative)"} />
          )}
        />
      </BarChart>
    </ChartContainer>
  )
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
]

/** Allocation by underlying as a donut, with the largest five named and the rest grouped. */
export function AllocationChart({
  slices,
  height = 220,
}: {
  slices: { name: string; value: number }[]
  height?: number
}) {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 5)
  const rest = sorted.slice(5).reduce((sum, s) => sum + s.value, 0)
  const data = rest > 0 ? [...top, { name: "Other", value: rest }] : top
  const total = data.reduce((sum, s) => sum + s.value, 0)
  const config = Object.fromEntries(
    data.map((d, i) => [d.name, { label: d.name, color: PIE_COLORS[i] ?? "var(--muted-foreground)" }]),
  ) satisfies ChartConfig
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ChartContainer config={config} className="aspect-square w-full max-w-[220px]" style={{ height }}>
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4">
                    <span>{String(name)}</span>
                    <span className="font-medium tabular-nums">
                      {formatPercent(Number(value) / total, { signed: false, digits: 1 })}
                    </span>
                  </span>
                )}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="90%"
            strokeWidth={2}
            stroke="var(--card)"
            isAnimationActive={false}
            shape={(props: PieSectorShapeProps, index: number) => (
              <Sector {...props} fill={PIE_COLORS[index] ?? "var(--muted-foreground)"} />
            )}
          />
        </PieChart>
      </ChartContainer>
      <ul className="flex flex-1 flex-col gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: PIE_COLORS[i] ?? "var(--muted-foreground)" }}
              />
              <span className="font-mono">{d.name}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {formatPercent(d.value / total, { signed: false, digits: 1 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
