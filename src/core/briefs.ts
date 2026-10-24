import { todayInMarketZone, zonedDateTime } from "./dates"
import type { IsoDate } from "./domain/types"
import { isTradingDay } from "./holidays"

/**
 * The market brief: HG's pre-market view and the updates through the first hour of trading, posted by
 * hand or (once it is switched on) written by AI at set times on market days.
 */

/** How long after one of the brief's times the AI may still write it (a late or retried run). */
const BRIEF_WINDOW_MS = 15 * 60_000

/** The brief time due at `now` on a market day: the latest time that passed less than 15 minutes ago. */
export function dueBriefTime(times: readonly string[], now: Date): { date: IsoDate; time: string } | null {
  const date = todayInMarketZone(now)
  if (!isTradingDay(date)) return null
  const due = times
    .filter((time) => {
      const at = zonedDateTime(date, time).getTime()
      return at <= now.getTime() && now.getTime() - at < BRIEF_WINDOW_MS
    })
    .sort()
    .at(-1)
  return due ? { date, time: due } : null
}

export interface BriefPart {
  kind: "paragraph" | "list"
  lines: string[]
}

const BULLET = /^(?:[-•*]|\d+[.)])\s+/

/**
 * A brief's paragraphs and lists, in order. Blank lines split them; lines starting with "- ", "• " or
 * "1." are list items, and a paragraph may lead straight into its list.
 */
export function briefParts(body: string): BriefPart[] {
  const parts: BriefPart[] = []
  for (const block of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    // Parts never run on across a blank line.
    const blockStart = parts.length
    for (const raw of block.split("\n")) {
      const line = raw.trim()
      if (line === "") continue
      const kind = BULLET.test(line) ? "list" : "paragraph"
      const text = kind === "list" ? line.replace(BULLET, "") : line
      const last = parts.length > blockStart ? parts.at(-1) : undefined
      if (last?.kind === kind) last.lines.push(text)
      else parts.push({ kind, lines: [text] })
    }
  }
  return parts
}
