import { describe, expect, it } from "vitest"
import type { DailyBar, Fill, Instrument, IsoDate } from "../domain/types"
import { mergeBars } from "./bars"
import { channelLadder, nearestLevel, nearestLevels } from "./channels"
import { journalStats } from "./journal-stats"
import { positionInRange, signedRange, svi, weeklyStats } from "./kmd"
import { medians, midRange, tickerMetrics } from "./medians"
import { combineSnapshots, maxDrawdown, periodReturn, timeWeightedReturn } from "./returns"
import { alertReturn, communityStanding, median, trackRecord } from "./standing"
import { buildTrades, expirationFill, instrumentKey } from "./trades"

const d = (s: string) => s as IsoDate
const bar = (date: string, high: number, low: number, close: number): DailyBar => ({
  date: d(date),
  open: null,
  high,
  low,
  close,
  volume: null,
})

describe("key market data", () => {
  it("signs the range by the week's direction", () => {
    expect(signedRange(100, 105, 95, 98)).toBe(-10)
    expect(signedRange(100, 105, 95, 102)).toBe(10)
    expect(signedRange(100, 105, 95, 100)).toBe(10)
  })

  it("computes SVI as range over close", () => {
    expect(svi(-10, 98)).toBeCloseTo(-0.10204, 5)
  })

  it("builds weekly stats from daily bars, using the last trading day before Monday as PFCP", () => {
    const bars = [
      bar("2026-09-24", 0, 0, 101), // Thursday
      // Friday Sep 25 is treated as a holiday here: no bar
      bar("2026-09-28", 104, 99, 100),
      bar("2026-09-29", 106, 100, 105),
      bar("2026-09-30", 107, 103, 104),
      bar("2026-10-01", 105, 97, 98),
      bar("2026-10-02", 99, 96, 97),
    ]
    const stats = weeklyStats(bars, { start: d("2026-09-28"), end: d("2026-10-02") })
    expect(stats).toEqual({
      weekStart: "2026-09-28",
      weekEnd: "2026-10-02",
      pfcp: 101,
      high: 107,
      low: 96,
      close: 97,
      range: -11,
      svi: -11 / 97,
    })
  })

  it("returns null without enough data", () => {
    expect(weeklyStats([bar("2026-09-28", 1, 1, 1)], { start: d("2026-09-28"), end: d("2026-10-02") })).toBeNull()
  })

  it("places the close inside the range", () => {
    expect(positionInRange({ high: 110, low: 100, close: 105 })).toBe(0.5)
    expect(positionInRange({ high: 100, low: 100, close: 100 })).toBe(0.5)
  })
})

describe("daily bar history", () => {
  it("adds new sessions in date order, replacing a corrected bar", () => {
    const merged = mergeBars(
      [bar("2026-10-05", 11, 9, 10), bar("2026-10-06", 12, 10, 11)],
      [bar("2026-10-06", 12.5, 10, 12), bar("2026-10-07", 13, 11, 12.5)],
    )
    expect(merged.map((b) => [b.date, b.close])).toEqual([
      ["2026-10-05", 10],
      ["2026-10-06", 12],
      ["2026-10-07", 12.5],
    ])
  })

  it("keeps only the most recent bars", () => {
    const merged = mergeBars(
      [bar("2026-10-05", 11, 9, 10), bar("2026-10-06", 12, 10, 11)],
      [bar("2026-10-07", 13, 11, 12.5)],
      2,
    )
    expect(merged.map((b) => b.date)).toEqual(["2026-10-06", "2026-10-07"])
  })
})

describe("medians", () => {
  it("uses the mid-range definition", () => {
    expect(midRange(342.988, 325.81)).toBeCloseTo(334.399, 6)
  })

  it("computes 5D, 30D and 90D windows", () => {
    const bars = [
      bar("2026-07-10", 300, 200, 250),
      bar("2026-09-10", 280, 240, 260),
      bar("2026-09-29", 270, 250, 265),
      bar("2026-10-02", 275, 255, 270),
    ]
    const m = tickerMetrics(bars, d("2026-10-02"), { start: d("2026-09-28"), end: d("2026-10-02") })
    expect(m).toMatchObject({
      lastClose: 270,
      high5d: 275,
      low5d: 250,
      high30d: 280,
      low30d: 240,
      high90d: 300,
      low90d: 200,
    })
    expect(m && medians(m)).toEqual({ m5: 262.5, m30: 260, m90: 250 })
  })
})

