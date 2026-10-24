"use client"

import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  TickMarkType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { useEffect, useRef, useState } from "react"
import type { IntradayBar } from "@/core/domain/types"
import { ema, INTRADAY_EMA_PERIOD, sessionVwap } from "@/core/intraday"
import { useTheme } from "@/components/shared/theme"
import { Skeleton } from "@/components/ui/skeleton"
import { cssColor, includePrices } from "./price-chart"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const wallClockParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * The chart library shows times in UTC, so each bar is placed at its New York wall-clock time written as
 * UTC: 9:30 AM in New York reads 9:30 on the axis wherever the member is.
 */
function newYorkTime(at: number): UTCTimestamp {
  const p = Object.fromEntries(wallClockParts.formatToParts(new Date(at)).map((part) => [part.type, part.value]))
  return (Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) /
    1000) as UTCTimestamp
}

/** "Oct 22" where a day starts, "10:30" within it. */
function tickLabel(time: Time, type: TickMarkType): string {
  const date = new Date((time as number) * 1000)
  if (type === TickMarkType.DayOfMonth || type === TickMarkType.Month || type === TickMarkType.Year)
    return `${MONTHS[date.getUTCMonth()] ?? ""} ${String(date.getUTCDate())}`
  return `${String(date.getUTCHours())}:${String(date.getUTCMinutes()).padStart(2, "0")}`
}

type State = { kind: "loading" } | { kind: "unavailable" } | { kind: "failed" } | { kind: "ready"; bars: IntradayBar[] }

/**
 * The last five sessions in 5-minute candles with VWAP and an EMA, as HG has members study a spike, and
 * a dashed line at each spike price. Loaded when shown; prices come from the market data provider.
 */
export function IntradayChart({
  symbol,
  spikes,
  height = 360,
}: {
  symbol: string
  spikes: { price: number; label: string }[]
  height?: number
}) {
  const [state, setState] = useState<State>({ kind: "loading" })
  const container = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/members/stocks/${encodeURIComponent(symbol)}/intraday`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { available?: boolean; failed?: boolean; bars?: IntradayBar[] }
        if (!res.ok) setState({ kind: "failed" })
        else if (!body.available) setState({ kind: "unavailable" })
        else if (body.failed) setState({ kind: "failed" })
        else setState({ kind: "ready", bars: body.bars ?? [] })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("5-day chart", error)
          setState({ kind: "failed" })
        }
      })
    return () => controller.abort()
  }, [symbol])

  const bars = state.kind === "ready" ? state.bars : null
  useEffect(() => {
    const el = container.current
    if (!el || !bars || bars.length === 0) return
    const fg = cssColor("--foreground")
    const muted = cssColor("--muted-foreground")
    const grid = cssColor("--border", 0.6)
    const positive = cssColor("--positive")
    const negative = cssColor("--negative")
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
      timeScale: {
        borderColor: grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        tickMarkFormatter: tickLabel,
      },
      localization: {
        timeFormatter: (time: Time) => {
          const date = new Date((time as number) * 1000)
          return `${MONTHS[date.getUTCMonth()] ?? ""} ${String(date.getUTCDate())}, ${tickLabel(time, TickMarkType.Time)} ET`
        },
      },
      crosshair: { vertLine: { labelBackgroundColor: fg }, horzLine: { labelBackgroundColor: fg } },
    })
    const times = bars.map((b) => newYorkTime(b.at))
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: positive,
      downColor: negative,
      borderUpColor: positive,
      borderDownColor: negative,
      wickUpColor: positive,
      wickDownColor: negative,
      priceLineVisible: false,
      autoscaleInfoProvider: includePrices(spikes.map((s) => s.price)),
    })
    candles.setData(
      bars.map((b, i) => ({
        time: times[i] as UTCTimestamp,
        open: b.open ?? b.close,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
    const line = (values: (number | null)[], color: string, width: 1 | 2) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: width,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      series.setData(values.flatMap((value, i) => (value === null ? [] : [{ time: times[i] as UTCTimestamp, value }])))
    }
    line(sessionVwap(bars), cssColor("--chart-vwap"), 2)
    line(ema(bars.map((b) => b.close)), cssColor("--warning"), 1)
    for (const spike of spikes)
      candles.createPriceLine({
        price: spike.price,
        color: cssColor("--chart-spike"),
        lineWidth: 2,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: true,
        title: spike.label,
      })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [bars, spikes, height, resolvedTheme])

  if (state.kind === "loading") return <Skeleton className="w-full" style={{ height }} />
  if (state.kind !== "ready" || state.bars.length === 0)
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        {state.kind === "unavailable"
          ? "The 5-day chart appears once market data is connected."
          : state.kind === "failed"
            ? "Could not load the 5-minute prices just now. Try again in a minute."
            : "No trading in the last five sessions."}
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      <div ref={container} className="w-full" style={{ height }} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Chart key">
        <li>5-minute candles, New York time</li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-vwap" />
          VWAP
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-warning" />
          EMA {INTRADAY_EMA_PERIOD}
        </li>
        {spikes.length > 0 && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-chart-spike" />
            Spike
          </li>
        )}
      </ul>
    </div>
  )
}
