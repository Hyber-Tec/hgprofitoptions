import { describe, expect, it } from "vitest"
import type { IsoDate } from "./domain/types"
import { formatDate, formatExpiry, formatInstrument, formatLevel, formatPercent, formatPrice, formatRelative, formatSigned, formatSignedMoney, formatTimeET } from "./format"

describe("formatters", () => {
  it("formats prices", () => {
    expect(formatPrice(1234.5)).toBe("$1,234.50")
    expect(formatPrice(0.6648)).toBe("$0.6648")
    expect(formatPrice(null)).toBe("-")
    expect(formatLevel(472.5)).toBe("472.50")
  })

  it("formats signed values and money", () => {
    expect(formatSigned(78.94)).toBe("+78.94")
    expect(formatSigned(-17.178)).toBe("-17.18")
    expect(formatSigned(0)).toBe("0.00")
    expect(formatSignedMoney(2460)).toBe("+$2,460.00")
    expect(formatSignedMoney(-450)).toBe("-$450.00")
  })

  it("formats percents", () => {
    expect(formatPercent(0.1461743575)).toBe("+14.62%")
    expect(formatPercent(-0.0514789)).toBe("-5.15%")
    expect(formatPercent(0.35, { digits: 0 })).toBe("+35%")
    expect(formatPercent(0.5, { signed: false, digits: 0 })).toBe("50%")
  })

  it("formats dates and expiries", () => {
    expect(formatDate("2026-10-07" as IsoDate)).toBe("Oct 7, 2026")
    expect(formatExpiry("2026-10-23" as IsoDate)).toBe("10/23")
    expect(formatTimeET(new Date("2026-10-07T13:42:00Z"))).toBe("9:42 AM ET")
  })

  it("formats relative time", () => {
    const now = new Date("2026-10-07T14:00:00Z")
    expect(formatRelative(new Date("2026-10-07T13:57:00Z"), now)).toBe("3 min ago")
    expect(formatRelative(new Date("2026-10-07T11:00:00Z"), now)).toBe("3 h ago")
  })

  it("formats instruments", () => {
    expect(formatInstrument({ assetType: "option", symbol: "ABC", right: "call", strike: 472.5, expiry: "2026-10-23" as IsoDate })).toBe("ABC $472.50 Call · Exp Oct 23")
    expect(formatInstrument({ assetType: "stock", symbol: "ABC" })).toBe("ABC")
  })
})
