import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import type { IsoDate } from "@/core/domain/types"
import { invoicePdf } from "./invoice-pdf"

const invoice = {
  number: "HG-2026-001",
  status: "open" as const,
  issuedOn: "2026-10-22" as IsoDate,
  dueOn: "2026-10-01" as IsoDate,
  from: { name: "Hubert Gaffney", address: "100 Example Road\nFront Royal VA", phone: null, email: "hg@example.com" },
  billTo: { name: "José Müller", address: "12 Sample Street\nAtlanta GA", email: "jose@example.com", phone: null },
  program: "Beginner options and stock strategies, group format.",
  lines: [{ description: "13-week group session", period: "Q4 2026", amount: 189500 }],
  notes: ["Three one-on-one sessions with HG are included in the enrollment."],
  total: 189500,
  payment: { terms: "Pay in US dollars.", cashApp: "$Example", wise: null, wire: null },
  paidOn: null,
}

describe("invoice PDF", () => {
  it("is a one-page PDF named after the invoice", async () => {
    const pdf = await PDFDocument.load(await invoicePdf(invoice))
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe("Invoice HG-2026-001")
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 })
  })

  it("continues on more pages when the lines do not fit", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({
      description: `Line ${i + 1} with a description long enough to wrap onto a second line in its column`,
      period: "Q4 2026",
      amount: 100,
    }))
    const pdf = await PDFDocument.load(await invoicePdf({ ...invoice, lines, total: 6000 }))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })

  it("prints paid and cancelled invoices", async () => {
    await expect(invoicePdf({ ...invoice, status: "paid", paidOn: "2026-10-25" as IsoDate })).resolves.toBeInstanceOf(
      Uint8Array,
    )
    await expect(invoicePdf({ ...invoice, status: "void" })).resolves.toBeInstanceOf(Uint8Array)
  })
})
