import { describe, expect, it } from "vitest"
import type { IsoDate, StrikeTarget } from "../domain/types"
import {
  applySuggestions,
  diffTargets,
  formatTargetLine,
  formatTargetNumber,
  parseStrikeTargets,
  readTitle,
  resolveExpiry,
  slugify,
  targetStatus,
  targetsToText,
  titleDate,
} from "./strike-targets"

const effectiveDate = "2026-10-07" as IsoDate
const groups = [
  { slug: "alpha", name: "Alpha Channel" },
  { slug: "index", name: "Index Leaders", aliases: ["INDEX LEADERS LIST"] },
  { slug: "box", name: "Watch Box" },
]

// Synthetic sample: same line shapes and formatting slips as the real weekly document, made-up tickers and prices.
const SAMPLE = [
  "STRIKE PRICE TARGETS UPDATE OCT 7",
  "Alpha Channel",
  "1.​AAA- 120.50 or break of 115 PUT 112.50 10/23",
  "2.​BBB- 40 or break of 38.50  PUT 37 10/23 w2.50",
  "3.​CCC- 7.50   or break of 7.0 PUT 6.5010/23",
  "INDEX LEADERS LIST",
  "1.​DDD-135 or break of 130 PUT 127,50 10/23",
  "2.​EEE-202.50 or break of 200 PUT 1 195 10/23",
  "3.​FFF - 5.50 or break 5   PUT 3 exercise 3 10/23",
  "Watch Box PRICES ARE UPDATED WEEKLY",
  "1.​ GGG-.50 or break of .50 PUT .50 10/23",
  "2.​ HHH- 75 or break of 70 PUT 70 10/23",
  "3.​ III- 141  break of 138 PUT 135 10/23",
  "4.​ JJJ- 85 or break of 84 PUT 81 10/23 w.99",
  "5.​ KKK- 17.50 or break of 17  PUT 16.50 10/16",
].join("\n")

