/**
 * Invoices: amounts in cents, numbering, the line and schedule a membership period bills, and the
 * characters the invoice PDF can print.
 */
import { addDays, daysBetween } from "./dates"
import type { IsoDate } from "./domain/types"
import { formatDate } from "./format"
import { quarterLabel, quarterOf } from "./membership/quarters"

export interface InvoiceLine {
  description: string
  /** The membership quarter it covers, such as "Q4 2026". */
  period: string | null
  /** In cents. */
  amount: number
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

/** "$1,895.00" from cents. */
export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/** Cents from what an admin types ("1895", "$1,895.00", "1895.5"), or null when it is not an amount. */
export function parseCents(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "")
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number(clean) * 100)
}

export const invoiceTotal = (lines: readonly Pick<InvoiceLine, "amount">[]): number =>
  lines.reduce((sum, line) => sum + line.amount, 0)

/** "HG-2026-007": numbered from 1 each year. */
export function invoiceNumber(year: number, sequence: number): string {
  return `HG-${year}-${String(sequence).padStart(3, "0")}`
}

/** Whole weeks a period covers: a quarter is 13. */
export function periodWeeks(start: IsoDate, end: IsoDate): number {
  return Math.max(1, Math.round((daysBetween(start, end) + 1) / 7))
}

/** How many calendar quarters a period touches, for its price. */
export function periodQuarters(start: IsoDate, end: IsoDate): number {
  const a = quarterOf(start)
  const b = quarterOf(end)
  return Math.max(1, (b.year - a.year) * 4 + (b.q - a.q) + 1)
}

interface Period {
  label: string
  start: IsoDate
  end: IsoDate
}

/** The invoice line for a membership period, at the price of a quarter (in cents) for each quarter. */
export function periodLine(period: Period, quarterPrice: number | null): InvoiceLine {
  return {
    description: `${periodWeeks(period.start, period.end)}-week group session`,
    period: period.label,
    amount: (quarterPrice ?? 0) * periodQuarters(period.start, period.end),
  }
}

/** "Group training runs from Oct 1 to Dec 31, 2026 (13 weeks). Renewal is due Jan 1, 2027, for Q1 2027." */
export function periodSchedule(period: Period): string {
  const renewal = addDays(period.end, 1)
  const next = quarterOf(renewal)
  return (
    `Group training runs from ${formatDate(period.start)} to ${formatDate(period.end)} ` +
    `(${periodWeeks(period.start, period.end)} weeks). Renewal is due ${formatDate(renewal)}, for ${quarterLabel(next.year, next.q)}.`
  )
}

/** The period an invoice bills by default: the latest that has not ended, or else the latest. */
export function billingPeriod<T extends Period>(periods: readonly T[], today: IsoDate): T | null {
  const sorted = [...periods].sort((a, b) => b.end.localeCompare(a.end))
  return sorted.find((p) => p.end >= today) ?? sorted[0] ?? null
}

/** Beyond ASCII and Latin-1, the PDF font (Helvetica, WinAnsi) has these: euro, quotes, dashes, bullet and a few more. */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ")

/** Characters in `text` the invoice cannot print, each once. Line breaks are fine. */
export function unprintable(text: string): string[] {
  const bad = new Set<string>()
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const ok = ch === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)
    if (!ok) bad.add(ch)
  }
  return [...bad]
}

/** Line breaks as \n, tabs as spaces and no trailing spaces, as the PDF expects. */
export function invoiceText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}
