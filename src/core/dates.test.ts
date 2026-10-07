import { describe, expect, it } from "vitest"
import {
  addDays,
  asIsoDate,
  dayOfWeek,
  daysBetween,
  isIsoDate,
  isoDateInZone,
  lastCompletedWeek,
  nextFriday,
  zonedStartOfDay,
} from "./dates"

const d = asIsoDate

describe("calendar dates", () => {
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-07")).toBe(true)
    expect(isIsoDate("2026-02-30")).toBe(false)
    expect(isIsoDate("10/07/2026")).toBe(false)
  })

  it("adds days across month, year and DST boundaries", () => {
    expect(addDays(d("2026-10-31"), 1)).toBe("2026-11-01")
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01")
    expect(addDays(d("2026-11-01"), 1)).toBe("2026-11-02")
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29")
  })

  it("counts days between dates", () => {
    expect(daysBetween(d("2026-10-07"), d("2026-12-31"))).toBe(85)
    expect(daysBetween(d("2026-12-31"), d("2026-10-07"))).toBe(-85)
  })

  it("knows weekdays", () => {
    expect(dayOfWeek(d("2026-10-07"))).toBe(3)
    expect(dayOfWeek(d("2026-10-23"))).toBe(5)
  })

  it("finds the last completed Monday to Friday week", () => {
    expect(lastCompletedWeek(d("2026-10-03"))).toEqual({ start: "2026-09-28", end: "2026-10-02" })
    expect(lastCompletedWeek(d("2026-10-04"))).toEqual({ start: "2026-09-28", end: "2026-10-02" })
    expect(lastCompletedWeek(d("2026-10-07"))).toEqual({ start: "2026-09-28", end: "2026-10-02" })
    expect(lastCompletedWeek(d("2026-10-05"))).toEqual({ start: "2026-09-28", end: "2026-10-02" })
    expect(lastCompletedWeek(d("2026-10-10"))).toEqual({ start: "2026-10-05", end: "2026-10-09" })
  })

  it("finds the next Friday", () => {
    expect(nextFriday(d("2026-10-07"))).toBe("2026-10-09")
    expect(nextFriday(d("2026-10-09"))).toBe("2026-10-09")
  })

  it("converts New York midnight to UTC in summer and winter time", () => {
    expect(zonedStartOfDay(d("2026-10-07")).toISOString()).toBe("2026-10-07T04:00:00.000Z")
    expect(zonedStartOfDay(d("2026-12-01")).toISOString()).toBe("2026-12-01T05:00:00.000Z")
  })

  it("reads the New York calendar date of an instant", () => {
    expect(isoDateInZone(new Date("2027-01-01T04:59:00Z"))).toBe("2026-12-31")
    expect(isoDateInZone(new Date("2027-01-01T05:00:00Z"))).toBe("2027-01-01")
  })
})
