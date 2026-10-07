import type { DailyBar, IsoDate } from "../domain/types"
import { addDays } from "../dates"

/** HG's "median": the midpoint between the highest high and the lowest low of a window. */
export function midRange(high: number, low: number): number {
  return (high + low) / 2
}

export function windowHighLow(
  bars: readonly DailyBar[],
  from: IsoDate,
  to: IsoDate,
): { high: number; low: number } | null {
  const inWindow = bars.filter((b) => b.date >= from && b.date <= to)
  if (inWindow.length === 0) return null
  return { high: Math.max(...inWindow.map((b) => b.high)), low: Math.min(...inWindow.map((b) => b.low)) }
}

export interface TickerMetrics {
  asOf: IsoDate
  lastClose: number
  high5d: number | null
  low5d: number | null
  high30d: number | null
  low30d: number | null
  high90d: number | null
  low90d: number | null
}

/**
 * Windows (inclusive calendar dates, New York):
 * 5D = the previous completed Monday to Friday, 30D and 90D = the N calendar days ending on asOf.
 * The source sheet uses [today - N, today - 1], which is identical when asOf is yesterday's close.
 */
export function tickerMetrics(
  bars: readonly DailyBar[],
  asOf: IsoDate,
  week: { start: IsoDate; end: IsoDate },
): TickerMetrics | null {
  const upTo = bars.filter((b) => b.date <= asOf)
  const last = upTo.at(-1)
  if (!last) return null
  const w5 = windowHighLow(upTo, week.start, week.end)
  const w30 = windowHighLow(upTo, addDays(asOf, -29), asOf)
  const w90 = windowHighLow(upTo, addDays(asOf, -89), asOf)
  return {
    asOf,
    lastClose: last.close,
    high5d: w5?.high ?? null,
    low5d: w5?.low ?? null,
    high30d: w30?.high ?? null,
    low30d: w30?.low ?? null,
    high90d: w90?.high ?? null,
    low90d: w90?.low ?? null,
  }
}

export function medians(m: Pick<TickerMetrics, "high5d" | "low5d" | "high30d" | "low30d" | "high90d" | "low90d">): {
  m5: number | null
  m30: number | null
  m90: number | null
} {
  const mid = (h: number | null, l: number | null) => (h === null || l === null ? null : midRange(h, l))
  return { m5: mid(m.high5d, m.low5d), m30: mid(m.high30d, m.low30d), m90: mid(m.high90d, m.low90d) }
}
