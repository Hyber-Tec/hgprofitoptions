import { addDays } from "./dates"
import type { DailyBar, IsoDate } from "./domain/types"
import { formatWeekdayDate } from "./format"

/**
 * Spikes: a sudden candle from big institutional orders, often on the open or the close, that marks the
 * edge of the range institutions plan to trade in. HG notes them rather than changing the strike
 * targets, and the stock often trades back to the spike price within a few sessions.
 */

export type SpikeAt = "open" | "close" | "time"

export interface SpikeRow {
  /** The line's number in the pasted text (1-based), for messages. */
  line: number
  symbol: string
  price: number
  date: IsoDate
  at: SpikeAt
  /** "16:20", New York, when `at` is "time" (or a time was given with the close). */
  time: string | null
  /** The session's close, when given. */
  close: number | null
  /** The heading the line sat under in HG's message ("Profit options"). */
  group: string | null
}

export interface SpikeIssue {
  line: number
  text: string
  message: string
}

const TICKER = /^[A-Z][A-Z.]{0,5}$/
const NUMBER = /^\$?\d{1,6}(?:,\d{3})*(?:\.\d+)?$/
const DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/
const TIME = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i

/** "10/22" (or "10/22/26") as a date in the year closest to `around`. */
function readDate(match: RegExpExecArray, around: IsoDate): IsoDate | null {
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const pad = (n: number) => String(n).padStart(2, "0")
  if (match[3]) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    return `${String(year)}-${pad(month)}-${pad(day)}` as IsoDate
  }
  const year = Number(around.slice(0, 4))
  const candidates = [year - 1, year, year + 1].map((y) => `${String(y)}-${pad(month)}-${pad(day)}` as IsoDate)
  const distance = (d: IsoDate) =>
    Math.abs(new Date(`${d}T12:00:00Z`).getTime() - new Date(`${around}T12:00:00Z`).getTime())
  return candidates.sort((a, b) => distance(a) - distance(b))[0] ?? null
}

/** "4:20pm" or "16:20" as "16:20". Without AM or PM, a time is read within the trading day: 4:20 is 4:20 PM. */
function readTime(match: RegExpExecArray): string | null {
  let hour = Number(match[1])
  const minute = Number(match[2])
  const half = match[3]?.toLowerCase()
  if (half === "pm" && hour < 12) hour += 12
  if (half === "am" && hour === 12) hour = 0
  if (!half && hour >= 1 && hour <= 7) hour += 12
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

const number = (token: string) => Number(token.replace(/[$,]/g, ""))

/** A line's words, with "421.50/412.35" and "421.50-412.35" read as two prices (but "10/22" as a date). */
function tokensOf(line: string): string[] {
  return (
    line
      .replace(/[;()]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^@/, "").replace(/[:,]$/, ""))
      // A comma inside a price ("1,030.10") stays; one between two prices ("421.50,412.35") splits them.
      .flatMap((t) => (t.includes(",") && !NUMBER.test(t) ? t.split(",") : [t]))
      .flatMap((t) => (DATE.test(t) || !/\d[/-]\$?\d/.test(t) ? [t] : t.split(/[/-]/)))
      .filter((t) => t !== "" && t !== "-" && t !== "/" && t !== "@")
  )
}

/** A line that only names a stock: "MRNA", "MRNA ?" or "MRNA (missing)". */
const MISSING = /^(\?+|n\/?a|tbd|missing|none|no spike)$/i

/**
 * Reads a pasted spike list, one stock per line, the way HG writes it: the ticker, the spike price and
 * (optionally) the close, with "open" or "close" and a date or time where they differ from the defaults.
 * A short line without a price is a heading for the lines under it, and a longer one (a greeting, a
 * note) is skipped. Lines that name a stock but cannot be read come back as issues; nothing is guessed.
 *
 *   TSM 421.50 412.35
 *   META 745 on the close 4:20 PM 10/21, close 648.85
 */
