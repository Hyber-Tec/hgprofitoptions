"use client"

import { Fragment, useMemo } from "react"
import type { ChainQuote, IsoDate } from "@/core/domain/types"
import { formatDateWithWeekday, formatLevel, formatPrice, formatTimeET } from "@/core/format"
import { useOptionChain } from "@/hooks/use-option-chain"
import { cn } from "@/lib/utils"

/** Option premiums are quoted to the cent. */
const premium = (value: number | null | undefined) => (value === null || value === undefined ? "-" : value.toFixed(2))
const cents = (n: number) => Math.round(n * 100) / 100

function Side({
  quote,
  highlight,
  align,
}: {
  quote: ChainQuote | null
  highlight: string | null
  align: "left" | "right"
}) {
  const cell = cn("py-2 tabular-nums", align === "right" ? "text-right" : "text-left", highlight)
  return (
    <>
      <td className={cn(cell, align === "left" ? "rounded-l-md pl-2" : "")}>{premium(quote?.bid)}</td>
      <td className={cn(cell, align === "right" ? "rounded-r-md pr-2" : "")}>{premium(quote?.ask)}</td>
    </>
  )
}

/** The strikes from two below the lowest level to two above the highest, so the list stays short. */
function aroundLevels<T extends { strike: number }>(strikes: T[], levels: number[]): T[] {
  if (strikes.length === 0) return strikes
  const low = Math.min(...levels)
  const high = Math.max(...levels)
  const first = strikes.findIndex((s) => s.strike >= low)
  const after = strikes.findIndex((s) => s.strike > high)
  const from = Math.max(0, (first === -1 ? strikes.length : first) - 2)
  const to = after === -1 ? strikes.length : Math.min(strikes.length, after + 2)
  return strikes.slice(from, to)
}

/**
 * The calls and puts around HG's levels for the target's expiry: bid and ask on each side of the strike,
 * HG's target call and put highlighted, and where the stock is trading now.
 */
export function OptionChainTable({
  symbol,
  expiry,
  target,
  putStrike,
  price,
  live,
}: {
  symbol: string
  expiry: IsoDate
  target: number
  putStrike: number
  price: number | null
  live: boolean
}) {
  // From a little below the put (or the price) to a little above the target (or the price).
  const request = useMemo(() => {
    const low = Math.min(putStrike, price ?? putStrike)
    const high = Math.max(target, price ?? target)
    return { symbol, expiry, minStrike: cents(low * 0.96), maxStrike: cents(high * 1.04) }
  }, [symbol, expiry, target, putStrike, price])
  const { chain, loaded, failed } = useOptionChain(request, { enabled: live })
  if (!live)
    return (
      <section className="flex flex-col gap-1" aria-labelledby="options-chain">
        <h3 id="options-chain" className="text-sm font-semibold">
          Options chain
        </h3>
        <p className="text-sm text-muted-foreground">Live option prices are not available right now.</p>
      </section>
    )
  const spot = chain?.underlying ?? price
  const strikes = aroundLevels(chain?.strikes ?? [], [target, putStrike, ...(spot === null ? [] : [spot])])
  // The price line goes before the first strike above the price.
  const priceIndex = spot === null ? -1 : strikes.findIndex((s) => s.strike > spot)

  return (
    <section className="flex flex-col gap-2" aria-labelledby="options-chain">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="options-chain" className="text-sm font-semibold">
          Options chain
        </h3>
        <span className="text-xs text-muted-foreground">
          Expires {formatDateWithWeekday(expiry)}
          {chain && ` · ${chain.realTime ? "Real-time" : "15 min delayed"}`}
          {chain?.updatedAt ? ` · ${formatTimeET(new Date(chain.updatedAt))}` : ""}
        </span>
      </div>
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading</p>
      ) : failed && strikes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Could not load the option prices just now. Trying again in a few seconds.
        </p>
      ) : strikes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No options are listed for this expiry yet.</p>
      ) : (
        <table className="w-full border-separate border-spacing-y-0.5 text-sm">
          <caption className="sr-only">
            {symbol} calls and puts expiring {formatDateWithWeekday(expiry)}, bid and ask
          </caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="colgroup" colSpan={2} className="pb-0.5 pl-2 text-left font-medium">
                Calls
              </th>
              <th scope="col" className="pb-0.5 text-center font-medium">
                Strike
              </th>
              <th scope="colgroup" colSpan={2} className="pr-2 pb-0.5 text-right font-medium">
                Puts
              </th>
            </tr>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="pb-1 pl-2 text-left font-normal">
                Bid
              </th>
              <th scope="col" className="pb-1 text-left font-normal">
                Ask
              </th>
              <th scope="col" className="pb-1">
                <span className="sr-only">Strike</span>
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                Bid
              </th>
              <th scope="col" className="pr-2 pb-1 text-right font-normal">
                Ask
              </th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((s, i) => {
              const isTarget = s.strike === target
              const isPut = s.strike === putStrike
              return (
                <Fragment key={s.strike}>
                  {i === priceIndex && spot !== null && (
                    <tr aria-label={`${symbol} is at ${formatPrice(spot)}`}>
                      <td colSpan={5} className="py-1">
                        <span className="flex items-center gap-2 text-xs font-medium text-primary">
                          <span className="h-px flex-1 bg-primary/40" aria-hidden="true" />
                          {symbol} {formatPrice(spot)}
                          <span className="h-px flex-1 bg-primary/40" aria-hidden="true" />
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <Side quote={s.call} align="left" highlight={isTarget ? "bg-positive/12 font-semibold" : null} />
                    <th scope="row" className="py-2 text-center font-semibold tabular-nums">
                      {formatLevel(s.strike)}
                      {(isTarget || isPut) && (
                        <span
                          className={cn(
                            "block text-[10px] font-medium tracking-wide uppercase",
                            isTarget ? "text-positive" : "text-negative",
                          )}
                        >
                          {isTarget && isPut ? "Target, put" : isTarget ? "Target" : "Put"}
                        </span>
                      )}
                    </th>
                    <Side quote={s.put} align="right" highlight={isPut ? "bg-negative/12 font-semibold" : null} />
                  </tr>
                </Fragment>
              )
            })}
            {priceIndex === -1 && spot !== null && spot > (strikes.at(-1)?.strike ?? 0) && (
              <tr aria-label={`${symbol} is at ${formatPrice(spot)}`}>
                <td colSpan={5} className="py-1">
                  <span className="flex items-center gap-2 text-xs font-medium text-primary">
                    <span className="h-px flex-1 bg-primary/40" aria-hidden="true" />
                    {symbol} {formatPrice(spot)}
                    <span className="h-px flex-1 bg-primary/40" aria-hidden="true" />
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {loaded && strikes.length > 0 && !strikes.some((s) => s.strike === target || s.strike === putStrike) && (
        <p className="text-xs text-muted-foreground">
          HG&apos;s {formatLevel(target)} call and {formatLevel(putStrike)} put are not listed for this expiry.
        </p>
      )}
    </section>
  )
}
