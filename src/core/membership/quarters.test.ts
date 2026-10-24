import { describe, expect, it } from "vitest"
import type { IsoDate, MembershipPeriod } from "../domain/types"
import {
  accessWindow,
  addQuarters,
  describePeriodRange,
  findOverlap,
  hasAccess,
  hasFullAccess,
  membershipStatus,
  nextRenewalQuarter,
  periodFromQuarters,
  quarterOf,
  quarterRange,
  trialPeriod,
} from "./quarters"

const d = (s: string) => s as IsoDate
const period = (id: string, start: string, end: string): MembershipPeriod => ({
  id,
  start: d(start),
  end: d(end),
  kind: "quarterly",
  label: id,
})

describe("quarters", () => {
  it("returns calendar quarter ranges", () => {
    expect(quarterRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" })
    expect(quarterRange(2026, 4)).toEqual({ start: "2026-10-01", end: "2026-12-31" })
    expect(quarterRange(2028, 1)).toEqual({ start: "2028-01-01", end: "2028-03-31" })
  })

  it("adds quarters across years", () => {
    expect(addQuarters(2026, 4, 1)).toEqual({ year: 2027, q: 1 })
    expect(addQuarters(2026, 4, 0)).toEqual({ year: 2026, q: 4 })
    expect(addQuarters(2027, 1, -1)).toEqual({ year: 2026, q: 4 })
  })

  it("builds periods from quarters", () => {
    expect(periodFromQuarters(2026, 4, 1)).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
      label: "Q4 2026",
      kind: "quarterly",
    })
    expect(periodFromQuarters(2026, 4, 2)).toEqual({
      start: "2026-10-01",
      end: "2027-03-31",
      label: "Q4 2026 to Q1 2027",
      kind: "quarterly",
    })
    expect(periodFromQuarters(2026, 4, 1, d("2026-11-15"))).toMatchObject({
      start: "2026-11-15",
      end: "2026-12-31",
      kind: "custom",
    })
  })

  it("rejects invalid period input", () => {
    expect(() => periodFromQuarters(2026, 4, 0)).toThrow()
    expect(() => periodFromQuarters(2026, 4, 1, d("2027-01-02"))).toThrow()
  })

  it("finds the quarter of a date", () => {
    expect(quarterOf(d("2026-10-07"))).toEqual({ year: 2026, q: 4 })
    expect(quarterOf(d("2027-03-31"))).toEqual({ year: 2027, q: 1 })
  })

  it("suggests the next renewal quarter", () => {
    expect(nextRenewalQuarter([period("a", "2026-10-01", "2026-12-31")], d("2026-11-01"))).toEqual({ year: 2027, q: 1 })
    expect(nextRenewalQuarter([period("a", "2026-01-01", "2026-03-31")], d("2026-11-01"))).toEqual({ year: 2026, q: 4 })
    expect(nextRenewalQuarter([], d("2026-11-01"))).toEqual({ year: 2026, q: 4 })
  })

  it("detects overlapping periods", () => {
    const existing = [period("q4", "2026-10-01", "2026-12-31")]
    expect(findOverlap({ start: d("2026-12-31"), end: d("2027-03-31") }, existing)?.id).toBe("q4")
    expect(findOverlap({ start: d("2027-01-01"), end: d("2027-03-31") }, existing)).toBeNull()
  })

  it("describes ranges", () => {
    expect(describePeriodRange(d("2026-10-01"), d("2026-12-31"))).toBe("Oct 1 to Dec 31, 2026")
    expect(describePeriodRange(d("2026-10-01"), d("2027-03-31"))).toBe("Oct 1, 2026 to Mar 31, 2027")
  })
})

