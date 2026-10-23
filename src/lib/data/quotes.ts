import "server-only"
import type { IsoDate, LiveQuote, OptionChain } from "@/core/domain/types"
import { fetchOptionChain, fetchSnapshots } from "@/server/market/provider"
import { marketDataConfig } from "@/lib/env.server"

/** Quotes are shared by every member on this server for this long, so many open pages cost one request. */
const TTL_MS = 15_000
const cache = new Map<string, { at: number; quote: LiveQuote | null }>()

function prune(now: number) {
  if (cache.size < 5_000) return
  for (const [ticker, hit] of cache) if (now - hit.at > 10 * TTL_MS) cache.delete(ticker)
}

/**
 * The latest quotes for stocks and option contracts (up to 250 tickers), or null when no market data
 * provider is set up. Tickers the provider does not know are left out. When the provider fails, the
 * last quotes this server saw are returned.
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
      const fresh = await fetchSnapshots(config, stale)
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
 * market data provider is set up; when the provider fails, the last chain this server saw, if any.
 */
export async function optionChain(request: {
  symbol: string
  expiry: IsoDate
  minStrike: number
  maxStrike: number
}): Promise<{ chain: OptionChain | null } | null> {
  const config = marketDataConfig()
  if (!config) return null
  const key = `${request.symbol}|${request.expiry}|${request.minStrike}|${request.maxStrike}`
  const now = Date.now()
  const hit = chains.get(key)
  if (hit && now - hit.at <= TTL_MS) return { chain: hit.chain }
  try {
    const chain = await fetchOptionChain(config, request)
    chains.set(key, { at: now, chain })
    if (chains.size > 500) for (const [k, v] of chains) if (now - v.at > 10 * TTL_MS) chains.delete(k)
    return { chain }
  } catch (error) {
    console.error("Options chain failed:", error instanceof Error ? error.message : error)
    return { chain: hit?.chain ?? null }
  }
}
