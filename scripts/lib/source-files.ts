/**
 * Readers for HG's original tool files (kept in docs/private/source-files, never committed).
 * Used by the one-time import and by the local golden tests.
 */
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import ExcelJS from "exceljs"
import type { IsoDate } from "../../src/core/domain/types"
import { addDays, daysBetween, isIsoDate } from "../../src/core/dates"
import { pdfLines } from "./pdf-text"

export const SOURCE_DIR = join(process.cwd(), "docs", "private", "source-files")

export function sourceFile(prefix: string): string | null {
  if (!existsSync(SOURCE_DIR)) return null
  const name = readdirSync(SOURCE_DIR).find((f) => f.toLowerCase().startsWith(prefix.toLowerCase()))
  return name ? join(SOURCE_DIR, name) : null
}

export function sourceFilesPresent(): boolean {
  return ["Key Market Data", "MEDIAN and CHANNEL", "Strike Price Targets", "Profit Option"].every(
    (p) => sourceFile(p) !== null,
  )
}

type CellValue = ExcelJS.CellValue

/** The cached value of a cell, unwrapping formula results. */
function raw(value: CellValue): unknown {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result
    if ("richText" in value) return value.richText.map((r) => r.text).join("")
    if ("text" in value) return value.text
  }
  return value
}

function num(cell: ExcelJS.Cell): number | null {
  const v = raw(cell.value)
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function text(cell: ExcelJS.Cell): string {
  const v = raw(cell.value)
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "string") return v.trim()
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return ""
}

function isoDate(cell: ExcelJS.Cell): IsoDate | null {
  const v = raw(cell.value)
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : (v.toISOString().slice(0, 10) as IsoDate)
  if (typeof v === "string" && isIsoDate(v.trim().slice(0, 10))) return v.trim().slice(0, 10) as IsoDate
  return null
}

async function firstSheet(path: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`${path} has no worksheet`)
  return sheet
}

// ---------------------------------------------------------------------------------------------
// Key Market Data
// ---------------------------------------------------------------------------------------------

export interface KmdRow {
  symbol: string
  kind: "index" | "stock"
  pfcp: number
  high: number
  low: number
  close: number
  /** The sheet's own cached RANGE and SVI, for verification. */
  sheetRange: number
  sheetSvi: number
}

export interface KeyMarketDataFile {
  weekStart: IsoDate
  weekEnd: IsoDate
  previousFriday: IsoDate | null
  rows: KmdRow[]
  duplicates: string[]
}

const INDEX_SYMBOLS = new Set(["DJI", "SPX", "IXIC"])

export async function readKeyMarketData(path: string): Promise<KeyMarketDataFile> {
  const sheet = await firstSheet(path)
  // I2 holds an Apps Script custom function whose cached value is not exported; J2 (Friday) is plain.
  const weekEnd = isoDate(sheet.getCell("J2"))
  if (!weekEnd) throw new Error("Key Market Data: week end date in J2 not found")
  const weekStart = isoDate(sheet.getCell("I2")) ?? addDays(weekEnd, -4)
  const rows: KmdRow[] = []
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (let r = 3; r <= sheet.rowCount; r++) {
    const symbol = text(sheet.getCell(r, 1)).toUpperCase()
    const pfcp = num(sheet.getCell(r, 2))
    const high = num(sheet.getCell(r, 3))
    const low = num(sheet.getCell(r, 4))
    const close = num(sheet.getCell(r, 5))
    const sheetRange = num(sheet.getCell(r, 6))
    const sheetSvi = num(sheet.getCell(r, 7))
    if (
      !symbol ||
      pfcp === null ||
      high === null ||
      low === null ||
      close === null ||
      sheetRange === null ||
      sheetSvi === null
    )
      continue
    if (seen.has(symbol)) {
      duplicates.push(symbol)
      continue
    }
    seen.add(symbol)
    rows.push({
      symbol,
      kind: INDEX_SYMBOLS.has(symbol) ? "index" : "stock",
      pfcp,
      high,
      low,
      close,
      sheetRange,
      sheetSvi,
    })
  }
  return { weekStart, weekEnd, previousFriday: isoDate(sheet.getCell("K2")), rows, duplicates }
}

// ---------------------------------------------------------------------------------------------
// Median & Channel Chart
// ---------------------------------------------------------------------------------------------

export interface ChannelBlock {
  symbol: string
  ch: number
  boc: number
  price: number | null
  anchor: number
  high5d: number | null
  low5d: number | null
  high30d: number | null
  low30d: number | null
  high90d: number | null
  low90d: number | null
  sheetMedians: { m5: number | null; m30: number | null; m90: number | null }
  /** Cached ladder cells: lines M..U on the second row, BOC levels on the first row (Q is the ticker). */
  sheetLines: (number | null)[]
  sheetBocBelow: (number | null)[]
  sheetBocAbove: (number | null)[]
  fsLevels: number[]
  ssLevels: number[]
  earningsText: string
}

export interface ChannelFile {
  windows: {
    w5: [IsoDate | null, IsoDate | null]
    w30: [IsoDate | null, IsoDate | null]
    w90: [IsoDate | null, IsoDate | null]
  }
  blocks: ChannelBlock[]
}

