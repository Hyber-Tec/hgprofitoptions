import { Timestamp } from "firebase-admin/firestore"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { zonedDateTime } from "@/core/dates"
import type { DailyBar, IsoDate } from "@/core/domain/types"
import { backfillTicker, syncMarket } from "@/server/market/jobs"
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
/** 7 PM in New York on `date`: after that session's close. */
const evening = (date: string) => zonedDateTime(d(date), "19:00")

interface FakeProvider {
  /** date → symbol → [high, low, close] */
  sessions?: Record<string, Record<string, [number, number, number]>>
  history?: Record<string, DailyBar[]>
  intraday?: Record<string, { at: Date; high: number; low: number; close: number }[]>
  splits?: { ticker: string; execution_date: string }[]
  /** HTTP status for index requests (403 for a plan without index data). */
  indexStatus?: number
}

/** A fake provider, answering by URL like the real one. */
function provider(fake: FakeProvider) {
  return ((input: URL | RequestInfo) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
    if (url.pathname === "/v3/reference/splits")
      return json({ results: (fake.splits ?? []).map((s) => ({ ...s, split_from: 20, split_to: 1 })) })
    const range = /^\/v2\/aggs\/ticker\/([^/]+)\/range\/(\d+)\/(day|minute)\//.exec(url.pathname)
    if (range) {
      const ticker = decodeURIComponent(range[1] ?? "")
      if (ticker.startsWith("I:") && fake.indexStatus) return json({ status: "NOT_AUTHORIZED" }, fake.indexStatus)
      if (range[3] === "minute")
        return json({
          results: (fake.intraday?.[ticker] ?? []).map((b) => ({ t: b.at.getTime(), h: b.high, l: b.low, c: b.close })),
        })
      return json({
        results: (fake.history?.[ticker] ?? []).map((b) => ({
          t: zonedDateTime(b.date, "00:00").getTime(),
          o: b.open,
          h: b.high,
          l: b.low,
          c: b.close,
          v: b.volume,
        })),
      })
    }
    const grouped = /^\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/([\d-]+)$/.exec(url.pathname)
    const rows = fake.sessions?.[grouped?.[1] ?? ""] ?? {}
    return json({ results: Object.entries(rows).map(([T, [h, l, c]]) => ({ T, h, l, c, o: c, v: 1000 })) })
  }) as typeof fetch
}

async function seed() {
  const ticker = (symbol: string, kind: string, active: boolean) =>
    db.collection("tickers").doc(symbol).set({ symbol, kind, active, metrics: null })
  await Promise.all([
    ticker("AAA", "stock", true),
    ticker("BBB", "stock", true),
    ticker("TQQQ", "etf", true),
    ticker("DJI", "index", true),
    ticker("OLD", "stock", false),
  ])
  // AAA's week of Sep 28 to Oct 2, 2026, and the Friday before it.
  const stored = (symbol: string, bars: DailyBar[]) =>
    db.collection("tickerBars").doc(symbol).set({ symbol, bars, updatedAt: Timestamp.now() })
  await stored("AAA", [
    bar("2026-09-25", 101, 99, 100),
    bar("2026-09-28", 104, 100, 103),
    bar("2026-09-29", 106, 102, 105),
    bar("2026-09-30", 105, 98, 99),
    bar("2026-10-01", 101, 97, 98),
    bar("2026-10-02", 99, 96, 97),
  ])
  await stored("TQQQ", [bar("2026-09-25", 51, 49, 50), bar("2026-10-02", 55, 52, 54)])
}

beforeEach(async () => {
  await clear()
  await seed()
})

afterAll(close)

