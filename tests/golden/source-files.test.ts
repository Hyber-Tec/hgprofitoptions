/**
 * Golden tests: the app's calculations must reproduce HG's own spreadsheets and documents exactly.
 * They read docs/private/source-files (never committed) and are skipped when those files are absent,
 * for example in CI on the public repository.
 */
import { describe, expect, it } from "vitest"
import { channelLadder } from "@/core/calc/channels"
import { signedRange, svi } from "@/core/calc/kmd"
import { midRange } from "@/core/calc/medians"
import type { IsoDate } from "@/core/domain/types"
import { applySuggestions, parseStrikeTargets } from "@/core/parsers/strike-targets"
import { readChannelSheet, readEtfGuide, readKeyMarketData, readStrikeTargetsText, sourceFile, sourceFilesPresent } from "../../scripts/lib/source-files"

const present = sourceFilesPresent()
const file = (prefix: string): string => {
  const path = sourceFile(prefix)
  if (!path) throw new Error(`missing source file ${prefix}`)
  return path
}

describe.skipIf(!present)("golden: Key Market Data spreadsheet", () => {
  it("reproduces RANGE and SVI for every row", async () => {
    const kmd = await readKeyMarketData(file("Key Market Data"))
    expect(kmd.weekStart).toBe("2026-09-28")
    expect(kmd.weekEnd).toBe("2026-10-02")
    expect(kmd.rows.filter((r) => r.kind === "index").map((r) => r.symbol)).toEqual(["DJI", "SPX", "IXIC"])
    expect(kmd.rows.filter((r) => r.kind === "stock")).toHaveLength(119)
    expect(kmd.duplicates).toEqual(["AVGO"])
    for (const row of kmd.rows) {
      const range = signedRange(row.pfcp, row.high, row.low, row.close)
      expect(range, row.symbol).toBeCloseTo(row.sheetRange, 6)
      expect(svi(range, row.close), row.symbol).toBeCloseTo(row.sheetSvi, 8)
    }
  })
})

describe.skipIf(!present)("golden: Median & Channel Chart spreadsheet", () => {
  it("reproduces medians and the full channel ladder for all 125 tickers", async () => {
    const sheet = await readChannelSheet(file("MEDIAN and CHANNEL"))
    expect(sheet.blocks).toHaveLength(125)
    for (const b of sheet.blocks) {
      const near = (v: number | null): unknown => (v === null ? null : expect.closeTo(v, 2))
      if (b.high5d !== null && b.low5d !== null) expect(midRange(b.high5d, b.low5d), `${b.symbol} 5D`).toBeCloseTo(b.sheetMedians.m5 ?? NaN, 4)
      if (b.high30d !== null && b.low30d !== null) expect(midRange(b.high30d, b.low30d), `${b.symbol} 30D`).toBeCloseTo(b.sheetMedians.m30 ?? NaN, 4)
      if (b.high90d !== null && b.low90d !== null) expect(midRange(b.high90d, b.low90d), `${b.symbol} 90D`).toBeCloseTo(b.sheetMedians.m90 ?? NaN, 4)
      const ladder = channelLadder(b.anchor, { ch: b.ch, boc: b.boc })
      expect(ladder.lines, `${b.symbol} lines`).toEqual(b.sheetLines.map(near))
      expect(ladder.bocAbove, `${b.symbol} BOC above`).toEqual(b.sheetBocAbove.map(near))
      expect(ladder.bocBelow, `${b.symbol} BOC below`).toEqual(b.sheetBocBelow.map(near))
    }
  })
})

describe.skipIf(!present)("golden: Strike Price Targets document", () => {
  it("parses all 94 entries in 8 groups and flags exactly the 9 problem lines", async () => {
    const text = await readStrikeTargetsText(file("Strike Price Targets"))
    const parsed = parseStrikeTargets(text, { effectiveDate: "2026-10-07" as IsoDate, groups: [] })
    const problemLines = new Set(parsed.issues.filter((i) => i.code !== "new-group").map((i) => i.line))
    expect(parsed.title).toMatch(/UPDATE OCT 7/)
    expect(parsed.groups).toHaveLength(8)
    expect(problemLines.size).toBe(9)
    expect(parsed.issues.filter((i) => i.severity === "error").map((i) => i.code)).toEqual(["stray-token"])
    const complete = applySuggestions(parsed)
    expect(complete.groups.map((g) => g.entries.length)).toEqual([15, 2, 10, 8, 7, 7, 5, 40])
    expect(complete.groups.reduce((n, g) => n + g.entries.length, 0)).toBe(94)
  })
})

describe.skipIf(!present)("golden: Leveraged ETF guide", () => {
  it("reads the guidance and all 21 pairs", async () => {
    const guide = await readEtfGuide(file("Profit Option"))
    expect(guide.pairs).toHaveLength(21)
    expect(guide.guidance.length).toBeGreaterThanOrEqual(2)
  })
})