describe("channel ladder", () => {
  it("builds lines and BOC levels around the anchor (BOC = CH/2)", () => {
    const ladder = channelLadder(100, { ch: 6, boc: 3 })
    expect(ladder.lines).toEqual([76, 82, 88, 94, 100, 106, 112, 118, 124])
    expect(ladder.bocAbove).toEqual([103, 109, 115, 121])
    expect(ladder.bocBelow).toEqual([97, 91, 85, 79])
  })

  it("supports BOC = CH/4 and removes floating-point noise", () => {
    const ladder = channelLadder(333.63, { ch: 6.5, boc: 1.625 })
    expect(ladder.lines[5]).toBe(340.13)
    expect(ladder.bocAbove[0]).toBe(335.255)
  })

  it("hides levels at or below zero", () => {
    const ladder = channelLadder(5, { ch: 2, boc: 1 })
    expect(ladder.lines.slice(0, 3)).toEqual([null, null, 1])
    expect(ladder.bocBelow).toEqual([4, 2, null, null])
  })

  it("finds the nearest levels", () => {
    const ladder = channelLadder(100, { ch: 6, boc: 3 })
    expect(nearestLevels(101, ladder)).toEqual({ above: 103, below: 100 })
    expect(nearestLevel(110.4, ladder)).toBe(109)
  })
})

describe("trades (FIFO)", () => {
  const call = {
    assetType: "option" as const,
    symbol: "ABC",
    right: "call" as const,
    strike: 50,
    expiry: d("2026-10-23"),
  }
  const fill = (id: string, side: "buy" | "sell", quantity: number, price: number, at: string, fees = 0): Fill => ({
    id,
    accountId: "acct",
    instrument: call,
    side,
    quantity,
    price,
    fees,
    executedAt: at,
  })

  it("keys instruments", () => {
    expect(instrumentKey(call)).toBe("ABC 2026-10-23 C 50")
    expect(instrumentKey({ assetType: "stock", symbol: "ABC" })).toBe("ABC")
  })

  it("scales out of an option position", () => {
    const { closed, open } = buildTrades([
      fill("1", "buy", 2, 3.2, "2026-10-01T14:00:00Z"),
      fill("2", "sell", 1, 5, "2026-10-02T14:00:00Z"),
      fill("3", "sell", 1, 4, "2026-10-05T14:00:00Z"),
    ])
    expect(open).toHaveLength(0)
    expect(closed).toHaveLength(1)
    expect(closed[0]).toMatchObject({ quantity: 2, direction: "long", realizedPnl: 260 })
    expect(closed[0]?.avgEntry).toBeCloseTo(3.2)
    expect(closed[0]?.avgExit).toBeCloseTo(4.5)
    expect(closed[0]?.returnPct).toBeCloseTo(0.40625)
  })

  it("matches a partial close against the oldest lot", () => {
    const { closed, open } = buildTrades([
      fill("1", "buy", 1, 2, "2026-10-01T14:00:00Z"),
      fill("2", "buy", 1, 3, "2026-10-01T15:00:00Z"),
      fill("3", "sell", 1, 4, "2026-10-02T14:00:00Z"),
    ])
    expect(closed).toHaveLength(0)
    expect(open[0]).toMatchObject({ quantity: 1, avgEntry: 3, realizedSoFar: 200 })
  })

  it("closes an expired option at zero", () => {
    const { open } = buildTrades([fill("1", "buy", 3, 1.5, "2026-10-01T14:00:00Z")])
    const position = open[0]
    if (!position) throw new Error("expected an open position")
    const { closed } = buildTrades([
      fill("1", "buy", 3, 1.5, "2026-10-01T14:00:00Z"),
      expirationFill(position, d("2026-10-23")),
    ])
    expect(closed[0]).toMatchObject({ realizedPnl: -450, returnPct: -1 })
  })

  it("subtracts fees for stock trades", () => {
    const stock = { assetType: "stock" as const, symbol: "XYZ" }
    const { closed } = buildTrades([
      {
        id: "a",
        accountId: "acct",
        instrument: stock,
        side: "buy",
        quantity: 100,
        price: 330,
        fees: 1,
        executedAt: "2026-10-01T14:00:00Z",
      },
      {
        id: "b",
        accountId: "acct",
        instrument: stock,
        side: "sell",
        quantity: 100,
        price: 340,
        fees: 1,
        executedAt: "2026-10-02T14:00:00Z",
      },
    ])
    expect(closed[0]?.realizedPnl).toBe(998)
  })

  it("splits a fill that flips the position", () => {
    const stock = { assetType: "stock" as const, symbol: "XYZ" }
    const { closed, open } = buildTrades([
      {
        id: "a",
        accountId: "acct",
        instrument: stock,
        side: "buy",
        quantity: 10,
        price: 10,
        fees: 0,
        executedAt: "2026-10-01T14:00:00Z",
      },
      {
        id: "b",
        accountId: "acct",
        instrument: stock,
        side: "sell",
        quantity: 15,
        price: 12,
        fees: 3,
        executedAt: "2026-10-02T14:00:00Z",
      },
    ])
    expect(closed[0]).toMatchObject({ direction: "long", realizedPnl: 18 })
    expect(open[0]).toMatchObject({ direction: "short", quantity: 5, avgEntry: 12 })
  })

  it("never mixes accounts", () => {
    const { closed, open } = buildTrades([
      fill("1", "buy", 1, 2, "2026-10-01T14:00:00Z"),
      { ...fill("2", "sell", 1, 3, "2026-10-02T14:00:00Z"), accountId: "other" },
    ])
    expect(closed).toHaveLength(0)
    expect(open).toHaveLength(2)
  })
})

