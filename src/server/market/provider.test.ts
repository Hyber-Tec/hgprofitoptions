import { describe, expect, it } from "vitest"
import type { IsoDate } from "@/core/domain/types"
import { MarketDataError, fetchGroupedDaily } from "./provider"

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
