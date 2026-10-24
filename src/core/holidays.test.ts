import { describe, expect, it } from "vitest"
import { asIsoDate } from "./dates"
import {
  isMarketHoliday,
  isTradingDay,
  lastCompleteWeek,
  marketHolidays,
  tradingDayOnOrBefore,
  tradingDaysAfter,
} from "./holidays"

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

describe("trading days", () => {
  it("steps back over weekends and holidays", () => {
    expect(tradingDayOnOrBefore(asIsoDate("2026-11-29"))).toBe("2026-11-27")
    expect(tradingDayOnOrBefore(asIsoDate("2026-11-26"))).toBe("2026-11-25")
  })

  it("lists the sessions in a gap", () => {
    expect(tradingDaysAfter(asIsoDate("2026-11-24"), asIsoDate("2026-11-30"))).toEqual([
      "2026-11-25",
      "2026-11-27",
      "2026-11-30",
    ])
  })

  it("counts a week as complete once its last session is over", () => {
    // Friday evening: that Friday's week. Thursday: the week before.
    expect(lastCompleteWeek(asIsoDate("2026-10-23"))).toEqual({ start: "2026-10-19", end: "2026-10-23" })
    expect(lastCompleteWeek(asIsoDate("2026-10-22"))).toEqual({ start: "2026-10-12", end: "2026-10-16" })
    // Good Friday 2027 (Mar 26): the week ends on Thursday.
    expect(lastCompleteWeek(asIsoDate("2027-03-25"))).toEqual({ start: "2027-03-22", end: "2027-03-26" })
  })
})
