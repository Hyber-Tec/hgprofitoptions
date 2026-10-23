/**
 * The invoice as a PDF (US Letter): the number and dates, who it is from and for, the program, the lines
 * and total, the notes and how to pay. Text is checked with `unprintable` before an invoice is issued,
 * because the standard fonts only print Latin characters.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { formatCents, invoiceText } from "@/core/invoice"
import { formatDate } from "@/core/format"
import type { InvoiceDoc } from "./model"

type Invoice = Omit<InvoiceDoc, "id" | "uid" | "createdAt" | "createdBy" | "updatedAt">

const PAGE = { width: 612, height: 792 }
const MARGIN = 56
const WIDTH = PAGE.width - MARGIN * 2
const BOTTOM = 72
const INK = rgb(0.09, 0.09, 0.09)
const MUTED = rgb(0.42, 0.42, 0.42)
const RULE = rgb(0.86, 0.86, 0.86)
const RED = rgb(0.72, 0.11, 0.11)
const GREEN = rgb(0.05, 0.45, 0.25)

/** Lines of `text` that fit `width`; words longer than a line are broken. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const paragraph of invoiceText(text).split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
        continue
      }
      if (line) out.push(line)
      line = word
      while (font.widthOfTextAtSize(line, size) > width) {
        let cut = line.length - 1
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    out.push(line)
  }
  return out
}

export async function invoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${invoice.number}`)
  doc.setAuthor(invoice.from.name)
  doc.setCreator("HG Profit Options")
  doc.setProducer("HG Profit Options")
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN

  /** Starts a new page when `height` more points would run into the footer. */
  const room = (height: number) => {
    if (y - height >= BOTTOM) return
    page = doc.addPage([PAGE.width, PAGE.height])
    y = PAGE.height - MARGIN
  }
  const text = (
    value: string,
    x: number,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {},
  ) => {
    const font = options.font ?? regular
    const size = options.size ?? 10
    const left = options.align === "right" ? x - font.widthOfTextAtSize(value, size) : x
    page.drawText(value, { x: left, y, size, font, color: options.color ?? INK })
  }
  const label = (value: string, x: number, align: "left" | "right" = "left") =>
    text(value.toUpperCase(), x, { size: 7.5, color: MUTED, font: bold, align })
  const rule = (gap = 10) => {
    page.drawLine({
      start: { x: MARGIN, y: y + gap / 2 },
      end: { x: MARGIN + WIDTH, y: y + gap / 2 },
      thickness: 0.6,
      color: RULE,
    })
  }
  /** A wrapped paragraph at x, `width` wide; moves y below it. */
  const paragraph = (value: string, x: number, width: number, size = 10, font = regular, color = INK) => {
    for (const line of wrap(value, font, size, width)) {
      room(size + 4)
      text(line, x, { size, font, color })
      y -= size + 4
    }
  }

  // Heading: the title on the left, the number and dates on the right.
  text("INVOICE", MARGIN, { font: bold, size: 22 })
  const right = MARGIN + WIDTH
  const meta: [string, string, ReturnType<typeof rgb>][] = [
    ["Invoice", invoice.number, INK],
    ["Issued", formatDate(invoice.issuedOn), INK],
  ]
  if (invoice.dueOn) meta.push(["Due", formatDate(invoice.dueOn), INK])
  if (invoice.status === "paid") meta.push(["Paid", formatDate(invoice.paidOn), GREEN])
  if (invoice.status === "void") meta.push(["Status", "Cancelled", RED])
  let metaY = y + 4
  for (const [name, value, color] of meta) {
    page.drawText(value, {
      x: right - bold.widthOfTextAtSize(value, 10),
      y: metaY,
      size: 10,
      font: bold,
      color,
    })
    const tag = name.toUpperCase()
    page.drawText(tag, {
      x: right - 120 - bold.widthOfTextAtSize(tag, 7.5),
      y: metaY + 1,
      size: 7.5,
      font: bold,
      color: MUTED,
    })
    metaY -= 15
  }
  y = Math.min(y - 36, metaY - 14)

  // From and billed to, side by side.
  const column = (x: number, title: string, lines: (string | null)[], width: number) => {
    let cy = y
    page.drawText(title.toUpperCase(), { x, y: cy, size: 7.5, font: bold, color: MUTED })
    cy -= 15
    lines.forEach((value, i) => {
      if (!value) return
      for (const line of wrap(value, i === 0 ? bold : regular, i === 0 ? 11 : 10, width)) {
        page.drawText(line, {
          x,
          y: cy,
          size: i === 0 ? 11 : 10,
          font: i === 0 ? bold : regular,
          color: i >= lines.length - 2 ? MUTED : INK,
        })
        cy -= i === 0 ? 15 : 13
      }
    })
    return cy
  }
  const half = WIDTH / 2 - 12
  const fromEnd = column(
    MARGIN,
    "From",
    [invoice.from.name, invoice.from.address, invoice.from.phone, invoice.from.email],
    half,
  )
  const toEnd = column(
    MARGIN + WIDTH / 2 + 12,
    "Billed to",
    [invoice.billTo.name, invoice.billTo.address, invoice.billTo.phone, invoice.billTo.email],
    half,
  )
  y = Math.min(fromEnd, toEnd) - 14

  if (invoice.program.trim()) {
    paragraph(invoice.program, MARGIN, WIDTH)
    y -= 12
  }

  // Lines and total.
  const periodX = MARGIN + 300
  room(40)
  label("Description", MARGIN)
  label("Period", periodX)
  label("Amount", right, "right")
  y -= 8
  rule(0)
  y -= 16
  for (const line of invoice.lines) {
    const rows = wrap(line.description, regular, 10, 280)
    room(rows.length * 14 + 6)
    text(line.period ?? "", periodX)
    text(formatCents(line.amount), right, { align: "right" })
    for (const row of rows) {
      text(row, MARGIN)
      y -= 14
    }
    y -= 6
  }
  rule(8)
  y -= 14
  room(48)
  text("Total", periodX, { font: bold, size: 11 })
  text(formatCents(invoice.total), right, { font: bold, size: 11, align: "right" })
  y -= 18
  if (invoice.status === "void") {
    text("This invoice was cancelled.", periodX, { color: RED })
  } else {
    text("Balance due", periodX, { color: MUTED })
    text(formatCents(invoice.status === "paid" ? 0 : invoice.total), right, { align: "right", color: MUTED })
  }
  y -= 26

  // Notes.
  for (const note of invoice.notes) {
    const rows = wrap(note, regular, 10, WIDTH - 14)
    room(rows.length * 14)
    text("•", MARGIN, { color: MUTED })
    for (const row of rows) {
      text(row, MARGIN + 14)
      y -= 14
    }
  }
  if (invoice.notes.length > 0) y -= 12

  // How to pay.
  if (invoice.status !== "void") {
    room(60)
    text("How to pay", MARGIN, { font: bold, size: 12 })
    y -= 18
    paragraph(invoice.payment.terms, MARGIN, WIDTH, 10, regular, INK)
    y -= 6
    const row = (name: string, value: string | null) => {
      if (!value?.trim()) return
      const rows = wrap(value, regular, 10, WIDTH - 140)
      room(rows.length * 14)
      text(name, MARGIN, { color: MUTED, size: 9.5 })
      for (const line of rows) {
        text(line, MARGIN + 140)
        y -= 14
      }
      y -= 2
    }
    row("Cash App", invoice.payment.cashApp)
    row("Wise", invoice.payment.wise)
    const wire = invoice.payment.wire
    if (wire) {
      y -= 6
      room(30)
      text("Wire transfer", MARGIN, { font: bold, size: 10 })
      y -= 16
      row("Bank", wire.bank)
      row("Bank address", wire.bankAddress)
      row("SWIFT / BIC", wire.swift)
      row("Routing number", wire.routing)
      row("Beneficiary", wire.beneficiary)
      row("Beneficiary address", wire.beneficiaryAddress)
      row("Account number", wire.account)
    }
    y -= 8
    paragraph(`Please include ${invoice.number} with your payment. Thank you.`, MARGIN, WIDTH, 9.5, regular, MUTED)
  }

  // Footers, now that the page count is known.
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawText("HG Profit Options", { x: MARGIN, y: 36, size: 8, font: regular, color: MUTED })
    const count = `${invoice.number} · Page ${i + 1} of ${pages.length}`
    p.drawText(count, {
      x: MARGIN + WIDTH - regular.widthOfTextAtSize(count, 8),
      y: 36,
      size: 8,
      font: regular,
      color: MUTED,
    })
  })
  return doc.save()
}
