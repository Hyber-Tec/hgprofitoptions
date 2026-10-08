import type { DailyBar } from "../domain/types"

/** About 18 months of trading days: enough for the 90-day windows and the stock page chart. */
export const BAR_HISTORY = 400

/** Adds daily bars to a history: one bar per date (the newer copy wins), oldest first, capped at `keep`. */
export function mergeBars(
  existing: readonly DailyBar[],
  incoming: readonly DailyBar[],
  keep = BAR_HISTORY,
): DailyBar[] {
  const byDate = new Map(existing.map((b) => [b.date, b]))
  for (const bar of incoming) byDate.set(bar.date, bar)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}