describe("strike target parser", () => {
  const parsed = parseStrikeTargets(SAMPLE, { effectiveDate, groups })
  const linesWithIssues = [...new Set(parsed.issues.map((i) => i.line))].sort((a, b) => a - b)

  it("reads the title and every group", () => {
    expect(parsed.title).toBe("STRIKE PRICE TARGETS UPDATE OCT 7")
    expect(parsed.groups.map((g) => [g.slug, g.entries.length])).toEqual([
      ["alpha", 3],
      ["index", 2],
      ["box", 5],
    ])
  })

  it("parses a clean line", () => {
    expect(parsed.groups[0]?.entries[0]).toEqual({
      group: "alpha",
      position: 1,
      symbol: "AAA",
      target: 120.5,
      breakLevel: 115,
      putStrike: 112.5,
      expiry: "2026-10-23",
      dowWeight: null,
      note: null,
    })
    expect(parsed.groups[0]?.entries[1]?.dowWeight).toBe(2.5)
  })

  it("repairs a glued expiry and a decimal comma, with warnings", () => {
    expect(parsed.groups[0]?.entries[2]).toMatchObject({ symbol: "CCC", putStrike: 6.5, expiry: "2026-10-23" })
    expect(parsed.groups[1]?.entries[0]).toMatchObject({ symbol: "DDD", putStrike: 127.5 })
    expect(parsed.issues.find((i) => i.code === "missing-space")?.severity).toBe("warning")
    expect(parsed.issues.find((i) => i.code === "comma-decimal")?.severity).toBe("warning")
  })

  it("reports stray tokens as an error with a suggestion", () => {
    const stray = parsed.issues.find((i) => i.code === "stray-token")
    expect(stray?.severity).toBe("error")
    expect(stray?.suggestion).toMatchObject({ symbol: "EEE", putStrike: 195, group: "index" })
    expect(applySuggestions(parsed).groups[1]?.entries.map((e) => e.symbol)).toEqual(["DDD", "EEE", "FFF"])
  })

  it("keeps notes and flags them", () => {
    expect(parsed.groups[1]?.entries[1]).toMatchObject({ symbol: "FFF", note: "exercise 3", putStrike: 3 })
    expect(parsed.issues.some((i) => i.code === "has-note")).toBe(true)
  })

  it("flags equal values, missing words and leading decimals", () => {
    const codes = (symbolLine: number) => parsed.issues.filter((i) => i.line === symbolLine).map((i) => i.code)
    expect(codes(11)).toEqual(expect.arrayContaining(["all-equal", "number-format"]))
    expect(codes(11)).not.toContain("target-not-above-break")
    expect(codes(12)).toContain("put-equals-break")
    expect(codes(13)).toContain("missing-or")
    expect(codes(14)).toContain("number-format")
  })

  it("flags exactly the problem lines and nothing else", () => {
    expect(linesWithIssues).toEqual([5, 7, 8, 9, 11, 12, 13, 14])
  })

  it("resolves the expiry year from the effective date", () => {
    expect(parsed.groups[2]?.entries[4]?.expiry).toBe("2026-10-16")
    expect(resolveExpiry("1/15", effectiveDate)).toBe("2027-01-15")
    expect(resolveExpiry("2/30", effectiveDate)).toBeNull()
  })

  it("reports unknown lines, unknown tickers and unknown groups", () => {
    const result = parseStrikeTargets(
      "Brand New List\nZZZ- 10 or break of nine PUT 8 10/23\nYYY- 10 or break of 9 PUT 8 10/23",
      {
        effectiveDate,
        groups,
        knownTickers: new Set(["AAA"]),
      },
    )
    expect(result.issues.map((i) => i.code)).toEqual(["new-group", "unparseable", "unknown-ticker"])
    expect(result.groups[0]?.slug).toBe("brand-new-list")
  })

  it("does not guess at a new ticker one letter from a known one", () => {
    const result = parseStrikeTargets("Alpha Channel\nBE- 290 or break of 285 PUT 277.50 10/23", {
      effectiveDate,
      groups,
      knownTickers: new Set(["GE"]),
    })
    expect(result.issues.map((i) => [i.message, i.symbol])).toEqual([["BE is not in the ticker list yet.", "BE"]])
    expect(result.groups[0]?.entries[0]?.symbol).toBe("BE")
  })

  it("matches headings with or without the brand, in any case", () => {
    const named = [
      { slug: "small-channel", name: "Profit Options Small Channel", aliases: ["Small Channel"] },
      { slug: "large-channel", name: "Large Channel" },
    ]
    const headings = [
      "Profit Options Small Channel",
      "PROFIT OPTION SMALL CHANNEL",
      "Small Channel:",
      "Profit Options Large Channel",
      "large channel",
    ]
    const slugs = headings.map(
      (heading) =>
        parseStrikeTargets(`${heading}\nAAA- 10 or break of 9 PUT 8 10/23`, { effectiveDate, groups: named }).groups[0]
          ?.slug,
    )
    expect(slugs).toEqual(["small-channel", "small-channel", "small-channel", "large-channel", "large-channel"])
  })

  it("never mistakes a ticker line for a category name", () => {
    const result = parseStrikeTargets(
      "Alpha Channel\nMSFT 521 or break of 500 PUT 490 10/23\nNVDA 23x or break of 22 PUT 21 10/23\nWatch Box - 2 picks",
      { effectiveDate, groups },
    )
    expect(result.groups.map((g) => g.slug)).toEqual(["alpha", "box"])
    expect(result.groups[0]?.entries.map((e) => [e.symbol, e.target])).toEqual([["MSFT", 521]])
    expect(result.issues.map((i) => [i.line, i.code])).toEqual([
      [2, "missing-dash"],
      [3, "unparseable"],
    ])
  })

  it("rejects entries before any heading", () => {
    const result = parseStrikeTargets("AAA- 10 or break of 9 PUT 8 10/23", { effectiveDate, groups })
    expect(result.issues[0]?.code).toBe("entry-before-group")
  })

  it("slugifies names", () => {
    expect(slugify("Profit Options: Small Channel!")).toBe("profit-options-small-channel")
  })
})

