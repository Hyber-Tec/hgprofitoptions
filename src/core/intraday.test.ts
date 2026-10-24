import { describe, expect, it } from "vitest"
import { asIsoDate, zonedDateTime } from "./dates"
import type { IntradayBar } from "./domain/types"
import { ema, sessionVwap } from "./intraday"

const bar = (date: string, time: string, high: number, low: number, close: number, volume: number | null) =>
  ({
    at: zonedDateTime(asIsoDate(date), time).getTime(),
    open: close,
    high,
    low,
    close,
    volume,
  }) satisfies IntradayBar

describe("VWAP", () => {
  it("weighs each bar's typical price by its volume, and starts over each day", () => {
    const vwap = sessionVwap([
      bar("2026-10-22", "09:30", 12, 9, 9, 100), // typical 10
      bar("2026-10-22", "09:35", 22, 19, 19, 300), // typical 20
      bar("2026-10-22", "09:40", 30, 30, 30, null), // no volume: unchanged
      bar("2026-10-23", "09:30", 52, 49, 49, 50), // a new day: 50
    ])
    expect(vwap).toEqual([10, 17.5, 17.5, 50])
  })

  it("waits for the first traded volume of the day", () => {
    expect(sessionVwap([bar("2026-10-22", "04:00", 10, 10, 10, 0)])).toEqual([null])
  })
})

describe("EMA", () => {
  it("starts at the average of the first closes, then follows the newest ones more", () => {
    const values = ema([1, 2, 3, 4, 5], 3)
    expect(values.slice(0, 2)).toEqual([null, null])
    expect(values[2]).toBe(2)
    // k = 0.5: 4 * 0.5 + 2 * 0.5, then 5 * 0.5 + 3 * 0.5.
    expect(values[3]).toBe(3)
    expect(values[4]).toBe(4)
  })

  it("has nothing to say about fewer closes than its length", () => {
    expect(ema([1, 2], 9)).toEqual([null, null])
  })
})
