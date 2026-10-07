import { describe, expect, it } from "vitest"
import { buildTrades } from "../calc/trades"
import { TEMPLATE_CSV, parseCsv, parseOptionSymbol, parseTradeTime, parseTradesCsv } from "./trades-csv"

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b,c", 'd "e"'],
      ["1", "2", "3"],
    ])
  })
})

describe("parseOptionSymbol", () => {
  it("reads OCC and spelled-out option symbols", () => {
    expect(parseOptionSymbol("TSLA261016C00430000")).toEqual({
      assetType: "option",
      symbol: "TSLA",
      right: "call",
      strike: 430,
      expiry: "2026-10-16",
    })
    expect(parseOptionSymbol("TSM 10/23/2026 472.5 Put")).toEqual({
      assetType: "option",
      symbol: "TSM",
      right: "put",
      strike: 472.5,
      expiry: "2026-10-23",
    })
    expect(parseOptionSymbol("AAPL")).toBeNull()
  })
})

describe("parseTradeTime", () => {
  it("treats local times as New York time", () => {
    expect(parseTradeTime("10/03/2026 10:31:02 EDT")).toBe("2026-10-03T14:31:02.000Z")
    expect(parseTradeTime("2026-12-01 09:30")).toBe("2026-12-01T14:30:00.000Z")
    expect(parseTradeTime("2026-10-03T14:31:02Z")).toBe("2026-10-03T14:31:02.000Z")
    expect(parseTradeTime("yesterday")).toBeNull()
  })
})

describe("parseTradesCsv", () => {
  it("reads the template into fills that build trades", () => {
    const parsed = parseTradesCsv(TEMPLATE_CSV)
    expect(parsed.format).toBe("template")
    expect(parsed.issues).toEqual([])
    expect(parsed.fills).toHaveLength(3)
    const { closed, open } = buildTrades(parsed.fills)
    expect(closed).toHaveLength(1)
    expect(closed[0]?.realizedPnl).toBeCloseTo((5.1 - 3.25) * 2 * 100 - 2.6, 6)
    expect(open).toHaveLength(1)
  })

  it("reads a Webull order export and skips unfilled orders", () => {
    const csv = [
      "Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time",
      "TSLA Call,TSLA261016C00430000,Buy,Filled,1,1,@4.20,4.20,DAY,10/01/2026 09:40:00 EDT,10/01/2026 09:40:05 EDT",
      "TSLA Call,TSLA261016C00430000,Sell,Cancelled,0,1,@6.00,,DAY,10/02/2026 10:00:00 EDT,",
      "TSLA Call,TSLA261016C00430000,Sell,Filled,1,1,@6.10,6.10,DAY,10/02/2026 10:10:00 EDT,10/02/2026 10:10:01 EDT",
    ].join("\n")
    const parsed = parseTradesCsv(csv)
    expect(parsed.format).toBe("webull")
    expect(parsed.skipped).toBe(1)
    expect(parsed.fills.map((f) => f.side)).toEqual(["buy", "sell"])
    expect(buildTrades(parsed.fills).closed[0]?.realizedPnl).toBeCloseTo(190, 6)
  })

  it("gives the same ids when the same file is imported twice", () => {
    expect(parseTradesCsv(TEMPLATE_CSV).fills.map((f) => f.id)).toEqual(
      parseTradesCsv(TEMPLATE_CSV).fills.map((f) => f.id),
    )
  })

  it("reports missing columns and bad rows", () => {
    expect(parseTradesCsv("foo,bar\n1,2").issues[0]?.message).toMatch(/Missing column/)
    const bad = parseTradesCsv("date,symbol,side,quantity,price\n2026-10-01,TSM,hold,1,2")
    expect(bad.fills).toHaveLength(0)
    expect(bad.issues[0]?.message).toMatch(/Unknown side/)
  })
})