describe("the update date and writing an update back as text", () => {
  it("finds the title line anywhere in the text", () => {
    expect(readTitle(`\n  Strike Price Targets Update  Oct 7 \nAlpha Channel`)).toBe(
      "Strike Price Targets Update Oct 7",
    )
    expect(readTitle("Alpha Channel\nAAA- 10 or break of 9 PUT 8 10/23")).toBeNull()
  })

  it("reads the title's date in the year closest to today", () => {
    const today = "2026-10-23" as IsoDate
    expect(titleDate("STRIKE PRICE TARGETS UPDATE OCT 7", today)).toBe("2026-10-07")
    expect(titleDate("Strike Price Targets Update Sept. 30th", today)).toBe("2026-09-30")
    expect(titleDate("STRIKE PRICE TARGETS UPDATE 10/21", today)).toBe("2026-10-21")
    expect(titleDate("STRIKE PRICE TARGETS UPDATE JAN 6", "2026-12-30" as IsoDate)).toBe("2027-01-06")
    expect(titleDate("STRIKE PRICE TARGETS UPDATE DEC 30", "2027-01-04" as IsoDate)).toBe("2026-12-30")
    expect(titleDate("STRIKE PRICE TARGETS UPDATE", today)).toBeNull()
    expect(titleDate("STRIKE PRICE TARGETS UPDATE FEB 30", today)).toBeNull()
  })

  it("writes prices the way HG does", () => {
    expect([465, 472.5, 3.375, 0.225, 2.72].map(formatTargetNumber)).toEqual([
      "465",
      "472.50",
      "3.375",
      "0.225",
      "2.72",
    ])
    expect(
      formatTargetLine({
        symbol: "NVDA",
        target: 237.5,
        breakLevel: 232.5,
        putStrike: 225,
        expiry: "2026-10-23" as IsoDate,
        dowWeight: 2.72,
        note: null,
      }),
    ).toBe("NVDA- 237.50 or break of 232.50 PUT 225 10/23 w2.72")
  })

  it("reads back exactly what it writes", () => {
    const parsed = parseStrikeTargets(SAMPLE, { effectiveDate, groups })
    const fixed = applySuggestions(parsed)
    const text = targetsToText(effectiveDate, fixed.groups)
    expect(text.split("\n")[0]).toBe("STRIKE PRICE TARGETS UPDATE OCT 7")
    const again = parseStrikeTargets(text, { effectiveDate, groups })
    expect(again.groups).toEqual(fixed.groups)
    expect(again.issues.filter((i) => i.severity === "error")).toEqual([])
  })
})

describe("target diff and status", () => {
  const t = (symbol: string, target: number, group = "alpha"): StrikeTarget => ({
    group,
    position: 1,
    symbol,
    target,
    breakLevel: target - 5,
    putStrike: target - 8,
    expiry: "2026-10-23" as IsoDate,
    dowWeight: null,
    note: null,
  })

  it("finds added, removed and changed entries", () => {
    const diff = diffTargets([t("AAA", 100), t("BBB", 50)], [t("AAA", 102), t("CCC", 10)])
    expect(diff.added.map((x) => x.symbol)).toEqual(["CCC"])
    expect(diff.removed.map((x) => x.symbol)).toEqual(["BBB"])
    expect(diff.changed[0]?.fields).toEqual(["target", "breakLevel", "putStrike"])
  })

  it("classifies the last close against target and break", () => {
    expect(targetStatus(101, t("AAA", 100))).toBe("above-target")
    expect(targetStatus(97, t("AAA", 100))).toBe("between")
    expect(targetStatus(95, t("AAA", 100))).toBe("below-break")
  })
})
