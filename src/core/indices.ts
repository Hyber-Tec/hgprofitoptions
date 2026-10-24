import { isoDateInZone } from "./dates"
import { signedRange, svi, weeklyStats } from "./calc/kmd"
import type { DailyBar, IntradayBar, IsoDate, WeeklyStats } from "./domain/types"

/** The three indexes HG follows, in his order, as Key Market Data names them. */
export const INDEX_SYMBOLS = ["DJI", "SPX", "IXIC"] as const
export type IndexSymbol = (typeof INDEX_SYMBOLS)[number]

export const INDEX_NAMES: Record<IndexSymbol, string> = { DJI: "Dow Jones", SPX: "S&P 500", IXIC: "Nasdaq" }

/** The market data provider's tickers for them (the Nasdaq is its Composite, as in HG's sheet). */
export const INDEX_PROVIDER_TICKERS: Record<IndexSymbol, string> = { DJI: "I:DJI", SPX: "I:SPX", IXIC: "I:COMP" }

export const isIndexSymbol = (symbol: string): symbol is IndexSymbol =>
  (INDEX_SYMBOLS as readonly string[]).includes(symbol)

export interface IndexWeek extends WeeklyStats {
  /** When the week's high and low happened: the start of the 5-minute bar, as an ISO instant. */
  highAt: string | null
  lowAt: string | null
}

/**
 * HG's weekly close for an index: the week's close, its high and low with the moment each happened, and
 * the previous Friday's close (so the gap is close minus PFCP). The high and low come from the intraday
 * bars when there are any, so each level matches its time; the daily bars give the closes.
 */
export function indexWeeklyStats(
  daily: readonly DailyBar[],
  intraday: readonly IntradayBar[],
  week: { start: IsoDate; end: IsoDate },
): IndexWeek | null {
  const stats = weeklyStats(daily, week)
  if (!stats) return null
  const inWeek = intraday.filter((b) => {
    const day = isoDateInZone(new Date(b.at))
    return day >= week.start && day <= week.end
  })
  if (inWeek.length === 0) return { ...stats, highAt: null, lowAt: null }
  let high = inWeek[0] as IntradayBar
  let low = high
  for (const bar of inWeek) {
    if (bar.high > high.high) high = bar
    if (bar.low < low.low) low = bar
  }
  const range = signedRange(stats.pfcp, high.high, low.low, stats.close)
  return {
    ...stats,
    high: high.high,
    low: low.low,
    range,
    svi: svi(range, stats.close),
    highAt: new Date(high.at).toISOString(),
    lowAt: new Date(low.at).toISOString(),
  }
}