describe("returns", () => {
  const snaps = [
    { date: d("2026-10-01"), value: 10000, netFlow: 0 },
    { date: d("2026-10-02"), value: 10500, netFlow: 0 },
    { date: d("2026-10-05"), value: 15600, netFlow: 5000 },
  ]

  it("ignores deposits in time-weighted returns", () => {
    expect(timeWeightedReturn(snaps)).toBeCloseTo(0.06, 10)
  })

  it("measures drawdowns", () => {
    expect(maxDrawdown([...snaps, { date: d("2026-10-06"), value: 14310, netFlow: 0 }])).toBeCloseTo(
      14310 / 15600 - 1,
      10,
    )
    expect(maxDrawdown(snaps)).toBe(0)
  })

  it("computes period returns from the last snapshot before the period", () => {
    expect(periodReturn(snaps, d("2026-10-02"), d("2026-10-05"))).toBeCloseTo(0.06, 10)
    expect(periodReturn(snaps, d("2026-10-05"), d("2026-10-05"))).toBeCloseTo(10600 / 10500 - 1, 10)
    expect(periodReturn([], d("2026-10-01"), d("2026-10-05"))).toBeNull()
  })

  it("combines accounts per day", () => {
    const combined = combineSnapshots([
      [{ date: d("2026-10-01"), value: 100, netFlow: 0 }],
      [{ date: d("2026-10-01"), value: 50, netFlow: 10 }],
    ])
    expect(combined).toEqual([{ date: "2026-10-01", value: 150, netFlow: 10 }])
  })
})

describe("journal statistics", () => {
  it("summarizes closed trades", () => {
    const at = (i: number) => `2026-10-0${i}T15:00:00Z`
    const stats = journalStats([
      { realizedPnl: 260, closedAt: at(1) },
      { realizedPnl: -450, closedAt: at(2) },
      { realizedPnl: 998, closedAt: at(3) },
      { realizedPnl: 0, closedAt: at(4) },
      { realizedPnl: 200, closedAt: at(5) },
    ])
    expect(stats).toMatchObject({
      trades: 5,
      wins: 3,
      losses: 1,
      winRate: 0.75,
      avgWin: 486,
      avgLoss: -450,
      best: 998,
      worst: -450,
      maxWinStreak: 1,
      maxLossStreak: 1,
    })
    expect(stats.profitFactor).toBeCloseTo(3.24)
    expect(stats.expectancy).toBeCloseTo(201.6)
  })

  it("handles an empty journal", () => {
    expect(journalStats([])).toMatchObject({ trades: 0, winRate: null, profitFactor: null, expectancy: null })
  })
})

describe("standing", () => {
  it("computes an alert's return from the buy point midpoint and weighted exits", () => {
    expect(
      alertReturn(3.2, 3.4, [
        { price: 5, portion: 0.5 },
        { price: 4.2, portion: 0.5 },
      ]),
    ).toBeCloseTo(0.393939, 5)
    expect(alertReturn(0, 0, [])).toBeNull()
  })

  it("summarizes a track record", () => {
    expect(trackRecord([0.4, -0.2, 0.1])).toMatchObject({ closed: 3, wins: 2, medianReturn: 0.1 })
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it("hides community numbers below five members", () => {
    expect(communityStanding([0.1, 0.2, -0.1, 0.05])).toBeNull()
    expect(communityStanding([0.1, 0.2, -0.1, 0.05, 0])).toMatchObject({
      members: 5,
      pctGreen: 0.6,
      medianReturn: 0.05,
    })
  })
})

describe("parseInstrumentKey", () => {
  it("round-trips stock and option keys", async () => {
    const { instrumentKey, parseInstrumentKey } = await import("./trades")
    const option: Instrument = {
      assetType: "option",
      symbol: "TSM",
      right: "call",
      strike: 472.5,
      expiry: "2026-10-23" as IsoDate,
    }
    expect(parseInstrumentKey(instrumentKey(option))).toEqual(option)
    expect(parseInstrumentKey("AAPL")).toEqual({ assetType: "stock", symbol: "AAPL" })
    expect(parseInstrumentKey("AAPL 10/23 C 200")).toBeNull()
  })
})
