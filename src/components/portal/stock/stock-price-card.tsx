"use client"

import { useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { INTRADAY_EMA_PERIOD } from "@/core/intraday"
import { useUpdateSearchParams } from "@/hooks/use-update-search-params"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { IntradayChart } from "./intraday-chart"

type View = "90d" | "5d"

/**
 * A stock's price chart: the last 90 days with HG's levels, or (?chart=5d) the last five sessions in
 * 5-minute candles with VWAP and an EMA, the view HG studies spikes on.
 */
export function StockPriceCard({
  symbol,
  daily,
  dailyDescription,
  spikes,
}: {
  symbol: string
  /** The daily chart, rendered on the server's data. */
  daily: ReactNode
  dailyDescription: ReactNode
  /** Spike prices to mark on the 5-day chart. */
  spikes: { price: number; label: string }[]
}) {
  const view: View = useSearchParams().get("chart") === "5d" ? "5d" : "90d"
  const [update] = useUpdateSearchParams({ clientOnly: true })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Price</CardTitle>
        <CardDescription>
          {view === "90d"
            ? dailyDescription
            : `The last five sessions in 5-minute candles, with VWAP and the ${String(INTRADAY_EMA_PERIOD)}-bar EMA.`}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[view]}
            onValueChange={(v: string[]) => v[0] && update({ chart: v[0] === "5d" ? "5d" : null })}
            aria-label="Chart"
          >
            <ToggleGroupItem value="90d">90 days</ToggleGroupItem>
            <ToggleGroupItem value="5d">5 days</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>{view === "90d" ? daily : <IntradayChart symbol={symbol} spikes={spikes} />}</CardContent>
    </Card>
  )
}
