import type { DailyBar, IsoDate, WeeklyStats } from "../domain/types"

/** HG's weekly range rule: the week's high-low span, negative when the week closed below the previous Friday close. */
export function signedRange(pfcp: number, high: number, low: number, close: number): number {
  return (pfcp > close ? -1 : 1) * (high - low)
}

/** SVI = signed range / close. */
export function svi(range: number, close: number): number {
  return range / close
}

/**
 * Key Market Data for one ticker and one week.
 * bars: the ticker's daily bars sorted by date (oldest first).
 * week: the last completed Monday to Friday.
 */
export function weeklyStats(bars: readonly DailyBar[], week: { start: IsoDate; end: IsoDate }): WeeklyStats | null {
  const inWeek = bars.filter((b) => b.date >= week.start && b.date <= week.end)
  // The last trading day before Monday, so a Friday holiday falls back to Thursday.
  const prev = bars.filter((b) => b.date < week.start).at(-1)
  const last = inWeek.at(-1)
  if (!prev || !last) return null

  const high = Math.max(...inWeek.map((b) => b.high))
  const low = Math.min(...inWeek.map((b) => b.low))
  const range = signedRange(prev.close, high, low, last.close)
  return {
    weekStart: week.start,
    weekEnd: last.date,
    pfcp: prev.close,
    high,
    low,
    close: last.close,
    range,
    svi: svi(range, last.close),
  }
}

/** Where the close sits inside the week's range: 0 = at the low, 1 = at the high. */
export function positionInRange(stats: Pick<WeeklyStats, "high" | "low" | "close">): number {
  const span = stats.high - stats.low
  if (span <= 0) return 0.5
  return Math.min(1, Math.max(0, (stats.close - stats.low) / span))
}
