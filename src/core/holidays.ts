import { addDays, dayOfWeek, isWeekend, mondayOf } from "./dates"
import type { IsoDate } from "./domain/types"

const iso = (year: number, month: number, day: number) =>
  `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate

/** The `n`th `weekday` (0 = Sunday) of a month; n = -1 is the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): IsoDate {
  if (n < 0) {
    const last = addDays(iso(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1), -1)
    return addDays(last, -((dayOfWeek(last) - weekday + 7) % 7))
  }
  const first = iso(year, month, 1)
  return addDays(first, ((weekday - dayOfWeek(first) + 7) % 7) + (n - 1) * 7)
}

/** Easter Sunday (Gregorian calendar, the anonymous algorithm). */
function easter(year: number): IsoDate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

/** A fixed-date holiday moves to Friday when it falls on a Saturday and to Monday on a Sunday. */
function observed(date: IsoDate): IsoDate {
  const dow = dayOfWeek(date)
  return dow === 6 ? addDays(date, -1) : dow === 0 ? addDays(date, 1) : date
}

const cache = new Map<number, ReadonlySet<IsoDate>>()

/** The days the New York Stock Exchange is closed for a holiday in `year` (its published rules). */
export function marketHolidays(year: number): ReadonlySet<IsoDate> {
  const hit = cache.get(year)
  if (hit) return hit
  const newYear = iso(year, 1, 1)
  const days = new Set<IsoDate>([
    // New Year's Day on a Saturday is not made up on the Friday before, which closes the old year.
    ...(dayOfWeek(newYear) === 6 ? [] : [observed(newYear)]),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    addDays(easter(year), -2),
    nthWeekday(year, 5, 1, -1),
    // Juneteenth became a market holiday in 2022.
    ...(year >= 2022 ? [observed(iso(year, 6, 19))] : []),
    observed(iso(year, 7, 4)),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observed(iso(year, 12, 25)),
  ])
  cache.set(year, days)
  return days
}

export function isMarketHoliday(date: IsoDate): boolean {
  return marketHolidays(Number(date.slice(0, 4))).has(date)
}

/** A weekday the market is open (special closures, such as a national day of mourning, are not known). */
export function isTradingDay(date: IsoDate): boolean {
  return !isWeekend(date) && !isMarketHoliday(date)
}

/** The latest trading day on or before `date`. */
export function tradingDayOnOrBefore(date: IsoDate): IsoDate {
  let day = date
  while (!isTradingDay(day)) day = addDays(day, -1)
  return day
}

/** The trading days after `after`, up to and including `through`, oldest first. */
export function tradingDaysAfter(after: IsoDate, through: IsoDate): IsoDate[] {
  const days: IsoDate[] = []
  for (let day = addDays(after, 1); day <= through; day = addDays(day, 1)) if (isTradingDay(day)) days.push(day)
  return days
}

/**
 * The latest Monday-to-Friday week whose sessions are all over by `through` (its last trading day is on
 * or before it): on a Friday evening, that Friday's week.
 */
export function lastCompleteWeek(through: IsoDate): { start: IsoDate; end: IsoDate } {
  const monday = mondayOf(through)
  const thisWeek = { start: monday, end: addDays(monday, 4) }
  if (tradingDayOnOrBefore(thisWeek.end) <= through && tradingDayOnOrBefore(thisWeek.end) >= monday) return thisWeek
  const previous = addDays(monday, -7)
  return { start: previous, end: addDays(previous, 4) }
}
