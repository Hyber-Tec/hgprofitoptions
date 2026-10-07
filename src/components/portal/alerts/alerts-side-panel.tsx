import Link from "next/link"
import { LuBellRing } from "react-icons/lu"
import { formatPercent, formatPrice } from "@/core/format"
import type { AlertDoc, StandingDoc } from "@/server/model"
import type { TickerRecord } from "@/lib/data/tools"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RelativeTime } from "@/components/shared/relative-time"
import { Signed, Stat } from "../display"

/** Open trades and HG's track record next to the alerts feed. */
export function AlertsSidePanel({
  open,
  standing,
  tickers,
}: {
  open: AlertDoc[]
  standing: StandingDoc | null
  tickers: Map<string, TickerRecord>
}) {
  const record = standing?.alertsTrackRecord
  return (
    <aside className="flex flex-col gap-6 xl:sticky xl:top-20">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Open alerts</CardTitle>
          <CardDescription>
            {open.length === 0
              ? "No open trades right now."
              : `${open.length} open ${open.length === 1 ? "trade" : "trades"}`}
          </CardDescription>
        </CardHeader>
        {open.length > 0 && (
          <CardContent className="flex flex-col gap-1">
            {open.map((a) => {
              const last = a.symbol ? tickers.get(a.symbol)?.metrics?.lastClose : undefined
              return (
                <Link
                  key={a.id}
                  href={`/members/alerts/${a.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-medium">{a.symbol}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.publishedAt && <RelativeTime iso={a.publishedAt.toISOString()} />}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    {last !== undefined ? `Last ${formatPrice(last)}` : ""}
                  </span>
                </Link>
              )
            })}
          </CardContent>
        )}
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Track record</CardTitle>
          <CardDescription>Closed alerts, from HG&apos;s published buy and sell points</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Stat
            label="Win rate"
            value={record?.winRate == null ? "-" : formatPercent(record.winRate, { signed: false, digits: 0 })}
            hint={`${record?.closed ?? 0} closed`}
          />
          <Stat
            label="Average"
            value={<Signed value={record?.averageReturn ?? null} digits={1} />}
            hint={
              record?.medianReturn == null ? undefined : `Median ${formatPercent(record.medianReturn, { digits: 1 })}`
            }
          />
        </CardContent>
      </Card>
      <Button variant="outline" render={<Link href="/members/settings/notifications" />} nativeButton={false}>
        <LuBellRing />
        Notification settings
      </Button>
    </aside>
  )
}
