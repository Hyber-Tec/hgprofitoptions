import "server-only"
import type { IsoDate, LiveQuote, OptionChain } from "@/core/domain/types"
import { INDEX_PROVIDER_TICKERS, isIndexSymbol } from "@/core/indices"
import { fetchIndexSnapshots, fetchOptionChain, fetchSnapshots } from "@/server/market/provider"
import { marketDataConfig } from "@/lib/env.server"

/** Quotes are shared by every member on this server for this long, so many open pages cost one request. */
const TTL_MS = 15_000
const cache = new Map<string, { at: number; quote: LiveQuote | null }>()

function prune(now: number) {
  if (cache.size < 5_000) return
  for (const [ticker, hit] of cache) if (now - hit.at > 10 * TTL_MS) cache.delete(ticker)
}

/** Fresh quotes for stocks, option contracts and the indexes (DJI, SPX, IXIC), which come from their own snapshot. */
async function fetchQuotes(config: NonNullable<ReturnType<typeof marketDataConfig>>, tickers: readonly string[]) {
  const indexes = tickers.filter(isIndexSymbol)
  const others = tickers.filter((t) => !isIndexSymbol(t))
  const fresh = others.length > 0 ? await fetchSnapshots(config, others) : new Map<string, LiveQuote>()
  if (indexes.length > 0) {
    const levels = await fetchIndexSnapshots(
      config,
      indexes.map((s) => INDEX_PROVIDER_TICKERS[s]),
    )
    for (const symbol of indexes) {
      const level = levels.get(INDEX_PROVIDER_TICKERS[symbol])
      if (level) fresh.set(symbol, { ...level, ticker: symbol })
    }
  }
  return fresh
}

/**
 * The latest quotes for stocks, option contracts and the indexes (up to 250 tickers), or null when no
 * market data provider is set up. Tickers the provider does not know (or the plan does not include) are
 * left out. When the provider fails, the last quotes this server saw are returned.
 */
export async function liveQuotes(tickers: readonly string[]): Promise<Record<string, LiveQuote> | null> {
  const config = marketDataConfig()
  if (!config) return null
  const now = Date.now()
  const stale = tickers.filter((t) => {
    const hit = cache.get(t)
    return !hit || now - hit.at > TTL_MS
  })
  if (stale.length > 0) {
    try {
      const fresh = await fetchQuotes(config, stale)
      for (const t of stale) cache.set(t, { at: now, quote: fresh.get(t) ?? null })
      prune(now)
    } catch (error) {
      console.error("Live quotes failed:", error instanceof Error ? error.message : error)
    }
  }
  const out: Record<string, LiveQuote> = {}
  for (const t of tickers) {
    const quote = cache.get(t)?.quote
    if (quote) out[t] = quote
  }
  return out
}

const chains = new Map<string, { at: number; chain: OptionChain }>()

/**
 * The options chain for one expiry and strike range, shared like quotes for 15 seconds. Null when no
 * market data provider is set up; when the provider fails, the last chain this server saw, if any, and
 * `failed` so the page can say so.
 */
export async function optionChain(request: {
  symbol: string
  expiry: IsoDate
  minStrike: number
  maxStrike: number
}): Promise<{ chain: OptionChain | null; failed: boolean } | null> {
  const config = marketDataConfig()
  if (!config) return null
  const key = `${request.symbol}|${request.expiry}|${request.minStrike}|${request.maxStrike}`
  const now = Date.now()
  const hit = chains.get(key)
  if (hit && now - hit.at <= TTL_MS) return { chain: hit.chain, failed: false }
  try {
    const chain = await fetchOptionChain(config, request)
    chains.set(key, { at: now, chain })
    if (chains.size > 500) for (const [k, v] of chains) if (now - v.at > 10 * TTL_MS) chains.delete(k)
    return { chain, failed: false }
  } catch (error) {
    console.error("Options chain failed:", error instanceof Error ? error.message : error)
    return { chain: hit?.chain ?? null, failed: hit === undefined }
  }
}
