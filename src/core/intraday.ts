import { isoDateInZone } from "./dates"
import type { IntradayBar } from "./domain/types"

/**
 * The 5-day chart HG studies spikes on: 5-minute candles with VWAP and an EMA.
 *
 * The EMA's length is 9 bars, the usual default on charting platforms. HG said "EMA" without a length,
 * so this is the one place to change it once he confirms.
 */
export const INTRADAY_EMA_PERIOD = 9

/** How many sessions the chart shows, and the size of each candle in minutes. */
export const INTRADAY_SESSIONS = 5
export const INTRADAY_MINUTES = 5

/**
 * The volume-weighted average price through each bar, starting over every New York day: the sum of each
 * bar's typical price ((high + low + close) / 3) times its volume, over the volume so far. Null until a
 * day has traded volume.
 */
export function sessionVwap(bars: readonly IntradayBar[]): (number | null)[] {
  let day = ""
  let priceVolume = 0
  let volume = 0
  return bars.map((bar) => {
    const date = isoDateInZone(new Date(bar.at))
    if (date !== day) {
      day = date
      priceVolume = 0
      volume = 0
    }
    if (bar.volume !== null && bar.volume > 0) {
      priceVolume += ((bar.high + bar.low + bar.close) / 3) * bar.volume
      volume += bar.volume
    }
    return volume > 0 ? priceVolume / volume : null
  })
}

/**
 * The exponential moving average of the closes, carried across days: it starts at the average of the
 * first `period` closes and then weighs each new close by 2 / (period + 1). Null for the first bars.
 */
export function ema(values: readonly number[], period: number = INTRADAY_EMA_PERIOD): (number | null)[] {
  const k = 2 / (period + 1)
  let current: number | null = null
  let sum = 0
  return values.map((value, i) => {
    if (i < period - 1) {
      sum += value
      return null
    }
    if (current === null) {
      sum += value
      current = sum / period
      return current
    }
    current = value * k + current * (1 - k)
    return current
  })
}
