"use client"

import { formatLevel, formatTimeET } from "@/core/format"
import { useLiveQuotes } from "@/hooks/use-live-quotes"
import { Signed } from "../display"
import { LiveDot, sessionLabel } from "../tools/live-dot"

export interface PulseRow {
  symbol: string
  name: string
  /** The week's close and its gap vs the Friday before, from Key Market Data. */
  close: number | null
  gapPct: number | null
}

/**
 * The indexes: their live level and today's move while the market is trading (when market data includes
 * the indexes), else the last week's close and its change on the week.
 */
export function MarketPulseRows({ rows, live }: { rows: PulseRow[]; live: boolean }) {
  const { quotes } = useLiveQuotes(
    rows.map((r) => r.symbol),
    { enabled: live },
  )
  const sample = rows.map((r) => quotes[r.symbol]).find((q) => q !== undefined)
  const trading = sample !== undefined && sample.marketStatus !== "closed"
  return (
    <>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => {
          const quote = trading ? quotes[row.symbol] : undefined
          const today =
            quote?.last !== null && quote?.last !== undefined && quote.previousClose
              ? (quote.last - quote.previousClose) / quote.previousClose
              : null
          return (
            <li key={row.symbol} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{row.symbol}</p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1.5 text-sm font-medium tabular-nums">
                  {quote && <LiveDot status={quote.marketStatus} />}
                  {formatLevel(quote?.last ?? row.close)}
                </p>
                <Signed value={quote ? today : row.gapPct} className="text-xs" />
              </div>
            </li>
          )
        })}
      </ul>
      {trading && (
        <p className="text-xs text-muted-foreground">
          Today, {sessionLabel(sample.marketStatus, sample.realTime).toLowerCase()}
          {sample.updatedAt ? ` · ${formatTimeET(new Date(sample.updatedAt))}` : ""}
        </p>
      )}
    </>
  )
}
