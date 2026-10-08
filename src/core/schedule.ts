import { MARKET_TZ, addDays, dayOfWeek, isoDateInZone, zonedStartOfDay } from "./dates"
import type { IsoDate } from "./domain/types"

export interface ClassSession {
  /** 0 = Sunday ... 6 = Saturday, in New York time. */
  day: number
  /** "18:00" in New York time. */
  start: string
  end: string
  title: string
  audience: string
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** The next time this weekly session runs (or the current one, if it has not ended yet). */
export function nextOccurrence(
  session: ClassSession,
  now: Date = new Date(),
): { date: IsoDate; start: Date; end: Date } {
  const today = isoDateInZone(now, MARKET_TZ)
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i)
    if (dayOfWeek(date) !== session.day) continue
    const midnight = zonedStartOfDay(date, MARKET_TZ).getTime()
    const start = new Date(midnight + minutesOf(session.start) * 60_000)
    const end = new Date(midnight + minutesOf(session.end) * 60_000)
    if (end.getTime() > now.getTime()) return { date, start, end }
  }
  const date = addDays(today, 7)
  const midnight = zonedStartOfDay(date, MARKET_TZ).getTime()
  return {
    date,
    start: new Date(midnight + minutesOf(session.start) * 60_000),
    end: new Date(midnight + minutesOf(session.end) * 60_000),
  }
}

/** "6:00 PM" in the given zone. */
export function formatTimeIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(instant)
}

/** "Sat, Oct 10" in the given zone. */
export function formatDayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }).format(
    instant,
  )
}

/** A short zone name such as "CDT" or "GMT+1". */
export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")
  return part?.value ?? timeZone
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

/** Regular US market hours (9:30 AM to 4:00 PM ET on weekdays). Exchange holidays are not included. */
export function isMarketOpen(now: Date = new Date()): boolean {
  const day = dayOfWeek(isoDateInZone(now, MARKET_TZ))
  if (day === 0 || day === 6) return false
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone: MARKET_TZ,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  const minutes = hour * 60 + minute
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60
}
