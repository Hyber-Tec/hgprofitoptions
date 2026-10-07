import type { AccountStatus, IsoDate, MembershipPeriod, MembershipStatus, Quarter, Role } from "../domain/types"
import { addDays, daysBetween, isIsoDate } from "../dates"

const QUARTER_BOUNDS: Record<Quarter, { start: string; end: string }> = {
  1: { start: "01-01", end: "03-31" },
  2: { start: "04-01", end: "06-30" },
  3: { start: "07-01", end: "09-30" },
  4: { start: "10-01", end: "12-31" },
}

export const QUARTERS: readonly Quarter[] = [1, 2, 3, 4]

export function isQuarter(value: number): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4
}

export function quarterRange(year: number, q: Quarter): { start: IsoDate; end: IsoDate } {
  const bounds = QUARTER_BOUNDS[q]
  return { start: `${year}-${bounds.start}` as IsoDate, end: `${year}-${bounds.end}` as IsoDate }
}

export function quarterOf(date: IsoDate): { year: number; q: Quarter } {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const q = Math.floor((month - 1) / 3) + 1
  if (!isQuarter(q)) throw new RangeError(`Invalid month in ${date}`)
  return { year, q }
}

export function addQuarters(year: number, q: Quarter, n: number): { year: number; q: Quarter } {
  const index = year * 4 + (q - 1) + n
  const next = (((index % 4) + 4) % 4) + 1
  if (!isQuarter(next)) throw new RangeError("Quarter arithmetic failed")
  return { year: Math.floor(index / 4), q: next }
}

export const quarterLabel = (year: number, q: Quarter): string => `Q${q} ${year}`

export interface PeriodDraft {
  start: IsoDate
  end: IsoDate
  kind: "quarterly" | "custom"
  label: string
}

/**
 * A subscription period of `count` whole quarters starting at (year, q).
 * `customStart` is a mid-quarter join date; it must fall inside the first quarter.
 */
export function periodFromQuarters(year: number, q: Quarter, count: number, customStart?: IsoDate): PeriodDraft {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count must be a whole number of quarters")
  const first = quarterRange(year, q)
  if (customStart !== undefined) {
    if (!isIsoDate(customStart)) throw new RangeError(`Invalid custom start: ${String(customStart)}`)
    if (customStart < first.start || customStart > first.end) {
      throw new RangeError(`Custom start ${customStart} is outside ${quarterLabel(year, q)}`)
    }
  }
  const last = addQuarters(year, q, count - 1)
  return {
    start: customStart ?? first.start,
    end: quarterRange(last.year, last.q).end,
    label: count === 1 ? quarterLabel(year, q) : `${quarterLabel(year, q)} to ${quarterLabel(last.year, last.q)}`,
    kind: customStart !== undefined && customStart !== first.start ? "custom" : "quarterly",
  }
}

/** The next whole quarter after the member's latest period ends. Used by "Renew next quarter". */
export function nextRenewalQuarter(
  periods: readonly Pick<MembershipPeriod, "end">[],
  today: IsoDate,
): { year: number; q: Quarter } {
  const latestEnd = periods.reduce<IsoDate | null>((max, p) => (max === null || p.end > max ? p.end : max), null)
  if (latestEnd === null || latestEnd < today) return quarterOf(today)
  return quarterOf(addDays(latestEnd, 1))
}

export function periodsOverlap(
  a: Pick<MembershipPeriod, "start" | "end">,
  b: Pick<MembershipPeriod, "start" | "end">,
): boolean {
  return a.start <= b.end && b.start <= a.end
}

export function findOverlap<T extends Pick<MembershipPeriod, "start" | "end">>(
  candidate: Pick<MembershipPeriod, "start" | "end">,
  existing: readonly T[],
): T | null {
  return existing.find((p) => periodsOverlap(candidate, p)) ?? null
}

function sortByStart<T extends Pick<MembershipPeriod, "start">>(periods: readonly T[]): T[] {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start))
}

/** Follows back-to-back renewals, so Q4 2026 + Q1 2027 counts down to Mar 31, 2027. */
function contiguousEnd(
  sorted: readonly Pick<MembershipPeriod, "start" | "end">[],
  from: Pick<MembershipPeriod, "end">,
): IsoDate {
  let end = from.end
  for (const p of sorted) if (p.start <= addDays(end, 1) && p.end > end) end = p.end
  return end
}

export function membershipStatus(args: {
  role: Role
  status: AccountStatus
  periods: readonly MembershipPeriod[]
  today: IsoDate
  expiringSoonDays?: number
}): MembershipStatus {
  const { role, status, today, expiringSoonDays = 14 } = args
  if (role === "admin") return { kind: "admin" }
  if (status === "suspended") return { kind: "suspended" }

  const sorted = sortByStart(args.periods)
  const current = sorted.find((p) => p.start <= today && today <= p.end)
  if (current) {
    const coverageEnd = contiguousEnd(sorted, current)
    const daysLeft = daysBetween(today, coverageEnd)
    return { kind: "active", period: current, coverageEnd, daysLeft, expiringSoon: daysLeft <= expiringSoonDays }
  }
  const next = sorted.find((p) => p.start > today)
  if (next) return { kind: "upcoming", next }
  const last = sorted.at(-1)
  return last ? { kind: "expired", last } : { kind: "none" }
}

export function hasAccess(status: MembershipStatus): boolean {
  return status.kind === "admin" || status.kind === "active"
}

/**
 * The contiguous block of periods that contains `today`, or else the next upcoming block.
 * `untilExclusive` is the day after the block ends. Stored on the member document so
 * Firestore security rules can compare it with request.time.
 */
export function accessWindow(
  periods: readonly Pick<MembershipPeriod, "start" | "end">[],
  today: IsoDate,
): { from: IsoDate; untilExclusive: IsoDate } | null {
  const sorted = sortByStart(periods)
  const anchor = sorted.find((p) => p.end >= today)
  if (!anchor) return null
  let start = anchor.start
  for (const p of [...sorted].reverse()) if (p.end >= addDays(start, -1) && p.start < start) start = p.start
  return { from: start, untilExclusive: addDays(contiguousEnd(sorted, anchor), 1) }
}

/** "Q4 2026 · Oct 1 to Dec 31, 2026" style range text. */
export function describePeriodRange(start: IsoDate, end: IsoDate): string {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  const fmtYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  const s = new Date(`${start}T00:00:00Z`)
  const e = new Date(`${end}T00:00:00Z`)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${sameYear ? fmt.format(s) : fmtYear.format(s)} to ${fmtYear.format(e)}`
}
