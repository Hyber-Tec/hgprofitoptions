import type { IsoDate, StrikeTarget } from "../domain/types"
import { dayOfWeek, daysBetween, isIsoDate } from "../dates"

export type ParseIssueCode =
  | "unparseable"
  | "stray-token"
  | "comma-decimal"
  | "missing-space"
  | "missing-dash"
  | "missing-or"
  | "missing-of"
  | "number-format"
  | "has-note"
  | "put-equals-break"
  | "all-equal"
  | "target-not-above-break"
  | "expiry-not-friday"
  | "expiry-too-far"
  | "unknown-ticker"
  | "duplicate-ticker"
  | "entry-before-group"
  | "new-group"

export interface ParseIssue {
  /** 1-based line in the pasted text. */
  line: number
  raw: string
  severity: "warning" | "error"
  code: ParseIssueCode
  message: string
  /** For errors with an unambiguous fix, the entry the editor proposes. */
  suggestion?: StrikeTarget
  /** The ticker of the line, when the line was read far enough to know it. */
  symbol?: string
}

export interface TargetGroupDef {
  slug: string
  name: string
  aliases?: readonly string[]
}

export interface ParsedGroup {
  slug: string
  name: string
  entries: StrikeTarget[]
}

export interface ParsedUpdate {
  title: string | null
  groups: ParsedGroup[]
  issues: ParseIssue[]
}

export interface ParseOptions {
  effectiveDate: IsoDate
  groups: readonly TargetGroupDef[]
  /** When provided, tickers outside the universe get an "unknown-ticker" warning. */
  knownTickers?: ReadonlySet<string>
  /** Expiries further out than this many days get a warning. */
  maxExpiryDays?: number
}

const ZERO_WIDTH = /[​-‍﻿ ]/g
const LIST_NUMBER = /^\s*\d+\.\s*/
const NUM = String.raw`\d*\.?\d+`
const ENTRY = new RegExp(
  String.raw`^(?<sym>[A-Z][A-Z.]{0,5})\s*(?<dash>-)?\s*(?<target>${NUM})\s+(?<or>or\s+)?break(?<of>\s+of)?\s+(?<brk>${NUM})\s+PUT\s+(?<put>${NUM})(?:\s+(?<note>[a-z][\w ]*?))?\s+(?<exp>\d{1,2}/\d{1,2})(?:\s+w(?<w>${NUM}))?\s*$`,
  "i",
)
/** Same shape, but with extra numeric tokens between the put strike and the expiry (for example "PUT 1 195"). */
const ENTRY_WITH_STRAY = new RegExp(
  String.raw`^(?<sym>[A-Z][A-Z.]{0,5})\s*-?\s*(?<target>${NUM})\s+(?:or\s+)?break(?:\s+of)?\s+(?<brk>${NUM})\s+PUT\s+(?<tokens>(?:${NUM}\s+)+)(?<exp>\d{1,2}/\d{1,2})(?:\s+w(?<w>${NUM}))?\s*$`,
  "i",
)
const TITLE = /^strike\s+price\s+targets/i
const STARTS_LIKE_ENTRY = /^[A-Z][A-Z.]{0,5}\s*-\s*[\d.]/
const HAS_ENTRY_WORDS = /\bbreak\b.*\bput\b/i
/** A ticker line, even a broken one: "TSM- 472..." or anything with "break" and "PUT" (headings never have both). */
const looksLikeEntry = (line: string) => STARTS_LIKE_ENTRY.test(line) || HAS_ENTRY_WORDS.test(line)

