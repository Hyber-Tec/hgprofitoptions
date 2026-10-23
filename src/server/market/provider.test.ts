import { describe, expect, it } from "vitest"
import type { IsoDate } from "@/core/domain/types"
import {
  MarketDataError,
  fetchDailyRange,
  fetchGroupedDaily,
  fetchSnapshots,
  fetchSplits,
  fetchTickerDetails,
} from "./provider"

const config = { apiKey: "test-key", baseUrl: "https://api.example.com" }
const date = "2026-10-07" as IsoDate

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; auth: string | null }[] = []
  const impl = ((input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      auth: new Headers(init?.headers).get("authorization"),
    })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as typeof fetch
  return { impl, calls }
}

describe("grouped daily bars", () => {
  it("reads every ticker's bar and keeps the key out of the URL", async () => {
    const { impl, calls } = fakeFetch(200, {
      status: "OK",
      resultsCount: 2,
      results: [
        { T: "AAPL", o: 330.1, h: 335.2, l: 329.4, c: 333.63, v: 51234567, vw: 332.9, t: 1791403200000, n: 1 },
        { T: "brk.b", h: 470, l: 465.5, c: 468.25 },
      ],
    })
    const bars = await fetchGroupedDaily(config, date, impl)
    expect(bars.get("AAPL")).toEqual({ date, open: 330.1, high: 335.2, low: 329.4, close: 333.63, volume: 51234567 })
    expect(bars.get("BRK.B")).toEqual({ date, open: null, high: 470, low: 465.5, close: 468.25, volume: null })
    expect(calls[0]?.url).toBe(
      "https://api.example.com/v2/aggs/grouped/locale/us/market/stocks/2026-10-07?adjusted=true",
    )
    expect(calls[0]?.auth).toBe("Bearer test-key")
  })

  it("returns nothing on a holiday", async () => {
    const { impl } = fakeFetch(200, { status: "OK", resultsCount: 0 })
    expect((await fetchGroupedDaily(config, date, impl)).size).toBe(0)
  })

  it("reports HTTP failures", async () => {
    const { impl } = fakeFetch(429, { status: "ERROR" })
    await expect(fetchGroupedDaily(config, date, impl)).rejects.toBeInstanceOf(MarketDataError)
  })
})

describe("daily bars for one ticker", () => {
  it("dates each bar in New York and keeps them oldest first", async () => {
    const { impl, calls } = fakeFetch(200, {
      results: [
        // Window starts: midnight in New York on Oct 1 and Oct 2, 2026.
        { t: 1790827200000, o: 100, h: 102, l: 99, c: 101.5, v: 1000 },
        { t: 1790913600000, h: 104, l: 100.5, c: 103 },
      ],
    })
    const bars = await fetchDailyRange(config, "TSM", "2026-10-01" as IsoDate, "2026-10-02" as IsoDate, impl)
    expect(bars).toEqual([
      { date: "2026-10-01", open: 100, high: 102, low: 99, close: 101.5, volume: 1000 },
      { date: "2026-10-02", open: null, high: 104, low: 100.5, close: 103, volume: null },
    ])
    expect(calls[0]?.url).toBe(
      "https://api.example.com/v2/aggs/ticker/TSM/range/1/day/2026-10-01/2026-10-02?adjusted=true&sort=asc&limit=50000",
    )
  })
})

describe("splits", () => {
  it("lists the splits that took effect in the window", async () => {
    const { impl, calls } = fakeFetch(200, {
      results: [{ ticker: "skin", execution_date: "2026-10-13", split_from: 20, split_to: 1 }],
    })
    const splits = await fetchSplits(config, "2026-10-08" as IsoDate, "2026-10-15" as IsoDate, impl)
    expect(splits).toEqual([{ symbol: "SKIN", executionDate: "2026-10-13", ratio: "1-for-20" }])
    expect(calls[0]?.url).toContain("execution_date.gte=2026-10-08&execution_date.lte=2026-10-15")
  })
})

describe("ticker details", () => {
  it("reads the name and tells ETFs from stocks", async () => {
    const stock = fakeFetch(200, { results: { ticker: "AAPL", name: "Apple Inc.", type: "CS" } })
    expect(await fetchTickerDetails(config, "AAPL", stock.impl)).toEqual({
      symbol: "AAPL",
      name: "Apple Inc.",
      kind: "stock",
    })
    const etf = fakeFetch(200, { results: { ticker: "NVDL", name: "GraniteShares 2x Long NVDA", type: "ETF" } })
    expect((await fetchTickerDetails(config, "NVDL", etf.impl))?.kind).toBe("etf")
  })

  it("returns null for a symbol the provider does not know", async () => {
    const { impl } = fakeFetch(404, { status: "NOT_FOUND" })
    expect(await fetchTickerDetails(config, "ZZZZ", impl)).toBeNull()
  })
})

describe("snapshots", () => {
  it("reads stock and option quotes and skips unknown tickers", async () => {
    const { impl, calls } = fakeFetch(200, {
      results: [
        {
          ticker: "TSM",
          market_status: "open",
          last_quote: {
            bid: 432.05,
            ask: 432.1,
            bid_size: 3,
            ask_size: 2,
            last_updated: 1792771200000000000,
            timeframe: "REAL-TIME",
          },
          last_trade: { price: 432.08, last_updated: 1792771199000000000, timeframe: "REAL-TIME" },
          session: { close: 432.08, previous_close: 428 },
        },
        {
          ticker: "O:TSM261106P00420000",
          market_status: "open",
          last_quote: { bid: 2.15, ask: 2.25, last_updated: 1792771100000000000, timeframe: "DELAYED" },
          session: { close: 2.2 },
        },
        { ticker: "ZZZZ", error: "NOT_FOUND", message: "Ticker not found." },
      ],
    })
    const quotes = await fetchSnapshots(config, ["TSM", "O:TSM261106P00420000", "ZZZZ"], impl)
    expect(quotes.get("TSM")).toEqual({
      ticker: "TSM",
      last: 432.08,
      bid: 432.05,
      ask: 432.1,
      bidSize: 3,
      askSize: 2,
      previousClose: 428,
      updatedAt: 1792771200000,
      realTime: true,
      marketStatus: "open",
    })
    expect(quotes.get("O:TSM261106P00420000")).toMatchObject({ last: 2.2, bid: 2.15, ask: 2.25, realTime: false })
    expect(quotes.has("ZZZZ")).toBe(false)
    expect(decodeURIComponent(calls[0]?.url ?? "")).toContain("ticker.any_of=TSM,O:TSM261106P00420000,ZZZZ&limit=250")
  })

  it("asks for at most 250 tickers at a time", async () => {
    const { impl, calls } = fakeFetch(200, { results: [] })
    await fetchSnapshots(
      config,
      Array.from({ length: 251 }, (_, i) => `T${String(i)}`),
      impl,
    )
    expect(calls).toHaveLength(2)
  })
})
