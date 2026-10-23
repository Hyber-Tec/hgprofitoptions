import { describe, expect, it } from "vitest"
import type { IsoDate } from "./domain/types"
import {
  billingPeriod,
  formatCents,
  invoiceNumber,
  invoiceText,
  invoiceTotal,
  parseCents,
  periodLine,
  periodQuarters,
  periodSchedule,
  periodWeeks,
  unprintable,
} from "./invoice"

const d = (s: string) => s as IsoDate

describe("invoice amounts", () => {
  it("formats and reads dollars as cents", () => {
    expect(formatCents(189500)).toBe("$1,895.00")
    expect(formatCents(0)).toBe("$0.00")
    expect(formatCents(-5000)).toBe("-$50.00")
    expect(parseCents("1895")).toBe(189500)
    expect(parseCents("$1,895.00")).toBe(189500)
    expect(parseCents(" 1895.5 ")).toBe(189550)
    expect(parseCents("0.07")).toBe(7)
    expect(parseCents("12.345")).toBeNull()
    expect(parseCents("twelve")).toBeNull()
    expect(invoiceTotal([{ amount: 189500 }, { amount: 0 }, { amount: -10000 }])).toBe(179500)
  })

  it("numbers invoices by year", () => {
    expect(invoiceNumber(2026, 7)).toBe("HG-2026-007")
    expect(invoiceNumber(2027, 1234)).toBe("HG-2027-1234")
  })
})

describe("billing a membership period", () => {
  const q4 = { label: "Q4 2026", start: d("2026-10-01"), end: d("2026-12-31") }
  const year = { label: "Q1 2026 to Q4 2026", start: d("2026-01-01"), end: d("2026-12-31") }
  const joinedLate = { label: "Q3 2026", start: d("2026-08-15"), end: d("2026-09-30") }

  it("counts weeks and quarters", () => {
    expect(periodWeeks(q4.start, q4.end)).toBe(13)
    expect(periodQuarters(q4.start, q4.end)).toBe(1)
    expect(periodWeeks(year.start, year.end)).toBe(52)
    expect(periodQuarters(year.start, year.end)).toBe(4)
    expect(periodWeeks(joinedLate.start, joinedLate.end)).toBe(7)
  })

  it("prices each quarter and describes the schedule", () => {
    expect(periodLine(q4, 189500)).toEqual({ description: "13-week group session", period: "Q4 2026", amount: 189500 })
    expect(periodLine(year, 189500).amount).toBe(758000)
    expect(periodLine(q4, null).amount).toBe(0)
    expect(periodSchedule(q4)).toBe(
      "Group training runs from Oct 1, 2026 to Dec 31, 2026 (13 weeks). Renewal is due Jan 1, 2027, for Q1 2027.",
    )
  })

  it("bills the latest period that has not ended", () => {
    const q3 = { label: "Q3 2026", start: d("2026-07-01"), end: d("2026-09-30") }
    expect(billingPeriod([q3, q4], d("2026-10-22"))).toBe(q4)
    expect(billingPeriod([q3], d("2026-10-22"))).toBe(q3)
    expect(billingPeriod([], d("2026-10-22"))).toBeNull()
  })
})

describe("printable text", () => {
  it("allows Latin letters, accents and typographic quotes", () => {
    expect(unprintable("José Müller, 3653 Post Waite Circle\nDuluth GA “30097” – €")).toEqual([])
  })

  it("lists what the PDF font cannot print", () => {
    expect(unprintable("김다윗 Kim → \u{1F600}")).toEqual(["김", "다", "윗", "→", "\u{1F600}"])
  })

  it("tidies line breaks and tabs", () => {
    expect(invoiceText(" 758 Dorn Road \r\nFront Royal\tVA  \n")).toBe("758 Dorn Road\nFront Royal VA")
  })
})
