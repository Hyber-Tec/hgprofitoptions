"use client"

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type SeriesMarker,
  type Time,
} from "lightweight-charts"
import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"

export interface ChartBar {
  date: string
  open: number | null
  high: number
  low: number
  close: number
}

export interface ChartLevel {
  value: number
  label: string
  kind: "line" | "anchor" | "median" | "target"
}

export interface ChartMarker {
  date: string
  kind: "hg-buy" | "hg-sell" | "my-buy" | "my-sell"
  text: string
}

/** Resolves a CSS custom property (oklch, etc.) to an rgb() string the chart library can parse. */
function cssColor(variable: string, alpha = 1): string {
  const probe = document.createElement("canvas").getContext("2d")
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  if (!probe || !raw) return `rgba(128, 128, 128, ${alpha})`
  probe.fillStyle = raw
  probe.fillRect(0, 0, 1, 1)
  const [r = 128, g = 128, b = 128, a = 255] = probe.getImageData(0, 0, 1, 1).data
  // Keep the token's own transparency (for example a 10% border) and scale it by `alpha`.
  return `rgba(${r}, ${g}, ${b}, ${((a / 255) * alpha).toFixed(3)})`
}

/**
 * Daily candlesticks with HG's channel lines and medians, plus markers for HG's alert entries and
 * exits and the member's own fills.
 */
export function PriceChart({
  bars,
  levels,
  markers,
  height = 360,
}: {
  bars: ChartBar[]
  levels: ChartLevel[]
  markers: ChartMarker[]
  height?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const el = container.current
    if (!el || bars.length === 0) return
    const fg = cssColor("--foreground")
    const muted = cssColor("--muted-foreground")
    const grid = cssColor("--border", 0.6)
    const positive = cssColor("--positive")
    const negative = cssColor("--negative")
    const warning = cssColor("--warning")

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: muted,
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, rightOffset: 4 },
      crosshair: { vertLine: { labelBackgroundColor: fg }, horzLine: { labelBackgroundColor: fg } },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: positive,
      downColor: negative,
      borderUpColor: positive,
      borderDownColor: negative,
      wickUpColor: positive,
      wickDownColor: negative,
      priceLineVisible: false,
    })
    series.setData(
      bars.map((b) => ({ time: b.date, open: b.open ?? b.close, high: b.high, low: b.low, close: b.close })),
    )

    for (const level of levels) {
      series.createPriceLine({
        price: level.value,
        color:
          level.kind === "median"
            ? warning
            : level.kind === "target"
              ? fg
              : level.kind === "anchor"
                ? cssColor("--foreground", 0.55)
                : cssColor("--muted-foreground", 0.45),
        lineWidth: 1,
        lineStyle:
          level.kind === "line" ? LineStyle.Dotted : level.kind === "median" ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: level.kind !== "line",
        title: level.kind === "line" ? "" : level.label,
      })
    }

    const firstDate = bars[0]?.date ?? ""
    const seriesMarkers: SeriesMarker<Time>[] = markers
      .filter((m) => m.date >= firstDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => ({
        time: m.date,
        position: m.kind.endsWith("buy") ? "belowBar" : "aboveBar",
        shape: m.kind.startsWith("hg") ? (m.kind === "hg-buy" ? "arrowUp" : "arrowDown") : "circle",
        color: m.kind.startsWith("hg") ? fg : m.kind === "my-buy" ? positive : negative,
        text: m.text,
      }))
    createSeriesMarkers(series, seriesMarkers)
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [bars, levels, markers, height, resolvedTheme])

  return <div ref={container} className="w-full" style={{ height }} />
}
