import type { Fill, Instrument, IsoDate } from "../domain/types"
import { isIsoDate, zonedStartOfDay } from "../dates"

export interface CsvIssue {
  line: number
  message: string
}

export interface ParsedFills {
  format: "webull" | "template"
  fills: Fill[]
  issues: CsvIssue[]
  skipped: number
}

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const input = text.replace(/^﻿/, "")
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i)
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += ch
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

/** FNV-1a: a stable id for a CSV row, so importing the same file twice does not duplicate fills. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

const normalize = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** "TSLA261016C00430000" (OCC) or "TSLA 10/16/2026 430 Call". */
export function parseOptionSymbol(raw: string): Instrument | null {
  const text = raw.trim().toUpperCase()
  const occ = /^([A-Z][A-Z.]{0,5})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(text)
  if (occ) {
    const [, symbol, yy, mm, dd, right, strike] = occ
    const expiry = `20${yy}-${mm}-${dd}`
    if (!symbol || !isIsoDate(expiry)) return null
    return { assetType: "option", symbol, right: right === "C" ? "call" : "put", strike: Number(strike) / 1000, expiry }
  }
  const words = /^([A-Z][A-Z.]{0,5})\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+\$?([\d.]+)\s+(CALL|PUT)$/.exec(text)
  if (words) {
    const [, symbol, m, d, y, strike, right] = words
    const year = y && y.length === 2 ? `20${y}` : y
    const expiry = `${year}-${m?.padStart(2, "0")}-${d?.padStart(2, "0")}`
    if (!symbol || !isIsoDate(expiry)) return null
    return { assetType: "option", symbol, right: right === "CALL" ? "call" : "put", strike: Number(strike), expiry }
  }
  return null
}

/** "10/03/2026 10:31:02 EDT", "2026-10-03 10:31" or "2026-10-03T14:31:02Z" → ISO instant (New York time unless a Z/offset is given). */
export function parseTradeTime(raw: string): string | null {
  const text = raw.trim()
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const d = new Date(text)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text)
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text)
  let date: string | null = null
  let h = 12
  let m = 0
  let s = 0
  if (us) {
    date = `${us[3]}-${us[1]?.padStart(2, "0")}-${us[2]?.padStart(2, "0")}`
    if (us[4]) [h, m, s] = [Number(us[4]), Number(us[5]), Number(us[6] ?? 0)]
  } else if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`
    if (iso[4]) [h, m, s] = [Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0)]
  }
  if (!date || !isIsoDate(date)) return null
  return new Date(zonedStartOfDay(date).getTime() + ((h * 60 + m) * 60 + s) * 1000).toISOString()
}

const num = (raw: string | undefined): number | null => {
  if (raw === undefined) return null
  const cleaned = raw.replace(/[$,\s@]/g, "")
  if (cleaned === "") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Reads a trade history CSV into fills. Supports Webull's order history export and the simple
 * template (date, symbol, side, quantity, price, fees, type, strike, expiry).
 */
export function parseTradesCsv(text: string, accountId = "csv"): ParsedFills {
  const rows = parseCsv(text)
  const header = rows[0]?.map(normalize) ?? []
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const issues: CsvIssue[] = []
  const fills: Fill[] = []
  let skipped = 0

  const webull = col("filled time") >= 0 && col("side") >= 0 && col("symbol") >= 0
  const format: ParsedFills["format"] = webull ? "webull" : "template"
  const idx = webull
    ? {
        time: col("filled time"),
        symbol: col("symbol", "name"),
        side: col("side"),
        qty: col("filled", "filled qty", "total qty"),
        price: col("avg price", "price"),
        status: col("status"),
        fees: -1,
        type: -1,
        strike: -1,
        expiry: -1,
      }
    : {
        time: col("date", "time", "executed at"),
        symbol: col("symbol", "ticker"),
        side: col("side", "action"),
        qty: col("quantity", "qty", "shares", "contracts"),
        price: col("price", "fill price"),
        status: -1,
        fees: col("fees", "commission"),
        type: col("type", "asset type"),
        strike: col("strike"),
        expiry: col("expiry", "expiration"),
      }

  const missing = (["time", "symbol", "side", "qty", "price"] as const).filter((k) => idx[k] < 0)
  if (rows.length === 0 || missing.length > 0) {
    return {
      format,
      fills: [],
      skipped: 0,
      issues: [
        { line: 1, message: `Missing column(s): ${missing.join(", ")}. Use the Webull order export or the template.` },
      ],
    }
  }

  for (const [i, row] of rows.slice(1).entries()) {
    const line = i + 2
    const cell = (k: number) => (k >= 0 ? (row[k] ?? "").trim() : "")
    if (idx.status >= 0 && !/^filled$/i.test(cell(idx.status))) {
      skipped++
      continue
    }
    const sideText = cell(idx.side).toLowerCase()
    const side = sideText.startsWith("b") ? "buy" : sideText.startsWith("s") ? "sell" : null
    const quantity = num(cell(idx.qty))
    const price = num(cell(idx.price))
    const executedAt = parseTradeTime(cell(idx.time))
    const rawSymbol = cell(idx.symbol)
    if (!side) issues.push({ line, message: `Unknown side "${cell(idx.side)}".` })
    if (quantity === null || quantity <= 0) issues.push({ line, message: "Quantity must be a number above zero." })
    if (price === null || price < 0) issues.push({ line, message: "Price must be a number." })
    if (!executedAt) issues.push({ line, message: `Unreadable date "${cell(idx.time)}".` })

    let instrument: Instrument | null = parseOptionSymbol(rawSymbol)
    if (!instrument) {
      const type = cell(idx.type).toLowerCase()
      const symbol = rawSymbol.toUpperCase()
      if (type === "call" || type === "put") {
        const strike = num(cell(idx.strike))
        const expiry = cell(idx.expiry)
        const expiryIso = parseTradeTime(expiry)?.slice(0, 10) ?? null
        if (strike !== null && expiryIso && /^[A-Z][A-Z.]{0,5}$/.test(symbol))
          instrument = { assetType: "option", symbol, right: type, strike, expiry: expiryIso as IsoDate }
      } else if (/^[A-Z][A-Z.]{0,5}$/.test(symbol)) {
        instrument = { assetType: "stock", symbol }
      }
    }
    if (!instrument) issues.push({ line, message: `Unrecognized symbol "${rawSymbol}".` })
    if (!side || quantity === null || quantity <= 0 || price === null || price < 0 || !executedAt || !instrument)
      continue
    fills.push({
      id: `csv-${hash(row.join("|"))}`,
      accountId,
      instrument,
      side,
      quantity,
      price,
      fees: num(cell(idx.fees)) ?? 0,
      executedAt,
    })
  }
  fills.sort((a, b) => a.executedAt.localeCompare(b.executedAt))
  return { format, fills, issues, skipped }
}

export const TEMPLATE_CSV = [
  "date,symbol,side,quantity,price,fees,type,strike,expiry",
  "2026-10-01 10:05,TSM,buy,2,3.25,1.30,call,472.5,2026-10-23",
  "2026-10-03 11:40,TSM,sell,2,5.10,1.30,call,472.5,2026-10-23",
  "2026-10-02 09:45,AAPL,buy,20,251.10,0,stock,,",
].join("\n")
