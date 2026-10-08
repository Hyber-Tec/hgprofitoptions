import type { IsoDate } from "../domain/types"
import { addDays, isIsoDate } from "../dates"
import { isQuarter, periodFromQuarters, quarterLabel, type PeriodDraft } from "../membership/quarters"
import { parseCsv } from "./trades-csv"

/** Columns of the member import (moving members over from the old site). */
export const MEMBER_CSV_COLUMNS = [
  "name",
  "email",
  "phone",
  "whatsapp",
  "location",
  "timezone",
  "start_quarter",
  "start_year",
  "quarters",
  "custom_start",
  "notes",
] as const

export const MEMBER_CSV_TEMPLATE = `${MEMBER_CSV_COLUMNS.join(",")}\nJane Doe,jane@example.com,+1 555 0100,,Austin TX,America/Chicago,4,2026,1,,Referred by Ava`

export interface MemberCsvRow {
  line: number
  email: string
  fullName: string
  phone: string | null
  whatsapp: string | null
  location: string | null
  timezone: string
  notes: string | null
  period: PeriodDraft | null
  /** Why the row cannot be imported; null when it can. */
  error: string | null
}

const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")

/** Other spellings seen in exports. */
const HEADER_ALIASES: Record<string, string> = {
  e_mail: "email",
  email_address: "email",
  full_name: "name",
  member_name: "name",
  phone_number: "phone",
  whatsapp_number: "whatsapp",
  time_zone: "timezone",
  quarter: "start_quarter",
  year: "start_year",
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

function periodFor(cell: (name: string) => string, today: IsoDate): PeriodDraft | string {
  const quarter = Number(cell("start_quarter").replace(/^q/i, ""))
  if (!isQuarter(quarter)) return "start_quarter must be 1 to 4."
  const year = Number(cell("start_year"))
  if (!Number.isInteger(year) || year < 2015 || year > 2100) return "start_year must be a year like 2026."
  const count = cell("quarters") === "" ? 1 : Number(cell("quarters"))
  if (!Number.isInteger(count) || count < 1 || count > 8) return "quarters must be 1 to 8."
  const customStart = cell("custom_start")
  if (customStart !== "" && !isIsoDate(customStart)) return `custom_start must be a date like ${year}-10-15.`
  let period: PeriodDraft
  try {
    period = periodFromQuarters(year, quarter, count, customStart === "" ? undefined : customStart)
  } catch {
    return `custom_start must fall inside ${quarterLabel(year, quarter)}.`
  }
  if (period.end < addDays(today, -365)) return "This membership ended more than a year ago."
  return period
}

/**
 * Reads the member import CSV. Header names are matched loosely ("Start Quarter" works);
 * blank lines are skipped and a repeated email is reported on its second line.
 */
export function parseMembersCsv(csv: string, today: IsoDate): { rows: MemberCsvRow[] } | { error: string } {
  const table = parseCsv(csv.replace(/^﻿/, ""))
  const header = table[0]?.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? normalizeHeader(h)) ?? []
  const col = (name: string) => header.indexOf(name)
  if (col("email") < 0 || col("name") < 0)
    return { error: "The first row must name the columns, including name and email." }
  const seen = new Map<string, number>()
  const rows: MemberCsvRow[] = []
  for (const [i, cells] of table.slice(1).entries()) {
    if (cells.every((c) => c.trim() === "")) continue
    const cell = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "")
    const line = i + 2
    const email = cell("email").toLowerCase()
    const fullName = cell("name").replace(/\s+/g, " ")
    const timezone = cell("timezone") || "America/New_York"
    const base = {
      line,
      email,
      fullName,
      phone: cell("phone") || null,
      whatsapp: cell("whatsapp") || null,
      location: cell("location") || null,
      timezone,
      notes: cell("notes") || null,
    }
    const fail = (error: string) => rows.push({ ...base, period: null, error })
    if (fullName.length < 2) {
      fail("Missing the member's name.")
      continue
    }
    if (!EMAIL.test(email)) {
      fail(email ? `"${email}" is not a valid email.` : "Missing the email.")
      continue
    }
    const firstLine = seen.get(email)
    if (firstLine !== undefined) {
      fail(`Listed twice in this file (line ${firstLine}).`)
      continue
    }
    seen.set(email, line)
    if (!isTimeZone(timezone)) {
      fail(`Unknown time zone "${timezone}". Use a name like America/Chicago.`)
      continue
    }
    const period = periodFor(cell, today)
    if (typeof period === "string") {
      fail(period)
      continue
    }
    rows.push({ ...base, period, error: null })
  }
  return { rows }
}
