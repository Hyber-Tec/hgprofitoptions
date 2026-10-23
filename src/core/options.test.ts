import { describe, expect, it } from "vitest"
import type { IsoDate } from "./domain/types"
import { OPTION_TICKER, STOCK_TICKER, optionTicker } from "./options"

describe("option tickers", () => {
  it("builds the OCC-style ticker the market data API uses", () => {
    expect(optionTicker("TSM", "call", 427.5, "2026-11-06" as IsoDate)).toBe("O:TSM261106C00427500")
    expect(optionTicker("nuai", "put", 2, "2026-11-20" as IsoDate)).toBe("O:NUAI261120P00002000")
    expect(optionTicker("ASML", "put", 1605, "2026-11-06" as IsoDate)).toBe("O:ASML261106P01605000")
  })

  it("drops dots from the root and rounds the strike to a tenth of a cent", () => {
    expect(optionTicker("BRK.B", "call", 480.125, "2027-01-15" as IsoDate)).toBe("O:BRKB270115C00480125")
    expect(optionTicker("F", "put", 0.1 + 0.2, "2026-11-06" as IsoDate)).toBe("O:F261106P00000300")
  })

  it("recognizes stock and option tickers", () => {
    expect(STOCK_TICKER.test("BRK.B")).toBe(true)
    expect(STOCK_TICKER.test("O:TSM261106C00427500")).toBe(false)
    expect(OPTION_TICKER.test("O:TSM261106C00427500")).toBe(true)
    expect(OPTION_TICKER.test("O:TSM261106X00427500")).toBe(false)
  })
})
