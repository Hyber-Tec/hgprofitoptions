import { describe, expect, it } from "vitest"
import { asIsoDate } from "./dates"
import { isMarketHoliday, isTradingDay, marketHolidays } from "./holidays"

describe("market holidays", () => {
  it("matches the exchange's 2026 calendar", () => {
    expect([...marketHolidays(2026)].sort()).toEqual([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-04-03",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ])
  })

  it("moves weekend holidays to the nearest weekday", () => {
    // 2027: Juneteenth and Christmas fall on a Saturday, Independence Day on a Sunday.
    expect([...marketHolidays(2027)].sort()).toEqual([
      "2027-01-01",
      "2027-01-18",
      "2027-02-15",
      "2027-03-26",
      "2027-05-31",
      "2027-06-18",
      "2027-07-05",
      "2027-09-06",
      "2027-11-25",
      "2027-12-24",
    ])
  })

  it("does not close the old year for a New Year's Day on a Saturday", () => {
    expect(isMarketHoliday(asIsoDate("2021-12-31"))).toBe(false)
    expect(marketHolidays(2022).has(asIsoDate("2022-01-01"))).toBe(false)
  })

  it("tells trading days apart", () => {
    expect(isTradingDay(asIsoDate("2026-11-25"))).toBe(true)
    expect(isTradingDay(asIsoDate("2026-11-26"))).toBe(false)
    expect(isTradingDay(asIsoDate("2026-10-24"))).toBe(false)
  })
})