describe("keeping market data up to date", () => {
  it("adds the session to active tickers, fetches history for those without, and refreshes their windows", async () => {
    const result = await syncMarket(
      db,
      config,
      evening("2026-10-05"),
      provider({
        sessions: { "2026-10-05": { AAA: [99, 95, 96], TQQQ: [56, 53, 55], OLD: [10, 9, 9.5], ZZZ: [1, 1, 1] } },
        history: { BBB: [bar("2026-09-25", 21, 19, 20), bar("2026-10-05", 23, 20, 22)] },
      }),
    )
    expect(result).toMatchObject({ through: "2026-10-05", sessions: ["2026-10-05"], backfilled: ["BBB"], missing: [] })
    const bars = (await db.doc("tickerBars/AAA").get()).get("bars") as DailyBar[]
    expect(bars.at(-1)).toEqual({ date: "2026-10-05", open: 96, high: 99, low: 95, close: 96, volume: 1000 })
    const metrics = (await db.doc("tickers/AAA").get()).get("metrics") as Record<string, unknown>
    expect(metrics).toMatchObject({ asOf: "2026-10-05", lastClose: 96, high5d: 106, low5d: 96, source: "provider" })
    expect((await db.doc("tickers/BBB").get()).get("metrics.lastClose")).toBe(22)
    expect((await db.doc("tickerBars/OLD").get()).exists).toBe(false)
    expect((await db.doc("tickerBars/DJI").get()).exists).toBe(false)
  })

  it("fills in every session a skipped run missed, but not market holidays", async () => {
    // Stored through Wednesday Nov 25; Thanksgiving is Thursday Nov 26.
    for (const symbol of ["AAA", "TQQQ"])
      await db.doc(`tickerBars/${symbol}`).set({
        symbol,
        bars: [bar("2026-11-24", 101, 99, 100), bar("2026-11-25", 102, 99, 101)],
        updatedAt: Timestamp.now(),
      })
    const result = await syncMarket(
      db,
      config,
      evening("2026-11-30"),
      provider({
        sessions: { "2026-11-27": { AAA: [103, 100, 102] }, "2026-11-30": { AAA: [104, 101, 103] } },
      }),
    )
    expect(result.sessions).toEqual(["2026-11-27", "2026-11-30"])
    const bars = (await db.doc("tickerBars/AAA").get()).get("bars") as DailyBar[]
    expect(bars.map((b) => b.date)).toEqual(["2026-11-24", "2026-11-25", "2026-11-27", "2026-11-30"])
  })

  it("names tickers the provider has nothing for", async () => {
    const result = await syncMarket(
      db,
      config,
      evening("2026-10-05"),
      provider({ sessions: { "2026-10-05": { AAA: [99, 95, 96], TQQQ: [56, 53, 55] } } }),
    )
    expect(result.missing).toEqual(["BBB"])
  })

  it("re-fetches the split-adjusted history after a split, once", async () => {
    // A 1-for-20 reverse split on Oct 5: the stored bars are pre-split prices, the new ones about 100.
    const adjusted = [bar("2026-09-25", 101, 99, 100), bar("2026-10-02", 99, 96, 97), bar("2026-10-05", 99, 95, 96)]
    const fake = provider({
      sessions: { "2026-10-05": { AAA: [99, 95, 96] }, "2026-10-06": { AAA: [98, 94, 95] } },
      splits: [{ ticker: "AAA", execution_date: "2026-10-05" }],
      history: { AAA: adjusted },
    })
    const first = await syncMarket(db, config, evening("2026-10-05"), fake)
    expect(first.resplit).toEqual(["AAA"])
    const stored = (await db.doc("tickerBars/AAA").get()).data() ?? {}
    expect((stored.bars as DailyBar[]).map((b) => b.close)).toEqual([100, 97, 96])
    expect(stored.lastSplit).toBe("2026-10-05")
    // The next session sees the same split in its window but does not fetch the history again.
    const second = await syncMarket(db, config, evening("2026-10-06"), fake)
    expect(second.resplit).toEqual([])
  })
})

