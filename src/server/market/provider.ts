/**
 * End-of-day prices from a Polygon-compatible REST API (MARKET_DATA_BASE_URL). One request returns
 * every US stock's bar for a session, so a daily run costs a single call.
 */
import { z } from "zod"
import type { DailyBar, IsoDate } from "@/core/domain/types"

export interface MarketDataConfig {
  apiKey: string
  baseUrl: string
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const groupedSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            T: z.string(),
            o: z.number().nullish(),
            h: z.number(),
            l: z.number(),
            c: z.number(),
            v: z.number().nullish(),
          })
          .loose(),
      )
      .nullish(),
  })
  .loose()

/** Every US stock's daily bar for one session. Empty on market holidays and weekends. */
export async function fetchGroupedDaily(
  config: MarketDataConfig,
  date: IsoDate,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, DailyBar>> {
  const url = new URL(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, config.baseUrl)
  url.searchParams.set("adjusted", "true")
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new MarketDataError(`Market data request for ${date} failed with HTTP ${res.status}`, res.status)
  const parsed = groupedSchema.parse(await res.json())
  const bars = new Map<string, DailyBar>()
  for (const r of parsed.results ?? []) {
    bars.set(r.T.toUpperCase(), { date, open: r.o ?? null, high: r.h, low: r.l, close: r.c, volume: r.v ?? null })
  }
  return bars
}
