import type { IsoDate, StrikeTarget } from "../domain/types"
import { dayOfWeek, daysBetween } from "../dates"

export type ParseIssueCode =
  | "unparseable"
  | "stray-token"
  | "comma-decimal"
  | "missing-space"
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
  String.raw`^(?<sym>[A-Z][A-Z.]{0,5})\s*-\s*(?<target>${NUM})\s+(?<or>or\s+)?break(?<of>\s+of)?\s+(?<brk>${NUM})\s+PUT\s+(?<put>${NUM})(?:\s+(?<note>[a-z][\w ]*?))?\s+(?<exp>\d{1,2}/\d{1,2})(?:\s+w(?<w>${NUM}))?\s*$`,
  "i",
)
/** Same shape, but with extra numeric tokens between the put strike and the expiry (for example "PUT 1 195"). */
const ENTRY_WITH_STRAY = new RegExp(
  String.raw`^(?<sym>[A-Z][A-Z.]{0,5})\s*-\s*(?<target>${NUM})\s+(?:or\s+)?break(?:\s+of)?\s+(?<brk>${NUM})\s+PUT\s+(?<tokens>(?:${NUM}\s+)+)(?<exp>\d{1,2}/\d{1,2})(?:\s+w(?<w>${NUM}))?\s*$`,
  "i",
)
const TITLE = /^strike\s+price\s+targets/i
const LOOKS_LIKE_ENTRY = /^[A-Z][A-Z.]{0,5}\s*-\s*[\d.]/

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

function matchGroup(text: string, groups: readonly TargetGroupDef[]): { group: TargetGroupDef; rest: string } | null {
  const normalized = normalizeName(text)
  let best: { group: TargetGroupDef; length: number } | null = null
  for (const group of groups) {
    for (const candidate of [group.name, ...(group.aliases ?? [])]) {
      const key = normalizeName(candidate)
      if (key.length > 0 && (normalized === key || normalized.startsWith(`${key} `))) {
        if (!best || key.length > best.length) best = { group, length: key.length }
      }
    }
  }
  if (!best) return null
  const rest = normalized.slice(best.length).trim()
  return { group: best.group, rest }
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

    const isEntry = LOOKS_LIKE_ENTRY.test(normalized)
    if (!isEntry) {
      const known = matchGroup(normalized, knownGroups)
      let def: TargetGroupDef
      if (known) {
        def = known.group
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

    const report = (
      severity: ParseIssue["severity"],
      code: ParseIssueCode,
      message: string,
      suggestion?: StrikeTarget,
    ) => {
      issues.push({ line, raw, severity, code, message, ...(suggestion ? { suggestion } : {}) })
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
    const target = toNumber(g.target)
    const breakLevel = toNumber(g.brk)
    const putStrike = toNumber(g.put)
    const expiry = g.exp ? resolveExpiry(g.exp, effectiveDate) : null
    if (target === null || breakLevel === null || putStrike === null || expiry === null) {
      report("error", "unparseable", "A price or the expiry date could not be read.")
      continue
    }

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
    if (knownTickers && !knownTickers.has(symbol))
      report("warning", "unknown-ticker", `${symbol} is not in the ticker universe yet.`)
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

export function targetStatus(lastClose: number, entry: Pick<StrikeTarget, "target" | "breakLevel">): TargetStatus {
  if (lastClose >= entry.target) return "above-target"
  if (lastClose <= entry.breakLevel) return "below-break"
  return "between"
}