describe("weekly Key Market Data and the index close", () => {
  const dow = {
    daily: [
      bar("2026-10-02", 52100, 51800, 52002.41),
      bar("2026-10-05", 52300, 51885.99, 52200),
      bar("2026-10-07", 52923.38, 52100, 52500),
      bar("2026-10-09", 52400, 52000, 52215.16),
    ],
    // The week's high on Wednesday at 12:30 PM and its low on Monday at 9:55 AM (New York).
    intraday: [
      { at: zonedDateTime(d("2026-10-05"), "09:55"), high: 51950, low: 51885.99, close: 51900 },
      { at: zonedDateTime(d("2026-10-07"), "12:30"), high: 52923.38, low: 52800, close: 52850 },
      { at: zonedDateTime(d("2026-10-09"), "15:55"), high: 52300, low: 52200, close: 52215.16 },
    ],
  }

  it("builds the weeks a skipped run missed, with HG's index close, and leaves HG's sheet alone", async () => {
    await db.doc("weeks/2026-09-28").set({
      weekStart: "2026-09-28",
      weekEnd: "2026-10-02",
      rows: { AAA: { pfcp: 1, high: 1, low: 1, close: 1, range: 0, svi: 0 } },
      source: "import",
    })
    const result = await syncMarket(
      db,
      config,
      evening("2026-10-09"),
      provider({
        sessions: {
          "2026-10-05": { AAA: [104, 96, 98], TQQQ: [56, 53, 55] },
          "2026-10-09": { AAA: [107, 97, 105], TQQQ: [57, 54, 56] },
        },
        history: { "I:DJI": dow.daily },
        intraday: { "I:DJI": dow.intraday },
      }),
    )
    // Friday evening: that week is complete.
    expect(result.weeks).toEqual(["2026-10-05"])
    expect(result.indexWeeks).toEqual(["2026-10-05"])
    const week = (await db.doc("weeks/2026-10-05").get()).data() ?? {}
    expect(week.source).toBe("provider")
    // ETFs are not in HG's sheet.
    expect(Object.keys(week.rows as object)).toEqual(["AAA"])
    expect(week.indices).toMatchObject({
      DJI: {
        pfcp: 52002.41,
        close: 52215.16,
        high: 52923.38,
        highAt: "2026-10-07T16:30:00.000Z",
        low: 51885.99,
        lowAt: "2026-10-05T13:55:00.000Z",
        entered: false,
      },
    })
    expect((await db.doc("weeks/2026-09-28").get()).get("source")).toBe("import")
  })

  it("keeps index values an admin typed in, and says when the plan has no index data", async () => {
    const typed = { pfcp: 1, high: 3, low: 1, close: 2, range: 2, svi: 1, highAt: null, lowAt: null, entered: true }
    await db.doc("weeks/2026-10-05").set({
      weekStart: "2026-10-05",
      weekEnd: "2026-10-09",
      rows: {},
      indices: { DJI: typed },
      source: "manual",
    })
    const sessions = { "2026-10-05": { AAA: [104, 96, 98] }, "2026-10-09": { AAA: [107, 97, 105] } } as Record<
      string,
      Record<string, [number, number, number]>
    >
    await syncMarket(
      db,
      config,
      evening("2026-10-09"),
      provider({ sessions, history: { "I:DJI": dow.daily }, intraday: { "I:DJI": dow.intraday } }),
    )
    expect((await db.doc("weeks/2026-10-05").get()).get("indices.DJI")).toEqual(typed)

    await db.doc("weeks/2026-10-05").delete()
    const result = await syncMarket(db, config, evening("2026-10-09"), provider({ sessions, indexStatus: 403 }))
    expect(result.indexNote).toBe("Index data is not included in the market data plan")
    expect(result.weeks).toEqual(["2026-10-05"])
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
    const result = await backfillTicker(db, config, "NEW", d("2026-10-02"), provider({ history }))
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
    await backfillTicker(db, config, "BRK.B", d("2026-10-02"), provider({ history }))
    const rows = (await db.doc("weeks/2026-09-28").get()).get("rows") as Record<string, unknown>
    expect(Object.keys(rows)).toEqual(["BRK.B"])
  })
})
