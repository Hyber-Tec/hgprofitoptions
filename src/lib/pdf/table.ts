import "server-only"
import { rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib"

export interface PdfColumn {
  label: string
  width: number
  align: "left" | "right"
}

export interface PdfCell {
  text: string
  font?: PDFFont
  color?: RGB
}

export const INK = rgb(0.1, 0.1, 0.1)
export const MUTED = rgb(0.4, 0.4, 0.4)

/** One table row from `x`: each value in its column, left or right aligned with a little padding. */
export function drawRow(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  columns: readonly PdfColumn[],
  values: readonly (string | PdfCell)[],
  size = 9,
  color: RGB = INK,
) {
  let left = x
  values.forEach((value, i) => {
    const column = columns[i]
    if (!column) return
    const cell = typeof value === "string" ? { text: value } : value
    const cellFont = cell.font ?? font
    const width = cellFont.widthOfTextAtSize(cell.text, size)
    const drawX = column.align === "right" ? left + column.width - width - 5 : left + 5
    page.drawText(cell.text, { x: drawX, y, size, font: cellFont, color: cell.color ?? color })
    left += column.width
  })
}

/** A thin rule across the table, under its header. */
export function drawRule(page: PDFPage, x: number, y: number, columns: readonly PdfColumn[]) {
  page.drawLine({
    start: { x, y },
    end: { x: x + columns.reduce((sum, c) => sum + c.width, 0), y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
}
