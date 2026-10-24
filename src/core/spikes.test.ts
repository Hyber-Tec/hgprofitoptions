import { describe, expect, it } from "vitest"
import { asIsoDate } from "./dates"
import type { DailyBar } from "./domain/types"
import { isTradingDay } from "./holidays"
import { defaultSpikeDate, describeSpikeTime, parseSpikeList, spikeDirection, spikeGap, spikeRecovery } from "./spikes"

const defaults = { date: asIsoDate("2026-10-22"), at: "open" as const }

describe("reading HG's spike list", () => {
  it("reads ticker, spike and close, under HG's heading", () => {
    const { rows, issues } = parseSpikeList(
      ["Profit options", "TSM 421.50 412.35", "NVDA 218.53 212.21", "2. BE 218.00 217.77"].join("\n"),
      defaults,
    )
    expect(issues).toEqual([])
    expect(rows).toEqual([
      {
        line: 2,
        symbol: "TSM",
        price: 421.5,
        date: "2026-10-22",
        at: "open",
        time: null,
        close: 412.35,
        group: "Profit options",
      },
      {
        line: 3,
        symbol: "NVDA",
        price: 218.53,
        date: "2026-10-22",
        at: "open",
        time: null,
        close: 212.21,
        group: "Profit options",
      },
      {
        line: 4,
        symbol: "BE",
        price: 218,
        date: "2026-10-22",
        at: "open",
        time: null,
        close: 217.77,
        group: "Profit options",
      },
    ])
  })

  it("reads a spike on the close with its own time and date", () => {
    const { rows } = parseSpikeList("META 745.00 on the close 4:20 PM 10/21, close 648.85", defaults)
    expect(rows[0]).toMatchObject({
      symbol: "META",
      price: 745,
      at: "close",
      time: "16:20",
      date: "2026-10-21",
      close: 648.85,
    })
  })

  it("takes a heading's date for the lines under it", () => {
    const { rows } = parseSpikeList("Spikes 10/20\nINTC 88.11 85.49", defaults)
    expect(rows[0]).toMatchObject({ symbol: "INTC", date: "2026-10-20", group: "Spikes 10/20" })
  })

  it("says which lines need fixing instead of guessing", () => {
    const { rows, issues } = parseSpikeList("TSM 421.50 412.35\nMRNA (missing)\n421.50 412.35\nMRNA ? 202.63", defaults)
    expect(rows).toHaveLength(1)
    expect(issues).toEqual([
      { line: 2, text: "MRNA (missing)", message: "MRNA has no spike price. Add it, or remove the line." },
      { line: 3, text: "421.50 412.35", message: "No ticker on this line." },
      { line: 4, text: "MRNA ? 202.63", message: "MRNA has no spike price. Add it, or remove the line." },
    ])
  })

  it("reads prices written as a pair, and skips the chat around the list", () => {
    const { rows, skipped } = parseSpikeList(
      [
        "Good morning everyone, here are the spikes from yesterday's open to study today",
        "DELL 469/452.95",
        "MRVL @234.80 - 223.47",
        "ASTS $40.64 / $38.77",
        "MSFT 1,030.10 / 521.80",
        "TSM 421.50,412.35",
      ].join("\n"),
      defaults,
    )
    expect(rows.map((r) => [r.symbol, r.price, r.close, r.group])).toEqual([
      ["DELL", 469, 452.95, null],
      ["MRVL", 234.8, 223.47, null],
      ["ASTS", 40.64, 38.77, null],
      ["MSFT", 1030.1, 521.8, null],
      ["TSM", 421.5, 412.35, null],
    ])
    expect(skipped.map((s) => s.line)).toEqual([1])
  })

  it("reads a time without AM or PM within the trading day", () => {
    expect(parseSpikeList("HUT 69.42 at 3:55", defaults).rows[0]).toMatchObject({ at: "time", time: "15:55" })
    expect(parseSpikeList("HUT 69.42 at 10:05", defaults).rows[0]).toMatchObject({ at: "time", time: "10:05" })
  })
})

describe("tracking a spike", () => {
  const bar = (date: string, high: number, low: number): DailyBar => ({
    date: asIsoDate(date),
    open: null,
    high,
    low,
    close: (high + low) / 2,
    volume: null,
  })
  const bars = [bar("2026-10-22", 422, 410), bar("2026-10-23", 418, 411), bar("2026-10-26", 423, 415)]

  it("finds when the stock traded back to the spike, in sessions", () => {
    expect(spikeRecovery(bars, { date: asIsoDate("2026-10-22"), price: 421.5, direction: "up" })).toEqual({
      date: "2026-10-26",
      sessions: 2,
    })
    expect(spikeRecovery(bars, { date: asIsoDate("2026-10-22"), price: 425, direction: "up" })).toBeNull()
    expect(spikeRecovery(bars, { date: asIsoDate("2026-10-22"), price: 411, direction: "down" })).toEqual({
      date: "2026-10-23",
      sessions: 1,
    })
  })

  it("knows the spike's side and the trade left to it", () => {
    expect(spikeDirection(421.5, 412.35)).toBe("up")
    expect(spikeDirection(400, 412.35)).toBe("down")
    expect(spikeGap(421.5, 412.35)).toBeCloseTo(0.0222, 4)
  })

  it("says when it happened", () => {
    expect(describeSpikeTime({ at: "open", time: null })).toBe("On the open")
    expect(describeSpikeTime({ at: "close", time: "16:20" })).toBe("On the close, 4:20 PM")
    expect(describeSpikeTime({ at: "time", time: "10:42" })).toBe("At 10:42 AM")
    expect(describeSpikeTime({ at: "time", time: "12:05" })).toBe("At 12:05 PM")
  })

  it("defaults to the session before today", () => {
    // Monday Oct 26: Friday Oct 23. Friday after Thanksgiving: the Wednesday before.
    expect(defaultSpikeDate(asIsoDate("2026-10-26"), isTradingDay)).toBe("2026-10-23")
    expect(defaultSpikeDate(asIsoDate("2026-11-27"), isTradingDay)).toBe("2026-11-25")
  })
})
