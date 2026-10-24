/**
 * Market data from a Massive (formerly Polygon.io) compatible REST API (MARKET_DATA_BASE_URL).
 *
 * Daily bars are the regular session: under the consolidated trade rules, extended-hours trades (Form T)
 * update neither the high and low nor the last price, so a bar's close is the 4 PM close. Bars are split
 * adjusted. One grouped request returns every US stock's bar for a session, so a daily run costs one call.
 */
import { z } from "zod"
import { isoDateInZone } from "@/core/dates"
import type {
  ChainQuote,
  ChainStrike,
  DailyBar,
  IntradayBar,
  IsoDate,
  LiveQuote,
  OptionChain,
} from "@/core/domain/types"

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
  // A path, or a next_url the provider returned; only ever the provider's own address.
  const url = new URL(path, config.baseUrl)
  if (url.origin !== new URL(config.baseUrl).origin)
    throw new MarketDataError(`Market data request for ${what} pointed elsewhere`, 0)
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

/**
 * One ticker's daily bars from `from` to `to` (inclusive), oldest first: split-adjusted for a stock, the
 * index level for an index ticker ("I:SPX", which takes no adjustment).
 */
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
    symbol.startsWith("I:") ? { sort: "asc", limit: "50000" } : { adjusted: "true", sort: "asc", limit: "50000" },
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

/**
 * A ticker's bars of `minutes` minutes from `from` to `to` (inclusive dates), oldest first. Index bars
 * skip minutes in which the index did not move, so there can be gaps.
 */
export async function fetchIntradayBars(
  config: MarketDataConfig,
  symbol: string,
  minutes: number,
  from: IsoDate,
  to: IsoDate,
  fetchImpl: typeof fetch = fetch,
): Promise<IntradayBar[]> {
  const body = await getJson(
    config,
    `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${String(minutes)}/minute/${from}/${to}`,
    symbol.startsWith("I:") ? { sort: "asc", limit: "50000" } : { adjusted: "true", sort: "asc", limit: "50000" },
    fetchImpl,
    `${symbol} intraday`,
  )
  return (rangeSchema.parse(body).results ?? []).map((r) => ({
    at: r.t,
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

const indexSnapshotSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            ticker: z.string(),
            error: z.string().nullish(),
            value: z.number().nullish(),
            market_status: z.string().nullish(),
            timeframe: z.string().nullish(),
            last_updated: z.number().nullish(),
            session: z.object({ previous_close: z.number().nullish() }).loose().nullish(),
          })
          .loose(),
      )
      .nullish(),
  })
  .loose()

/** An index's market status, in the words the stock snapshots use. */
const INDEX_MARKET_STATUS: Record<string, LiveQuote["marketStatus"]> = {
  regular_trading: "open",
  open: "open",
  closed: "closed",
  early_trading: "early_trading",
  late_trading: "late_trading",
}

/**
 * The latest level of each index ("I:DJI"), from the indices snapshot (Indices Starter plans and up; 15
 * minutes delayed on Starter). Indexes the plan does not include are left out.
 */
export async function fetchIndexSnapshots(
  config: MarketDataConfig,
  tickers: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, LiveQuote>> {
  const body = await getJson(
    config,
    "/v3/snapshot/indices",
    { "ticker.any_of": tickers.join(","), limit: "250" },
    fetchImpl,
    "index levels",
    { timeoutMs: 15_000 },
  )
  const quotes = new Map<string, LiveQuote>()
  for (const r of indexSnapshotSchema.parse(body).results ?? []) {
    if (r.error || r.value === null || r.value === undefined) continue
    quotes.set(r.ticker, {
      ticker: r.ticker,
      last: r.value,
      bid: null,
      ask: null,
      bidSize: null,
      askSize: null,
      previousClose: r.session?.previous_close ?? null,
      updatedAt: nanosToMillis(r.last_updated),
      realTime: r.timeframe === "REAL-TIME",
      marketStatus: INDEX_MARKET_STATUS[r.market_status ?? ""] ?? null,
    })
  }
  return quotes
}

const chainQuoteSchema = z
  .object({
    details: z.object({ contract_type: z.string(), strike_price: z.number() }).loose(),
    last_quote: z
      .object({
        bid: z.number().nullish(),
        ask: z.number().nullish(),
        last_updated: z.number().nullish(),
        timeframe: z.string().nullish(),
      })
      .loose()
      .nullish(),
    last_trade: z
      .object({ price: z.number().nullish(), sip_timestamp: z.number().nullish(), timeframe: z.string().nullish() })
      .loose()
      .nullish(),
    day: z.object({ close: z.number().nullish(), volume: z.number().nullish() }).loose().nullish(),
    open_interest: z.number().nullish(),
    underlying_asset: z.object({ price: z.number().nullish() }).loose().nullish(),
  })
  .loose()

const chainSchema = z.object({ results: z.array(chainQuoteSchema).nullish(), next_url: z.string().nullish() }).loose()

/**
 * The calls and puts for one expiry with strikes from `minStrike` to `maxStrike`, from the provider's
 * option chain snapshot (Options Starter plans and up; bid and ask only when the plan includes quotes).
 */
export async function fetchOptionChain(
  config: MarketDataConfig,
  request: { symbol: string; expiry: IsoDate; minStrike: number; maxStrike: number },
  fetchImpl: typeof fetch = fetch,
): Promise<OptionChain> {
  const strikes = new Map<number, ChainStrike>()
  let underlying: number | null = null
  let updatedAt: number | null = null
  let realTime = false
  let next: string | null = `/v3/snapshot/options/${encodeURIComponent(request.symbol)}`
  let params: Record<string, string> = {
    expiration_date: request.expiry,
    "strike_price.gte": String(request.minStrike),
    "strike_price.lte": String(request.maxStrike),
    sort: "strike_price",
    order: "asc",
    limit: "250",
  }
  // A wide range is a few pages at most.
  for (let page = 0; next && page < 4; page++) {
    const body = await getJson(config, next, params, fetchImpl, `the ${request.symbol} options chain`, {
      timeoutMs: 15_000,
      notFound: "empty",
    })
    const parsed = chainSchema.parse(body)
    for (const r of parsed.results ?? []) {
      const strike = r.details.strike_price
      const quote: ChainQuote = {
        bid: r.last_quote?.bid ?? null,
        ask: r.last_quote?.ask ?? null,
        last: r.last_trade?.price ?? r.day?.close ?? null,
        volume: r.day?.volume ?? null,
        openInterest: r.open_interest ?? null,
      }
      const row = strikes.get(strike) ?? { strike, call: null, put: null }
      if (r.details.contract_type === "call") row.call = quote
      else if (r.details.contract_type === "put") row.put = quote
      strikes.set(strike, row)
      underlying ??= r.underlying_asset?.price ?? null
      const at = nanosToMillis(r.last_quote?.last_updated ?? r.last_trade?.sip_timestamp)
      if (at !== null && (updatedAt === null || at > updatedAt)) updatedAt = at
      realTime ||= (r.last_quote?.timeframe ?? r.last_trade?.timeframe) === "REAL-TIME"
    }
    next = parsed.next_url ?? null
    params = {}
  }
  return {
    symbol: request.symbol,
    expiry: request.expiry,
    strikes: [...strikes.values()].sort((a, b) => a.strike - b.strike),
    underlying,
    realTime,
    updatedAt,
  }
}