export function parseSpikeList(
  text: string,
  defaults: { date: IsoDate; at: Exclude<SpikeAt, "time"> },
): { rows: SpikeRow[]; issues: SpikeIssue[]; skipped: SpikeIssue[] } {
  const rows: SpikeRow[] = []
  const issues: SpikeIssue[] = []
  const skipped: SpikeIssue[] = []
  let group: string | null = null
  let groupDate: IsoDate | null = null
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const clean = raw
      .replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")
      .replace(/[–—]/g, "-")
      .trim()
    if (clean === "") return
    const tokens = tokensOf(clean)
    const symbolIndex = tokens.findIndex((t) => TICKER.test(t))
    if (!tokens.some((t) => NUMBER.test(t))) {
      const [first = "", ...rest] = tokens
      if (
        TICKER.test(first) &&
        rest
          .join(" ")
          .split(/\s+/)
          .every((t) => t === "" || MISSING.test(t))
      )
        issues.push({ line, text: raw.trim(), message: `${first} has no spike price. Add it, or remove the line.` })
      else if (clean.length <= 48) {
        // A heading such as "Profit options" or "Spikes 10/22": its date counts for the lines under it.
        group = clean.replace(/:$/, "")
        const dated = tokens.map((t) => DATE.exec(t)).find((m) => m !== null)
        groupDate = dated ? readDate(dated, defaults.date) : null
      } else skipped.push({ line, text: raw.trim(), message: "Not a spike line" })
      return
    }
    if (symbolIndex === -1) {
      issues.push({ line, text: raw.trim(), message: "No ticker on this line." })
      return
    }
    const symbol = tokens[symbolIndex] ?? ""
    let date = groupDate ?? defaults.date
    let time: string | null = null
    let said: Exclude<SpikeAt, "time"> | null = null
    let close: number | null = null
    // A "?" or "n/a" where the spike price goes holds its place: the number after it is the close.
    const prices: (number | null)[] = []
    for (let i = symbolIndex + 1; i < tokens.length; i++) {
      const token = tokens[i] ?? ""
      const lower = token.toLowerCase()
      const next = tokens[i + 1] ?? ""
      const dateMatch = DATE.exec(token)
      const timeMatch = TIME.exec(token)
      if (dateMatch) {
        date = readDate(dateMatch, defaults.date) ?? date
      } else if (timeMatch) {
        const half = /^(am|pm)$/i.test(next) ? TIME.exec(`${token}${next}`) : timeMatch
        time = half ? readTime(half) : null
        if (half !== timeMatch) i++
      } else if (/^(close|closed|closing)$/.test(lower) && NUMBER.test(next)) {
        close = number(next)
        i++
      } else if (/^(open|opening)$/.test(lower)) said = "open"
      else if (/^(close|closing)$/.test(lower)) said = "close"
      else if (NUMBER.test(token)) prices.push(number(token))
      else if (MISSING.test(token) && prices.length === 0) prices.push(null)
    }
    const [price, second] = prices
    if (price === undefined || price === null || !(price > 0)) {
      issues.push({ line, text: raw.trim(), message: `${symbol} has no spike price. Add it, or remove the line.` })
      return
    }
    if (close === null && second !== undefined && second !== null) close = second
    rows.push({ line, symbol, price, date, at: said ?? (time ? "time" : defaults.at), time, close, group })
  })
  return { rows, issues, skipped }
}

/** "16:20" as "4:20 PM". */
export function formatClock(hhmm: string): string {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number)
  const half = hour >= 12 ? "PM" : "AM"
  return `${String(hour % 12 === 0 ? 12 : hour % 12)}:${String(minute).padStart(2, "0")} ${half}`
}

/** "On the open", "On the close, 4:20 PM" or "At 10:42 AM". */
export function describeSpikeTime(spike: { at: SpikeAt; time: string | null }): string {
  if (spike.at === "open") return "On the open"
  if (spike.at === "close") return spike.time ? `On the close, ${formatClock(spike.time)}` : "On the close"
  return spike.time ? `At ${formatClock(spike.time)}` : "During the day"
}

/** A spike list's title when none is given: "Spikes from Thu, Oct 22". */
export const defaultSpikeTitle = (date: IsoDate) => `Spikes from ${formatWeekdayDate(date)}`

/** Above the close (a buy spike), or below it. */
export const spikeDirection = (price: number, close: number | null): "up" | "down" =>
  close !== null && price < close ? "down" : "up"

/**
 * When the stock first traded back to the spike price after the spike's session, and how many sessions
 * that took: a high at or above an upward spike, a low at or below a downward one. Null while it has not.
 */
export function spikeRecovery(
  bars: readonly DailyBar[],
  spike: { date: IsoDate; price: number; direction: "up" | "down" },
): { date: IsoDate; sessions: number } | null {
  const after = bars.filter((b) => b.date > spike.date)
  const index = after.findIndex((b) => (spike.direction === "up" ? b.high >= spike.price : b.low <= spike.price))
  const bar = after[index]
  return bar ? { date: bar.date, sessions: index + 1 } : null
}

/** How far the spike sits from the close, as a fraction of the close: the trade left to it. */
export const spikeGap = (price: number, close: number | null): number | null =>
  close === null || close === 0 ? null : (price - close) / close

/** The default session for a new spike list: the one before `today` (HG posts them the next morning). */
export const defaultSpikeDate = (today: IsoDate, isTradingDay: (d: IsoDate) => boolean): IsoDate => {
  let day = addDays(today, -1)
  while (!isTradingDay(day)) day = addDays(day, -1)
  return day
}
