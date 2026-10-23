/**
 * Market data from a Massive (formerly Polygon.io) compatible REST API (MARKET_DATA_BASE_URL).
 *
 * Daily bars are the regular session: under the consolidated trade rules, extended-hours trades (Form T)
 * update neither the high and low nor the last price, so a bar's close is the 4 PM close. Bars are split
 * adjusted. One grouped request returns every US stock's bar for a session, so a daily run costs one call.
 */
import { z } from "zod"
import { isoDateInZone } from "@/core/dates"
import type { DailyBar, IsoDate, LiveQuote } from "@/core/domain/types"

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

async function getJson(
  config: MarketDataConfig,
  path: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
  what: string,
  { timeoutMs = 60_000, notFound = "throw" }: { timeoutMs?: number; notFound?: "throw" | "empty" } = {},
): Promise<unknown> {
  const url = new URL(path, config.baseUrl)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.status === 404 && notFound === "empty") return {}
  if (!res.ok) throw new MarketDataError(`Market data request for ${what} failed with HTTP ${res.status}`, res.status)
  return res.json()
}

const aggregateSchema = z
  .object({
    o: z.number().nullish(),
    h: z.number(),
    l: z.number(),
    c: z.number(),
    v: z.number().nullish(),
  })
  .loose()

const groupedSchema = z
  .object({ results: z.array(aggregateSchema.extend({ T: z.string() }).loose()).nullish() })
  .loose()

/** Every US stock's daily bar for one session. Empty on market holidays and weekends. */
export async function fetchGroupedDaily(
  config: MarketDataConfig,
  date: IsoDate,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, DailyBar>> {
  const body = await getJson(
    config,
    `/v2/aggs/grouped/locale/us/market/stocks/${date}`,
    { adjusted: "true" },
    fetchImpl,
    date,
  )
  const parsed = groupedSchema.parse(body)
  const bars = new Map<string, DailyBar>()
  for (const r of parsed.results ?? []) {
    bars.set(r.T.toUpperCase(), { date, open: r.o ?? null, high: r.h, low: r.l, close: r.c, volume: r.v ?? null })
  }
  return bars
}

const rangeSchema = z.object({ results: z.array(aggregateSchema.extend({ t: z.number() }).loose()).nullish() }).loose()

/** One ticker's split-adjusted daily bars from `from` to `to` (inclusive), oldest first. */
export async function fetchDailyRange(
  config: MarketDataConfig,
  symbol: string,
  from: IsoDate,
  to: IsoDate,
  fetchImpl: typeof fetch = fetch,
): Promise<DailyBar[]> {
  const body = await getJson(
    config,
    `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}`,
    { adjusted: "true", sort: "asc", limit: "50000" },
    fetchImpl,
    symbol,
  )
  const parsed = rangeSchema.parse(body)
  // `t` is the start of the bar's day in New York.
  return (parsed.results ?? []).map((r) => ({
    date: isoDateInZone(new Date(r.t)),
    open: r.o ?? null,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v ?? null,
  }))
}

const splitsSchema = z
  .object({
    results: z
      .array(z.object({ ticker: z.string(), execution_date: z.string(), split_from: z.number(), split_to: z.number() }))
      .nullish(),
  })
  .loose()

export interface Split {
  symbol: string
  /** The first session that trades on the new share count. */
  executionDate: IsoDate
  ratio: string
}

/** Stock splits that took effect from `from` to `to`. */
export async function fetchSplits(
  config: MarketDataConfig,
  from: IsoDate,
  to: IsoDate,
  fetchImpl: typeof fetch = fetch,
): Promise<Split[]> {
  const body = await getJson(
    config,
    "/v3/reference/splits",
    { "execution_date.gte": from, "execution_date.lte": to, limit: "1000" },
    fetchImpl,
    "splits",
  )
  return (splitsSchema.parse(body).results ?? []).map((s) => ({
    symbol: s.ticker.toUpperCase(),
    executionDate: s.execution_date as IsoDate,
    ratio: `${s.split_to}-for-${s.split_from}`,
  }))
}

const detailsSchema = z
  .object({
    results: z.object({ ticker: z.string(), name: z.string().nullish(), type: z.string().nullish() }).loose().nullish(),
  })
  .loose()

const ETF_TYPES = new Set(["ETF", "ETN", "ETV", "ETS"])

/** The company name and kind of a ticker, or null when the provider does not know it. */
export async function fetchTickerDetails(
  config: MarketDataConfig,
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ symbol: string; name: string | null; kind: "stock" | "etf" } | null> {
  const body = await getJson(config, `/v3/reference/tickers/${encodeURIComponent(symbol)}`, {}, fetchImpl, symbol, {
    timeoutMs: 20_000,
    notFound: "empty",
  })
  const details = detailsSchema.parse(body).results
  if (!details) return null
  return {
    symbol: details.ticker.toUpperCase(),
    name: details.name?.trim() || null,
    kind: ETF_TYPES.has(details.type ?? "") ? "etf" : "stock",
  }
}

const nanosToMillis = (ns: number | null | undefined) => (ns ? Math.floor(ns / 1e6) : null)

const snapshotSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            ticker: z.string(),
            error: z.string().nullish(),
            market_status: z.string().nullish(),
            last_quote: z
              .object({
                bid: z.number().nullish(),
                ask: z.number().nullish(),
                bid_size: z.number().nullish(),
                ask_size: z.number().nullish(),
                last_updated: z.number().nullish(),
                timeframe: z.string().nullish(),
              })
              .loose()
              .nullish(),
            last_trade: z
              .object({
                price: z.number().nullish(),
                sip_timestamp: z.number().nullish(),
                last_updated: z.number().nullish(),
                timeframe: z.string().nullish(),
              })
              .loose()
              .nullish(),
            session: z.object({ close: z.number().nullish(), previous_close: z.number().nullish() }).loose().nullish(),
          })
          .loose(),
      )
      .nullish(),
  })
  .loose()

const MARKET_STATUS = new Set(["open", "closed", "early_trading", "late_trading"])

/**
 * The latest quote for each ticker (stocks and option contracts), up to 250 per request. Quote fields
 * (bid, ask) are only present on plans that include quotes; unknown tickers are left out.
 */
export async function fetchSnapshots(
  config: MarketDataConfig,
  tickers: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, LiveQuote>> {
  const quotes = new Map<string, LiveQuote>()
  for (let i = 0; i < tickers.length; i += 250) {
    const chunk = tickers.slice(i, i + 250)
    const body = await getJson(
      config,
      "/v3/snapshot",
      { "ticker.any_of": chunk.join(","), limit: "250" },
      fetchImpl,
      "quotes",
      { timeoutMs: 15_000 },
    )
    for (const r of snapshotSchema.parse(body).results ?? []) {
      if (r.error) continue
      const quote = r.last_quote
      const trade = r.last_trade
      const timeframe = quote?.timeframe ?? trade?.timeframe ?? null
      quotes.set(r.ticker, {
        ticker: r.ticker,
        last: trade?.price ?? r.session?.close ?? null,
        bid: quote?.bid ?? null,
        ask: quote?.ask ?? null,
        bidSize: quote?.bid_size ?? null,
        askSize: quote?.ask_size ?? null,
        previousClose: r.session?.previous_close ?? null,
        updatedAt: nanosToMillis(quote?.last_updated ?? trade?.sip_timestamp ?? trade?.last_updated),
        realTime: timeframe === "REAL-TIME",
        marketStatus: MARKET_STATUS.has(r.market_status ?? "") ? (r.market_status as LiveQuote["marketStatus"]) : null,
      })
    }
  }
  return quotes
}