/** The update's title line ("STRIKE PRICE TARGETS UPDATE OCT 7"), when the text has one. */
export function readTitle(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(ZERO_WIDTH, " ").replace(/\s+/g, " ").trim()
    if (TITLE.test(line)) return line
  }
  return null
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** First date on or after the effective date with that month and day. */
export function resolveExpiry(monthDay: string, effectiveDate: IsoDate): IsoDate | null {
  const [m, d] = monthDay.split("/").map(Number)
  if (
    m === undefined ||
    d === undefined ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  )
    return null
  const year = Number(effectiveDate.slice(0, 4))
  for (const y of [year, year + 1]) {
    const candidate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` as IsoDate
    const check = new Date(`${candidate}T00:00:00Z`)
    if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== candidate) return null
    if (candidate >= effectiveDate) return candidate
  }
  return null
}

/** HG writes the brand on some headings only: "Profit Options Small Channel" and "Small Channel" are one category. */
const BRAND = /^profit options? /

/** A name as it can be matched: normalized, and without the brand when it has one. */
function nameKeys(name: string): string[] {
  const normalized = normalizeName(name)
  const unbranded = normalized.replace(BRAND, "")
  return unbranded === normalized ? [normalized] : [normalized, unbranded]
}

/** The category a heading names, also when it carries extra words after the name ("Watch Box PRICES ARE..."). */
function matchGroup(text: string, groups: readonly TargetGroupDef[]): TargetGroupDef | null {
  const headings = nameKeys(text)
  let best: { group: TargetGroupDef; length: number } | null = null
  for (const group of groups) {
    for (const key of [group.name, ...(group.aliases ?? [])].flatMap(nameKeys)) {
      const matches = headings.some((heading) => heading === key || heading.startsWith(`${key} `))
      if (key.length > 0 && matches && (!best || key.length > best.length)) best = { group, length: key.length }
    }
  }
  return best?.group ?? null
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/**
 * The date in a title such as "STRIKE PRICE TARGETS UPDATE OCT 7" (or "10/7"), in the year that puts it
 * closest to `today`, since titles carry no year.
 */
export function titleDate(title: string, today: IsoDate): IsoDate | null {
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(
    title,
  )
  const numeric = /\b(\d{1,2})\/(\d{1,2})\b/.exec(title)
  const month = named?.[1] ? MONTHS.indexOf(named[1].toLowerCase()) + 1 : Number(numeric?.[1])
  const day = Number(named?.[2] ?? numeric?.[2])
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return null
  const year = Number(today.slice(0, 4))
  const pad = (n: number) => String(n).padStart(2, "0")
  const candidates = [year - 1, year, year + 1]
    .map((y) => `${y}-${pad(month)}-${pad(day)}`)
    .filter((d): d is IsoDate => isIsoDate(d))
  candidates.sort((a, b) => Math.abs(daysBetween(today, a)) - Math.abs(daysBetween(today, b)))
  return candidates[0] ?? null
}

interface Normalized {
  text: string
  issues: Omit<ParseIssue, "line" | "raw">[]
}

function normalizeLine(raw: string): Normalized {
  const issues: Omit<ParseIssue, "line" | "raw">[] = []
  let text = raw.replace(ZERO_WIDTH, " ").replace(LIST_NUMBER, "").replace(/\s+/g, " ").trim()

  // "127,50" is a decimal comma; "1,725" is a thousands separator.
  if (/\d,\d{1,2}(?!\d)/.test(text)) {
    text = text.replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")
    issues.push({
      severity: "warning",
      code: "comma-decimal",
      message: "A comma was used as the decimal point and was read as a period.",
    })
  }
  text = text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2")

  // "6.5010/23": a two-decimal price glued to the expiry date.
  if (/\d\.\d{2}\d{1,2}\/\d{1,2}\b/.test(text)) {
    text = text.replace(/(\d\.\d{2})(\d{1,2}\/\d{1,2})\b/g, "$1 $2")
    issues.push({
      severity: "warning",
      code: "missing-space",
      message: "The put strike and expiry were stuck together and have been split.",
    })
  }
  return { text, issues }
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Parses HG's weekly "Strike Price Targets" text (pasted from the Google Doc) into groups of entries.
 * Every line that is not clean is reported, so the editor can highlight it before publishing.
 */
export function parseStrikeTargets(text: string, options: ParseOptions): ParsedUpdate {
  const { effectiveDate, knownTickers, maxExpiryDays = 120 } = options
  const knownGroups = [...options.groups]
  const groups: ParsedGroup[] = []
  const issues: ParseIssue[] = []
  const seen = new Map<string, number>()
  /** Positions follow the document order, including lines that only produced a suggestion. */
  const counters = new Map<string, number>()
  const nextPosition = (slug: string): number => {
    const n = (counters.get(slug) ?? 0) + 1
    counters.set(slug, n)
    return n
  }
  let title: string | null = null
  let current: ParsedGroup | null = null

  const lines = text.split(/\r?\n/)
  for (const [index, raw] of lines.entries()) {
    const line = index + 1
    const { text: normalized, issues: lineIssues } = normalizeLine(raw)
    if (normalized.length === 0) continue

    if (TITLE.test(normalized)) {
      title = normalized
      continue
    }

    const isEntry = looksLikeEntry(normalized)
    if (!isEntry) {
      const known = matchGroup(normalized, knownGroups)
      let def: TargetGroupDef
      if (known) {
        def = known
      } else {
        def = { slug: slugify(normalized), name: normalized }
        knownGroups.push(def)
        issues.push({
          line,
          raw,
          severity: "warning",
          code: "new-group",
          message: `"${normalized}" is not a known category and was added as a new one.`,
        })
      }
      const existing = groups.find((g) => g.slug === def.slug)
      current = existing ?? { slug: def.slug, name: def.name, entries: [] }
      if (!existing) groups.push(current)
      continue
    }

    let lineSymbol: string | undefined
    const report = (
      severity: ParseIssue["severity"],
      code: ParseIssueCode,
      message: string,
      suggestion?: StrikeTarget,
    ) => {
      issues.push({
        line,
        raw,
        severity,
        code,
        message,
        ...(suggestion ? { suggestion } : {}),
        ...(lineSymbol ? { symbol: lineSymbol } : {}),
      })
    }
    for (const issue of lineIssues) report(issue.severity, issue.code, issue.message)

    if (current === null) {
      report("error", "entry-before-group", "This entry appears before any category heading.")
      continue
    }
    const group: ParsedGroup = current

    const match = ENTRY.exec(normalized)
    if (!match?.groups) {
      const stray = ENTRY_WITH_STRAY.exec(normalized)
      const tokens = stray?.groups?.tokens?.trim().split(/\s+/) ?? []
      const lastToken = tokens.at(-1)
      const symbol = stray?.groups?.sym?.toUpperCase()
      const target = toNumber(stray?.groups?.target)
      const breakLevel = toNumber(stray?.groups?.brk)
      const putStrike = toNumber(lastToken)
      const expiry = stray?.groups?.exp ? resolveExpiry(stray.groups.exp, effectiveDate) : null
      if (stray && symbol && target !== null && breakLevel !== null && putStrike !== null && expiry) {
        lineSymbol = symbol
        report(
          "error",
          "stray-token",
          `Extra number(s) after PUT: "${tokens.slice(0, -1).join(" ")}". Suggested put strike: ${putStrike}.`,
          {
            group: group.slug,
            position: nextPosition(group.slug),
            symbol,
            target,
            breakLevel,
            putStrike,
            expiry,
            dowWeight: toNumber(stray.groups?.w),
            note: null,
          },
        )
      } else {
        report(
          "error",
          "unparseable",
          "This line does not match the expected format: TICKER- target or break of level PUT strike M/DD.",
        )
      }
      continue
    }

    const g = match.groups
    const symbol = g.sym?.toUpperCase() ?? ""
    lineSymbol = symbol
    const target = toNumber(g.target)
    const breakLevel = toNumber(g.brk)
    const putStrike = toNumber(g.put)
    const expiry = g.exp ? resolveExpiry(g.exp, effectiveDate) : null
    if (target === null || breakLevel === null || putStrike === null || expiry === null) {
      report("error", "unparseable", "A price or the expiry date could not be read.")
      continue
    }

    if (!g.dash) report("warning", "missing-dash", "The dash after the ticker is missing.")
    if (!g.or) report("warning", "missing-or", 'The word "or" is missing before "break".')
    if (!g.of) report("warning", "missing-of", 'The word "of" is missing after "break".')
    const numbers = [g.target, g.brk, g.put, g.w].filter((v): v is string => v !== undefined)
    if (numbers.some((n) => n.startsWith(".")))
      report("warning", "number-format", "A number starts with a decimal point (for example .50).")
    const note = g.note?.trim() ?? null
    if (note) report("warning", "has-note", `Extra note text: "${note}".`)

    if (target === breakLevel && breakLevel === putStrike) {
      report("warning", "all-equal", "Target, break level and put strike are all the same.")
    } else {
      if (putStrike === breakLevel) report("warning", "put-equals-break", "The put strike equals the break level.")
      if (target <= breakLevel) report("warning", "target-not-above-break", "The target is not above the break level.")
    }
    if (dayOfWeek(expiry) !== 5) report("warning", "expiry-not-friday", `The expiry ${expiry} is not a Friday.`)
    if (daysBetween(effectiveDate, expiry) > maxExpiryDays)
      report("warning", "expiry-too-far", `The expiry ${expiry} is more than ${maxExpiryDays} days out.`)
    // No "did you mean": a new ticker one letter from a known one (BE and GE) is usually just new.
    if (knownTickers && !knownTickers.has(symbol))
      report("warning", "unknown-ticker", `${symbol} is not in the ticker list yet.`)
    const previous = seen.get(symbol)
    if (previous !== undefined) report("warning", "duplicate-ticker", `${symbol} already appears on line ${previous}.`)
    seen.set(symbol, line)

    group.entries.push({
      group: group.slug,
      position: nextPosition(group.slug),
      symbol,
      target,
      breakLevel,
      putStrike,
      expiry,
      dowWeight: toNumber(g.w),
      note,
    })
  }

  return { title, groups, issues }
}

/** A price the way HG writes it: 465, 472.50, 3.375. */
export function formatTargetNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const cents = value.toFixed(2)
  return Number(cents) === value ? cents : String(Number(value.toFixed(4)))
}

/** One entry as a line of HG's doc: "TSM- 472.50 or break of 465 PUT 457.50 10/23 w2.72". */
export function formatTargetLine(
  entry: Pick<StrikeTarget, "symbol" | "target" | "breakLevel" | "putStrike" | "expiry" | "dowWeight" | "note">,
): string {
  const n = formatTargetNumber
  const expiry = `${Number(entry.expiry.slice(5, 7))}/${Number(entry.expiry.slice(8, 10))}`
  const note = entry.note ? ` ${entry.note}` : ""
  const weight = entry.dowWeight === null ? "" : ` w${n(entry.dowWeight)}`
  return `${entry.symbol}- ${n(entry.target)} or break of ${n(entry.breakLevel)} PUT ${n(entry.putStrike)}${note} ${expiry}${weight}`
}

/** A whole update written the way HG's doc is, to correct it or to start the next one from it. */
export function targetsToText(
  effectiveDate: IsoDate,
  groups: readonly { name: string; entries: readonly StrikeTarget[] }[],
): string {
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${effectiveDate}T12:00:00Z`),
  )
  const lines = [`STRIKE PRICE TARGETS UPDATE ${label.toUpperCase()}`]
  for (const group of groups) {
    if (group.entries.length === 0) continue
    lines.push("", group.name, ...group.entries.map((e, i) => `${i + 1}. ${formatTargetLine(e)}`))
  }
  return lines.join("\n")
}

