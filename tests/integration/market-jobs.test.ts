import { Timestamp } from "firebase-admin/firestore"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { finalizeWeek, ingestDailyBars } from "@/server/market/jobs"
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

function sessionFetch(rows: Record<string, [number, number, number]>) {
  return (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          resultsCount: Object.keys(rows).length,
          results: Object.entries(rows).map(([T, [h, l, c]]) => ({ T, h, l, c, o: c, v: 1000 })),
        }),
      ),
    )) as typeof fetch
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
    expect(result).toEqual({ updated: 1, missing: ["BBB"] })
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
