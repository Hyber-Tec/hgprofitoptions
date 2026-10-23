import { Timestamp } from "firebase-admin/firestore"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { backfillTicker, finalizeWeek, ingestDailyBars } from "@/server/market/jobs"
import { emulatorDb } from "./setup"

const { db, clear, close } = emulatorDb("market-jobs")
const config = { apiKey: "test", baseUrl: "https://api.example.com" }
const d = (date: string) => date as IsoDate
const bar = (date: string, high: number, low: number, close: number): DailyBar => ({
  date: d(date),
  open: null,
  high,
  low,
  close,
  volume: null,
})

/** A fake provider: the grouped session, splits, and one ticker's history, by URL. */
function sessionFetch(
  rows: Record<string, [number, number, number]>,
  options: { splits?: { ticker: string; execution_date: string }[]; history?: Record<string, DailyBar[]> } = {},
) {
  return ((input: URL | RequestInfo) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
    if (url.pathname === "/v3/reference/splits")
      return json({ results: (options.splits ?? []).map((s) => ({ ...s, split_from: 20, split_to: 1 })) })
    const range = /^\/v2\/aggs\/ticker\/([^/]+)\/range/.exec(url.pathname)
    if (range)
      return json({
        results: (options.history?.[range[1] ?? ""] ?? []).map((b) => ({
          t: Date.parse(`${b.date}T04:00:00Z`),
          o: b.open,
          h: b.high,
          l: b.low,
          c: b.close,
          v: b.volume,
        })),
      })
    return json({
      resultsCount: Object.keys(rows).length,
      results: Object.entries(rows).map(([T, [h, l, c]]) => ({ T, h, l, c, o: c, v: 1000 })),
    })
  }) as typeof fetch
}

async function seed() {
  const ticker = (symbol: string, kind: string, active: boolean) =>
    db.collection("tickers").doc(symbol).set({ symbol, kind, active, metrics: null })
  await Promise.all([
    ticker("AAA", "stock", true),
    ticker("BBB", "stock", true),
    ticker("DJI", "index", true),
    ticker("OLD", "stock", false),
  ])
  // AAA's week of Sep 28 to Oct 2, 2026, and the Friday before it.
  await db
    .collection("tickerBars")
    .doc("AAA")
    .set({
      symbol: "AAA",
      bars: [
        bar("2026-09-25", 101, 99, 100),
        bar("2026-09-28", 104, 100, 103),
        bar("2026-09-29", 106, 102, 105),
        bar("2026-09-30", 105, 98, 99),
        bar("2026-10-01", 101, 97, 98),
        bar("2026-10-02", 99, 96, 97),
      ],
      updatedAt: Timestamp.now(),
    })
}

beforeEach(async () => {
  await clear()
  await seed()
})

afterAll(close)

describe("daily market data", () => {
  it("adds the session to active stocks and refreshes their windows", async () => {
    const result = await ingestDailyBars(
      db,
      config,
      d("2026-10-05"),
      sessionFetch({ AAA: [99, 95, 96], OLD: [10, 9, 9.5], ZZZ: [1, 1, 1] }),
    )
    expect(result).toEqual({ updated: 1, missing: ["BBB"], resplit: [] })
    const bars = (await db.doc("tickerBars/AAA").get()).get("bars") as DailyBar[]
    expect(bars.at(-1)).toEqual({ date: "2026-10-05", open: 96, high: 99, low: 95, close: 96, volume: 1000 })
    const metrics = (await db.doc("tickers/AAA").get()).get("metrics") as Record<string, unknown>
    expect(metrics).toMatchObject({
      asOf: "2026-10-05",
      lastClose: 96,
      high5d: 106,
      low5d: 96,
      source: "provider",
    })
    expect((await db.doc("tickerBars/OLD").get()).exists).toBe(false)
    expect((await db.doc("tickerBars/DJI").get()).exists).toBe(false)
  })

  it("re-fetches the split-adjusted history after a split, once", async () => {
    // A 1-for-20 reverse split on Oct 5: the stored bars are pre-split prices (about 5), the new ones about 100.
    const adjusted = [bar("2026-09-25", 101, 99, 100), bar("2026-10-02", 99, 96, 97)]
    const provider = sessionFetch(
      { AAA: [99, 95, 96], BBB: [10, 9, 9.5] },
      { splits: [{ ticker: "AAA", execution_date: "2026-10-05" }], history: { AAA: adjusted } },
    )
    const first = await ingestDailyBars(db, config, d("2026-10-05"), provider)
    expect(first?.resplit).toEqual(["AAA"])
    const stored = (await db.doc("tickerBars/AAA").get()).data() ?? {}
    expect((stored.bars as DailyBar[]).map((b) => b.close)).toEqual([100, 97, 96])
    expect(stored.lastSplit).toBe("2026-10-05")
    // The next session sees the same split in its window but does not fetch the history again.
    const second = await ingestDailyBars(db, config, d("2026-10-06"), provider)
    expect(second?.resplit).toEqual([])
  })

  it("does nothing on a market holiday", async () => {
    expect(await ingestDailyBars(db, config, d("2026-10-12"), sessionFetch({}))).toBeNull()
  })
})