describe("membership status", () => {
  const q4 = period("q4", "2026-10-01", "2026-12-31")
  const q1 = period("q1", "2027-01-01", "2027-03-31")
  const base = { role: "member" as const, status: "active" as const }

  it("is active with days left on Oct 7, 2026", () => {
    const status = membershipStatus({ ...base, periods: [q4], today: d("2026-10-07") })
    expect(status).toMatchObject({ kind: "active", daysLeft: 85, expiringSoon: false, coverageEnd: "2026-12-31" })
  })

  it("follows back-to-back renewals", () => {
    const status = membershipStatus({ ...base, periods: [q1, q4], today: d("2026-12-20") })
    expect(status).toMatchObject({ kind: "active", coverageEnd: "2027-03-31", expiringSoon: false })
  })

  it("flags expiring soon within 14 days", () => {
    expect(membershipStatus({ ...base, periods: [q4], today: d("2026-12-20") })).toMatchObject({
      kind: "active",
      expiringSoon: true,
      daysLeft: 11,
    })
  })

  it("is active on the last day and expired the next day", () => {
    expect(membershipStatus({ ...base, periods: [q4], today: d("2026-12-31") }).kind).toBe("active")
    expect(membershipStatus({ ...base, periods: [q4], today: d("2027-01-01") }).kind).toBe("expired")
  })

  it("is upcoming before the first period", () => {
    expect(membershipStatus({ ...base, periods: [q1], today: d("2026-12-01") }).kind).toBe("upcoming")
  })

  it("handles admins, suspension and no periods", () => {
    expect(membershipStatus({ role: "admin", status: "active", periods: [], today: d("2026-10-07") }).kind).toBe(
      "admin",
    )
    expect(membershipStatus({ ...base, status: "suspended", periods: [q4], today: d("2026-10-07") }).kind).toBe(
      "suspended",
    )
    expect(membershipStatus({ ...base, periods: [], today: d("2026-10-07") }).kind).toBe("none")
  })

  it("knows data editors, who are suspended like anyone else", () => {
    expect(membershipStatus({ role: "editor", status: "active", periods: [], today: d("2026-10-07") }).kind).toBe(
      "editor",
    )
    expect(membershipStatus({ role: "editor", status: "suspended", periods: [], today: d("2026-10-07") }).kind).toBe(
      "suspended",
    )
  })
})

describe("free trials", () => {
  const base = { role: "member" as const, status: "active" as const }
  const trial: MembershipPeriod = { ...trialPeriod(d("2026-10-23"), 7), id: "trial" }
  const q4 = period("q4", "2026-10-01", "2026-12-31")

  it("lasts the number of days set, today included", () => {
    expect(trialPeriod(d("2026-10-23"), 7)).toEqual({
      start: "2026-10-23",
      end: "2026-10-29",
      kind: "trial",
      label: "Free trial",
    })
  })

  it("opens the member area, held back from HG's newest posts", () => {
    const status = membershipStatus({ ...base, periods: [trial], today: d("2026-10-25") })
    expect(status).toMatchObject({ kind: "trial", daysLeft: 4 })
    expect(hasAccess(status)).toBe(true)
    expect(hasFullAccess(status)).toBe(false)
  })

  it("gives way to a paid quarter on the same day", () => {
    const status = membershipStatus({ ...base, periods: [trial, q4], today: d("2026-10-25") })
    expect(status.kind).toBe("active")
    expect(hasFullAccess(status)).toBe(true)
  })

  it("ends like a membership, remembered as a trial", () => {
    const status = membershipStatus({ ...base, periods: [trial], today: d("2026-10-30") })
    expect(status).toMatchObject({ kind: "expired", last: { kind: "trial" } })
    expect(hasAccess(status)).toBe(false)
  })
})

describe("access window", () => {
  const q4 = period("q4", "2026-10-01", "2026-12-31")
  const q1 = period("q1", "2027-01-01", "2027-03-31")
  const q3 = period("q3", "2027-07-01", "2027-09-30")

  it("covers the contiguous block containing today", () => {
    expect(accessWindow([q4, q1, q3], d("2026-11-01"))).toEqual({ from: "2026-10-01", untilExclusive: "2027-04-01" })
  })

  it("points at the next block during a gap", () => {
    expect(accessWindow([q4, q1, q3], d("2027-05-01"))).toEqual({ from: "2027-07-01", untilExclusive: "2027-10-01" })
  })

  it("includes earlier contiguous periods", () => {
    expect(accessWindow([q4, q1], d("2027-02-01"))).toEqual({ from: "2026-10-01", untilExclusive: "2027-04-01" })
  })

  it("is null when everything has ended", () => {
    expect(accessWindow([q4], d("2027-01-01"))).toBeNull()
  })
})
