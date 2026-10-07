import { TZDate } from "@date-fns/tz"
import type { IsoDate } from "./domain/types"

/** The business runs on US market time. */
export const MARKET_TZ = "America/New_York"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function parts(date: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(date)
  if (!match?.[1] || !match[2] || !match[3]) throw new RangeError(`Invalid ISO date: ${date}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const utc = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(utc.getTime()) && utc.toISOString().slice(0, 10) === value
}

export function asIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new RangeError(`Invalid ISO date: ${value}`)
  return value
}

/** Calendar arithmetic runs on UTC midnight, so daylight-saving changes never shift a date. */
function toUtc(date: IsoDate): Date {
  const { year, month, day } = parts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const utc = toUtc(date)
  utc.setUTCDate(utc.getUTCDate() + days)
  return fromUtc(utc)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  return toUtc(date).getUTCDay()
}

export function isWeekend(date: IsoDate): boolean {
  const dow = dayOfWeek(date)
  return dow === 0 || dow === 6
}

/** The calendar date of an instant in a time zone (New York by default). */
export function isoDateInZone(instant: Date, timeZone: string = MARKET_TZ): IsoDate {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
  return asIsoDate(formatted)
}

/** Today in New York. */
export function todayInMarketZone(now: Date = new Date()): IsoDate {
  return isoDateInZone(now, MARKET_TZ)
}

/** The instant at 00:00 local time on `date` in `timeZone`. */
export function zonedStartOfDay(date: IsoDate, timeZone: string = MARKET_TZ): Date {
  const { year, month, day } = parts(date)
  return new Date(new TZDate(year, month - 1, day, 0, 0, 0, 0, timeZone).getTime())
}

/**
 * The last completed Monday-to-Friday week as seen on `today`.
 * Saturday and Sunday look back at the week that just ended; a weekday looks back at the previous week.
 */
export function lastCompletedWeek(today: IsoDate): { start: IsoDate; end: IsoDate } {
  const dow = dayOfWeek(today)
  const daysBackToMonday = dow === 6 ? 5 : dow === 0 ? 6 : dow - 1 + 7
  const start = addDays(today, -daysBackToMonday)
  return { start, end: addDays(start, 4) }
}

/** The Friday on or after `date`. */
export function nextFriday(date: IsoDate): IsoDate {
  const dow = dayOfWeek(date)
  return addDays(date, (5 - dow + 7) % 7)
}
