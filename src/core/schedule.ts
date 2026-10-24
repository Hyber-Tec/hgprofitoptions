import { MARKET_TZ, addDays, dayOfWeek, isoDateInZone, zonedDateTime } from "./dates"
import type { IsoDate } from "./domain/types"
import { isMarketHoliday, isTradingDay } from "./holidays"

/** Who a class is for. Its reminders go to these members; anyone may still join. */
export const CLASS_AUDIENCES = ["everyone", "beginners"] as const
export type ClassAudience = (typeof CLASS_AUDIENCES)[number]

export const AUDIENCE_LABELS: Record<ClassAudience, string> = {
  everyone: "All traders",
  beginners: "Beginners",
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export interface ClassSession {
  /** 0 = Sunday ... 6 = Saturday, in New York time. */
  day: number
  /** "19:00" in New York time. */
  start: string
  end: string
  title: string
  audience: ClassAudience
  /** One line under the title, such as "Sets the tone for the trading week". */
  note: string
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** A session during market hours is not held when the market is closed for a holiday. */
function heldOn(session: ClassSession, date: IsoDate): boolean {
  return !(isMarketHoliday(date) && minutesOf(session.start) < 16 * 60)
}

/** The next time this weekly session runs (or the current one, if it has not ended yet). */
export function nextOccurrence(
  session: ClassSession,
  now: Date = new Date(),
): { date: IsoDate; start: Date; end: Date } {
  const today = isoDateInZone(now, MARKET_TZ)
  for (let i = 0; i < 22; i++) {
    const date = addDays(today, i)
    if (dayOfWeek(date) !== session.day || !heldOn(session, date)) continue
    const start = zonedDateTime(date, session.start)
    const end = zonedDateTime(date, session.end)
    if (end.getTime() > now.getTime()) return { date, start, end }
  }
  throw new RangeError(`No upcoming class on day ${String(session.day)}`)
}

/** Every session with its next occurrence, soonest first. */
export function upcomingSessions<S extends ClassSession>(
  schedule: readonly S[],
  now: Date = new Date(),
): (S & { next: { date: IsoDate; start: Date; end: Date } })[] {
  return schedule
    .map((s) => ({ ...s, next: nextOccurrence(s, now) }))
    .sort((a, b) => a.next.start.getTime() - b.next.start.getTime())
}

/** The weekly class for everyone, which the site's copy describes ("every Sunday evening"). */
export function mainClass<S extends ClassSession>(schedule: readonly S[]): S | null {
  return schedule.find((s) => s.audience === "everyone") ?? null
}

/** "morning", "afternoon" or "evening", for a start time. */
export function partOfDay(hhmm: string): "morning" | "afternoon" | "evening" {
  const minutes = minutesOf(hhmm)
  return minutes < 12 * 60 ? "morning" : minutes < 17 * 60 ? "afternoon" : "evening"
}

/** "Tuesday and Thursday", or "Monday, Wednesday and Friday". */
export function weekdayList(days: readonly number[]): string {
  const names = [...new Set(days)].sort((a, b) => a - b).map((d) => WEEKDAYS[d] ?? "")
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`
}

/**
 * The week's classes in a phrase for page copy, such as "a group class every Sunday evening and beginner
 * sessions on Tuesday and Thursday"; null without a schedule.
 */
export function describeWeek(schedule: readonly ClassSession[]): string | null {
  const main = mainClass(schedule)
  const beginnerDays = schedule.filter((s) => s.audience === "beginners").map((s) => s.day)
  const parts = [
    main ? `a group class every ${WEEKDAYS[main.day] ?? ""} ${partOfDay(main.start)}` : null,
    beginnerDays.length > 0 ? `beginner sessions on ${weekdayList(beginnerDays)}` : null,
  ].filter((p) => p !== null)
  return parts.length > 0 ? parts.join(" and ") : null
}

/** Whether the session runs on `date`: its weekday, unless the market is closed for a session in market hours. */
export function isSessionDay(session: ClassSession, date: IsoDate): boolean {
  return dayOfWeek(date) === session.day && heldOn(session, date)
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

/** What a class on `date` is called in its recap: that day's session, else "Sunday class". */
export function classTitle(date: IsoDate, schedule: readonly ClassSession[] = []): string {
  const day = dayOfWeek(date)
  return schedule.find((s) => s.day === day)?.title ?? `${WEEKDAYS[day] ?? "Weekly"} class`
}

/** Regular US market hours: 9:30 AM to 4:00 PM ET on trading days (early closes are not known). */
export function isMarketOpen(now: Date = new Date()): boolean {
  if (!isTradingDay(isoDateInZone(now, MARKET_TZ))) return false
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
