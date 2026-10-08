import { readFile } from "node:fs/promises"
import { getDocumentProxy } from "unpdf"

interface PositionedText {
  str: string
  x: number
  y: number
  width: number
}

interface TextItem {
  str: string
  transform: number[]
  width: number
}

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item &&
    Array.isArray((item as { transform: unknown }).transform)
  )
}

/**
 * Extracts text from a PDF line by line, rebuilding lines from glyph positions.
 * Google Docs exports split one visual line into several text runs; grouping by baseline
 * keeps "TSM- 472.50 or break of 465 PUT 457.50 10/23" on one line.
 */
export async function pdfLines(path: string): Promise<string[]> {
  const data = new Uint8Array(await readFile(path))
  const pdf = await getDocumentProxy(data)
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: PositionedText[] = []
    for (const item of content.items as unknown[]) {
      if (!isTextItem(item) || item.str.length === 0) continue
      const x = item.transform[4] ?? 0
      const y = item.transform[5] ?? 0
      items.push({ str: item.str, x, y, width: item.width })
    }
    // Group runs that share a baseline (within 2pt), top of the page first.
    const rows: PositionedText[][] = []
    for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs((r[0]?.y ?? 0) - item.y) < 2)
      if (row) row.push(item)
      else rows.push([item])
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x)
      let text = ""
      let end = Number.NEGATIVE_INFINITY
      for (const run of row) {
        if (text.length > 0 && run.x - end > 1 && !text.endsWith(" ") && !run.str.startsWith(" ")) text += " "
        text += run.str
        end = run.x + run.width
      }
      if (text.trim().length > 0) lines.push(text)
    }
  }
  return lines
}
