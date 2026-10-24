import type { IsoDate } from "./domain/types"
import { formatDate, formatShortDate } from "./format"

/** When on the day a company reports: before the market opens, or after it closes. */
export const EARNINGS_TIMINGS = ["before-open", "after-close"] as const
export type EarningsTiming = (typeof EARNINGS_TIMINGS)[number]

export const EARNINGS_TIMING_LABELS: Record<EarningsTiming, string> = {
  "before-open": "before the open",
  "after-close": "after the close",
}

/**
 * "Oct 27, before the open" for a known day, or "Nov 2 to Nov 16" for a window; with `long`, the year
 * too ("Oct 27, 2026"). Null without a date.
 */
export function describeEarnings(
  start: IsoDate | null,
  end: IsoDate | null,
  timing: EarningsTiming | null,
  { long = false }: { long?: boolean } = {},
): string | null {
  if (!start) return null
  const day = (d: IsoDate) => (long ? formatDate(d) : formatShortDate(d))
  if (end && end !== start) return `${day(start)} to ${day(end)}`
  return timing ? `${day(start)}, ${EARNINGS_TIMING_LABELS[timing]}` : day(start)
}