/** Applies every error suggestion (used by the one-time import; the editor asks the admin instead). */
export function applySuggestions(parsed: ParsedUpdate): ParsedUpdate {
  const groups = parsed.groups.map((g) => ({ ...g, entries: [...g.entries] }))
  for (const issue of parsed.issues) {
    const suggestion = issue.suggestion
    if (!suggestion) continue
    const group = groups.find((g) => g.slug === suggestion.group)
    if (!group) continue
    group.entries.push(suggestion)
  }
  for (const g of groups) {
    g.entries.sort((a, b) => a.position - b.position)
    g.entries.forEach((e, i) => (e.position = i + 1))
  }
  return {
    ...parsed,
    groups,
    issues: parsed.issues.filter((i) => i.severity !== "error" || i.suggestion === undefined),
  }
}

/** Old vs new targets for the "changes since last update" view. */
export interface TargetDiff {
  added: StrikeTarget[]
  removed: StrikeTarget[]
  changed: {
    before: StrikeTarget
    after: StrikeTarget
    fields: ("target" | "breakLevel" | "putStrike" | "expiry" | "group")[]
  }[]
}

export function diffTargets(before: readonly StrikeTarget[], after: readonly StrikeTarget[]): TargetDiff {
  const prev = new Map(before.map((t) => [t.symbol, t]))
  const next = new Map(after.map((t) => [t.symbol, t]))
  const added = after.filter((t) => !prev.has(t.symbol))
  const removed = before.filter((t) => !next.has(t.symbol))
  const changed: TargetDiff["changed"] = []
  for (const t of after) {
    const old = prev.get(t.symbol)
    if (!old) continue
    const fields = (["target", "breakLevel", "putStrike", "expiry", "group"] as const).filter((f) => old[f] !== t[f])
    if (fields.length > 0) changed.push({ before: old, after: t, fields: [...fields] })
  }
  return { added, removed, changed }
}

/** Live status of a target versus the last close. Labels are shown to members. */
export type TargetStatus = "above-target" | "between" | "below-break"

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  "above-target": "Above target",
  between: "Between",
  "below-break": "Below break",
}

export function targetStatus(lastClose: number, entry: Pick<StrikeTarget, "target" | "breakLevel">): TargetStatus {
  if (lastClose >= entry.target) return "above-target"
  if (lastClose <= entry.breakLevel) return "below-break"
  return "between"
}
