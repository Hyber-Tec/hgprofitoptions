import { describe, expect, it } from "vitest"
import { asIsoDate, zonedDateTime } from "./dates"
import type { DailyBar } from "./domain/types"
import { indexWeeklyStats } from "./indices"

const day = (date: string, high: number, low: number, close: number): DailyBar => ({
  date: asIsoDate(date),
  open: null,
  high,
  low,
  close,
  volume: null,
})
const week = { start: asIsoDate("2026-10-19"), end: asIsoDate("2026-10-23") }

describe("HG's weekly index close", () => {
  // The Dow, week of Oct 19 to 23 2026, from HG's message.
  const daily = [
    day("2026-10-16", 52100, 51900, 52002.41),
    day("2026-10-19", 52300, 51885.99, 52200),
    day("2026-10-21", 52923.38, 52100, 52500),
    day("2026-10-23", 52400, 52000, 52215.16),
  ]

  it("takes the high and low with when they happened, and the gap vs last Friday", () => {
    const intraday = [
      { at: zonedDateTime(asIsoDate("2026-10-19"), "09:55").getTime(), high: 51950, low: 51885.99, close: 51900 },
      { at: zonedDateTime(asIsoDate("2026-10-21"), "12:30").getTime(), high: 52923.38, low: 52800, close: 52850 },
      { at: zonedDateTime(asIsoDate("2026-10-23"), "15:55").getTime(), high: 52300, low: 52200, close: 52215.16 },
    ]
    const stats = indexWeeklyStats(daily, intraday, week)
    expect(stats).toMatchObject({
      pfcp: 52002.41,
      close: 52215.16,
      high: 52923.38,
      highAt: "2026-10-21T16:30:00.000Z",
      low: 51885.99,
      lowAt: "2026-10-19T13:55:00.000Z",
    })
    // HG's gap: this Friday's close minus last Friday's.
    expect(stats && Math.round((stats.close - stats.pfcp) * 100) / 100).toBe(212.75)
  })

  it("falls back to the daily high and low without intraday bars", () => {
    expect(indexWeeklyStats(daily, [], week)).toMatchObject({ high: 52923.38, low: 51885.99, highAt: null })
  })
})