function levels(label: string, prefix: string): number[] {
  return label
    .replace(new RegExp(`^${prefix}\\s*:`, "i"), "")
    .split(/[\s,]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
}

export async function readChannelSheet(path: string): Promise<ChannelFile> {
  const sheet = await firstSheet(path)
  const cell = (r: number, c: number) => sheet.getCell(r, c)
  const blocks: ChannelBlock[] = []
  for (let r = 3; r <= sheet.rowCount; r += 3) {
    const symbol = text(cell(r, 1)).toUpperCase()
    if (!/^[A-Z][A-Z.]{0,5}$/.test(symbol)) break
    const ch = num(cell(r, 2))
    const boc = num(cell(r + 1, 2))
    const anchor = num(cell(r + 1, 17))
    if (ch === null || boc === null || anchor === null)
      throw new Error(`Channel sheet: incomplete block for ${symbol} at row ${r}`)
    const columns = (row: number, from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => num(cell(row, from + i)))
    blocks.push({
      symbol,
      ch,
      boc,
      price: num(cell(r, 3)),
      anchor,
      high5d: num(cell(r, 7)),
      low5d: num(cell(r, 8)),
      high30d: num(cell(r, 9)),
      low30d: num(cell(r, 10)),
      high90d: num(cell(r, 11)),
      low90d: num(cell(r, 12)),
      sheetMedians: { m5: num(cell(r, 4)), m30: num(cell(r, 5)), m90: num(cell(r, 6)) },
      sheetLines: columns(r + 1, 13, 21),
      sheetBocBelow: columns(r, 13, 16).reverse(),
      sheetBocAbove: columns(r, 18, 21),
      fsLevels: levels(text(cell(r + 2, 3)), "FS"),
      ssLevels: levels(text(cell(r + 2, 5)), "SS"),
      earningsText: text(cell(r + 2, 13))
        .replace(/^EARNINGS:\s*/i, "")
        .trim(),
    })
  }
  const date = (ref: string) => isoDate(sheet.getCell(ref))
  return {
    windows: { w5: [date("G2"), date("H2")], w30: [date("I2"), date("J2")], w90: [date("K2"), date("L2")] },
    blocks,
  }
}

/**
 * Interprets the sheet's free-text earnings window ("10/25-11/02", "7/15", "X").
 * Only windows that end on or after `asOf` become dates; older ones are kept as a note.
 */
export function parseEarningsWindow(
  textValue: string,
  asOf: IsoDate,
): { start: IsoDate | null; end: IsoDate | null; note: string | null } {
  const cleaned = textValue.replace(/\s+/g, "")
  if (!cleaned || cleaned.toUpperCase() === "X")
    return { start: null, end: null, note: cleaned ? "Not applicable" : null }
  const match = /^(\d{1,2})\/(\d{1,2})(?:-(\d{1,2})\/(\d{1,2}))?$/.exec(cleaned)
  if (!match) return { start: null, end: null, note: textValue }
  const year = Number(asOf.slice(0, 4))
  const mk = (m: string | undefined, d: string | undefined, y: number): IsoDate | null => {
    if (!m || !d) return null
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    return isIsoDate(candidate) ? candidate : null
  }
  const start = mk(match[1], match[2], year)
  let end = mk(match[3] ?? match[1], match[4] ?? match[2], year)
  if (start && end && end < start) end = addDays(end, 365)
  if (!start || !end) return { start: null, end: null, note: textValue }
  if (daysBetween(asOf, end) < 0) return { start: null, end: null, note: `Last earnings window ${textValue}` }
  return { start, end, note: null }
}

// ---------------------------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------------------------

export async function readStrikeTargetsText(path: string): Promise<string> {
  return (await pdfLines(path)).join("\n")
}

export interface EtfGuide {
  guidance: string[]
  pairs: { underlying: string; etf: string }[]
}

export async function readEtfGuide(path: string): Promise<EtfGuide> {
  const lines = await pdfLines(path)
  const tableStart = lines.findIndex((l) => /^STOCK\s+BULL/i.test(l))
  if (tableStart < 0) throw new Error("ETF guide: table header not found")
  const guidanceLines = lines
    .slice(0, tableStart)
    .filter((l) => !/^Profit Option and corresponding|^Leveraged ETF/i.test(l))
  const paragraphs: string[] = []
  let current = ""
  for (const line of guidanceLines) {
    current = current ? `${current} ${line.trim()}` : line.trim()
    if (/[.!?]$/.test(line.trim())) {
      paragraphs.push(current)
      current = ""
    }
  }
  if (current) paragraphs.push(current)
  const pairs = lines
    .slice(tableStart + 1)
    .map((l) => l.trim().split(/\s+/))
    .filter(
      (parts): parts is [string, string] => parts.length === 2 && parts.every((p) => /^[A-Z][A-Z.]{0,5}$/.test(p)),
    )
    .map(([underlying, etf]) => ({ underlying, etf }))
  return { guidance: paragraphs, pairs }
}
