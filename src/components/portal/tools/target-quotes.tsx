"use client"

import Link from "next/link"
import { useMemo } from "react"
import { LuArrowUpRight, LuBell } from "react-icons/lu"
import type { LiveQuote } from "@/core/domain/types"
import {
  formatDateWithWeekday,
  formatLevel,
  formatPercent,
  formatPrice,
  formatShortDate,
  formatTimeET,
} from "@/core/format"
import { useIsMobile } from "@/hooks/use-mobile"
import { useLiveQuotes } from "@/hooks/use-live-quotes"
import { cn } from "@/lib/utils"
import { ButtonLink } from "@/components/shared/button-link"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ToneBadge } from "../display"
import { LiveDot, sessionLabel } from "./live-dot"
import { OptionChainTable } from "./option-chain"
import { StatusBadge, type PricedRow } from "./target-status"

function QuoteRow({
  label,
  quote,
  emptyLabel,
  format,
}: {
  label: string
  quote: LiveQuote | undefined
  emptyLabel: string
  format: (value: number | null) => string
}) {
  if (!quote)
    return (
      <tr className="border-t">
        <th scope="row" className="py-2.5 pr-3 text-left font-medium">
          {label}
        </th>
        <td colSpan={3} className="py-2.5 text-right text-muted-foreground">
          {emptyLabel}
        </td>
      </tr>
    )
  const cell = (value: number | null, size?: number | null) => (
    <td className="py-2.5 pl-3 text-right tabular-nums">
      <span className="block font-medium">{format(value)}</span>
      {size ? <span className="block text-xs text-muted-foreground">x {size.toLocaleString("en-US")}</span> : null}
    </td>
  )
  return (
    <tr className="border-t align-top">
      <th scope="row" className="py-2.5 pr-3 text-left font-medium">
        {label}
      </th>
      {cell(quote.bid, quote.bidSize)}
      {cell(quote.ask, quote.askSize)}
      {cell(quote.last)}
    </tr>
  )
}

/** "Price is 2.0% above the target and 3.6% above the break." */
function distances(price: number, row: { target: number; breakLevel: number }): string {
  const side = (level: number, name: string) => {
    const pct = formatPercent(Math.abs(price - level) / level, { digits: 1, signed: false })
    if (price === level) return `at the ${name}`
    return `${pct} ${price > level ? "above" : "below"} the ${name}`
  }
  return `Price is ${side(row.target, "target")} and ${side(row.breakLevel, "break")}.`
}

/**
 * The detail of one strike target, opened from Strike Price Targets: HG's levels, the stock's live order
 * book (bid, ask and last), the options chain around HG's strikes, and the links.
 */
export function TargetQuotes({
  row,
  groupName,
  live,
  onClose,
}: {
  row: PricedRow | null
  groupName: string | null
  live: boolean
  onClose: () => void
}) {
  const mobile = useIsMobile()
  const symbols = useMemo(() => (row ? [row.symbol] : []), [row])
  const { quotes, receivedAt } = useLiveQuotes(symbols, { enabled: live && row !== null, intervalMs: 10_000 })
  const stock = row ? quotes[row.symbol] : undefined
  const price = row ? (stock?.last ?? row.price) : null

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={mobile ? "bottom" : "right"}
        className={cn("gap-0 overflow-y-auto", mobile ? "max-h-[88svh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        {row && (
          <>
            <SheetHeader className="gap-1 border-b pr-12">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
                <span className="font-mono">{row.symbol}</span>
                <StatusBadge status={row.status} />
              </SheetTitle>
              <SheetDescription>{[row.name, groupName].filter(Boolean).join(" · ")}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <dl className="grid grid-cols-3 gap-2">
                {[
                  ["Target", row.target],
                  ["Break of", row.breakLevel],
                  ["Put", row.putStrike],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-xl font-semibold tracking-tight tabular-nums">
                      {formatLevel(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="-mt-3 text-sm text-muted-foreground">
                Expires {formatDateWithWeekday(row.expiry)}
                {row.dowWeight !== null && ` · Dow weight ${formatLevel(row.dowWeight)}%`}
              </p>

              <section className="flex flex-col gap-2" aria-labelledby="order-book">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 id="order-book" className="text-sm font-semibold">
                    {live ? "Order book" : "Price"}
                  </h3>
                  {stock && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LiveDot status={stock.marketStatus} />
                      {sessionLabel(stock.marketStatus, stock.realTime)}
                      {stock.updatedAt
                        ? ` · ${formatTimeET(new Date(stock.updatedAt))}`
                        : receivedAt
                          ? ` · ${formatTimeET(new Date(receivedAt))}`
                          : ""}
                    </span>
                  )}
                </div>
                {live ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th scope="col" className="pb-1.5 text-left font-normal">
                          <span className="sr-only">Instrument</span>
                        </th>
                        <th scope="col" className="pb-1.5 text-right font-normal">
                          Bid
                        </th>
                        <th scope="col" className="pb-1.5 text-right font-normal">
                          Ask
                        </th>
                        <th scope="col" className="pb-1.5 text-right font-normal">
                          Last
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <QuoteRow
                        label={`${row.symbol} shares`}
                        quote={stock}
                        emptyLabel={receivedAt ? "No quote" : "Loading"}
                        format={formatLevel}
                      />
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm">
                    Last close <span className="font-semibold tabular-nums">{formatPrice(row.lastClose)}</span>
                    {row.lastCloseDate && (
                      <span className="text-muted-foreground"> on {formatShortDate(row.lastCloseDate)}</span>
                    )}
                  </p>
                )}
                {price !== null && (
                  <p className="text-xs text-muted-foreground tabular-nums">{distances(price, row)}</p>
                )}
              </section>

              <OptionChainTable
                symbol={row.symbol}
                expiry={row.expiry}
                target={row.target}
                putStrike={row.putStrike}
                price={price}
                live={live}
              />

              <div className="flex flex-wrap items-center gap-2">
                <ButtonLink size="sm" variant="outline" href={`/members/stocks/${row.symbol}`}>
                  {row.symbol} stock page
                  <LuArrowUpRight />
                </ButtonLink>
                {row.alertId && (
                  <ButtonLink size="sm" variant="outline" href={`/members/alerts/${row.alertId}`}>
                    <LuBell />
                    HG alert
                  </ButtonLink>
                )}
                {row.etf && (
                  <Link
                    href="/members/etfs"
                    className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ToneBadge tone="muted">2x ETF {row.etf}</ToneBadge>
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