describe("weekly Key Market Data", () => {
  it("builds the week that just ended and keeps hand-entered index values", async () => {
    const indices = { DJI: { pfcp: 1, high: 2, low: 1, close: 2, range: 1, svi: 0.5 } }
    await db.doc("weeks/2026-09-28").set({ weekStart: "2026-09-28", weekEnd: "2026-10-02", rows: {}, indices })
    const result = await finalizeWeek(db, d("2026-10-03"))
    expect(result).toEqual({ weekStart: "2026-09-28", rows: 1 })
    const week = (await db.doc("weeks/2026-09-28").get()).data() ?? {}
    expect(week.source).toBe("provider")
    expect(week.indices).toEqual(indices)
    // Closed below the previous Friday (100), so the range is negative: -(106 - 96).
    expect(week.rows).toEqual({ AAA: { pfcp: 100, high: 106, low: 96, close: 97, range: -10, svi: -10 / 97 } })
  })
})

describe("adding a ticker", () => {
  it("fetches its history, sets its metrics and adds it to the latest week on file", async () => {
    await db.doc("tickers/NEW").set({ symbol: "NEW", kind: "stock", active: true, metrics: null })
    await db.doc("weeks/2026-09-28").set({ weekStart: "2026-09-28", weekEnd: "2026-10-02", rows: {}, indices: {} })
    const history = {
      NEW: [
        bar("2026-09-25", 51, 49, 50),
        bar("2026-09-28", 53, 50, 52),
        bar("2026-10-01", 55, 51, 54),
        bar("2026-10-02", 56, 53, 55),
      ],
    }
    const result = await backfillTicker(db, config, "NEW", d("2026-10-02"), sessionFetch({}, { history }))
    expect(result).toEqual({ bars: 4, addedToWeek: "2026-09-28" })
    const metrics = (await db.doc("tickers/NEW").get()).get("metrics") as Record<string, unknown>
    expect(metrics).toMatchObject({ asOf: "2026-10-02", lastClose: 55, high5d: 56, low5d: 50, source: "provider" })
    const week = (await db.doc("weeks/2026-09-28").get()).get("rows") as Record<string, unknown>
    expect(week.NEW).toEqual({ pfcp: 50, high: 56, low: 50, close: 55, range: 6, svi: 6 / 55 })
  })

  it("keeps a dotted symbol as one key", async () => {
    await db.doc("tickers/BRK.B").set({ symbol: "BRK.B", kind: "stock", active: true, metrics: null })
    await db.doc("weeks/2026-09-28").set({ weekStart: "2026-09-28", weekEnd: "2026-10-02", rows: {}, indices: {} })
    const history = { "BRK.B": [bar("2026-09-25", 481, 479, 480), bar("2026-10-02", 490, 478, 489)] }
    await backfillTicker(db, config, "BRK.B", d("2026-10-02"), sessionFetch({}, { history }))
    const rows = (await db.doc("weeks/2026-09-28").get()).get("rows") as Record<string, unknown>
    expect(Object.keys(rows)).toEqual(["BRK.B"])
  })
})
