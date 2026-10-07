import type { Instrument, IsoDate } from "./domain/types"
import { MARKET_TZ } from "./dates"

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const usd4 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})
const num2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num4 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })

function money(value: number, currency: string): string {
  if (currency === "USD") return Math.abs(value) < 1 && value !== 0 ? usd4.format(value) : usd2.format(value)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** "$1,234.56", or 4 decimals under $1 ("$0.6648"). */
export function formatPrice(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-"
  return money(value, currency)
}

/** A plain level without a currency sign: "472.50", or 4 decimals under 1. */
export function formatLevel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-"
  return Math.abs(value) < 1 && value !== 0 ? num4.format(value) : num2.format(value)
}

/** "+78.94" / "-17.18" / "0.00". */
export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-"
  const fmt = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  })
  return fmt.format(value)
}

/** "+$2,460.00" / "-$450.00". */
export function formatSignedMoney(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${money(Math.abs(value), currency)}`
}

/** A fraction as a percent: 0.1462 -> "+14.62%". */
export function formatPercent(
  fraction: number | null | undefined,
  options: { digits?: number; signed?: boolean } = {},
): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "-"
  const { digits = 2, signed = true } = options
  const fmt = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? "exceptZero" : "auto",
  })
  return fmt.format(fraction)
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function isoToUtcDate(date: IsoDate): Date {
  return new Date(`${date}T12:00:00Z`)
}

/** "Oct 7, 2026". */
export function formatDate(date: IsoDate | null | undefined): string {
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    isoToUtcDate(date),
  )
}

/** "Wed, Oct 7, 2026". */
export function formatDateWithWeekday(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(isoToUtcDate(date))
}

/** "Oct 23". */
export function formatShortDate(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    isoToUtcDate(date),
  )
}

/** Option expiry in tables: "10/23". */
export function formatExpiry(date: IsoDate): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

/** "9:42 AM ET" for an instant, in New York time. */
export function formatTimeET(instant: Date): string {
  return `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: MARKET_TZ }).format(instant)} ET`
}

/** "Oct 7, 2026, 9:42 AM ET". */
export function formatDateTimeET(instant: Date): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: MARKET_TZ,
  }).format(instant)
  return `${date}, ${formatTimeET(instant)}`
}

/** "3 min ago", "2 h ago", "5 d ago", or "in 2 h" for future instants. */
export function formatRelative(instant: Date, now: Date = new Date()): string {
  const diff = Math.round((now.getTime() - instant.getTime()) / 1000)
  const seconds = Math.abs(diff)
  if (seconds < 45) return "just now"
  const wrap = (text: string) => (diff < 0 ? `in ${text}` : `${text} ago`)
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return wrap(`${minutes} min`)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return wrap(`${hours} h`)
  return wrap(`${Math.round(hours / 24)} d`)
}

/** "TSM $472.50 Call · Exp Oct 23" or "AAPL". */
export function formatInstrument(instrument: Instrument): string {
  if (instrument.assetType === "stock") return instrument.symbol
  const right = instrument.right === "call" ? "Call" : "Put"
  return `${instrument.symbol} ${formatPrice(instrument.strike)} ${right} · Exp ${formatShortDate(instrument.expiry)}`
}
