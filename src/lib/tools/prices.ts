import "server-only"
import type { IsoDate } from "@/core/domain/types"
import { formatDate, formatMomentET } from "@/core/format"
import { liveQuotes } from "@/lib/data/quotes"

/**
 * Each stock's price for an export: the live price when market data is connected (during the day and
 * after hours), otherwise its last close. The label says which, and when.
 */
export async function exportPrices(
  stocks: readonly { symbol: string; lastClose: number | null; asOf: IsoDate | null }[],
): Promise<{ prices: Map<string, number>; label: string }> {
  const quotes = await liveQuotes(stocks.map((s) => s.symbol))
  const prices = new Map<string, number>()
  let liveAt = 0
  for (const s of stocks) {
    const quote = quotes?.[s.symbol]
    if (quote?.last != null) {
      prices.set(s.symbol, quote.last)
      liveAt = Math.max(liveAt, quote.updatedAt ?? 0)
    } else if (s.lastClose !== null) prices.set(s.symbol, s.lastClose)
  }
  const lastClose = stocks
    .map((s) => s.asOf)
    .filter((d): d is IsoDate => d !== null)
    .sort()
    .at(-1)
  const label =
    liveAt > 0
      ? `Prices as of ${formatMomentET(new Date(liveAt))} ET`
      : lastClose
        ? `Prices from the ${formatDate(lastClose)} close`
        : "No prices yet"
  return { prices, label }
}
