import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LuArrowUpRight, LuBell } from "react-icons/lu"
import { alertInstrument } from "@/core/alerts"
import { channelLadder } from "@/core/calc/channels"
import { isoDateInZone } from "@/core/dates"
import { formatDateTimeET, formatInstrument, formatPercent, formatPrice } from "@/core/format"
import { requireViewer } from "@/lib/auth/guards"
import { getAlert, listFeedAlerts } from "@/lib/data/alerts"
import { getTrade } from "@/lib/data/journal"
import { getMemberSettings } from "@/lib/data/settings"
import { getTicker, getTickerBars } from "@/lib/data/tools"
import { Signed, Stat, ToneBadge } from "@/components/portal/display"
import { JournalForm } from "@/components/portal/journal/journal-form"
import { PrivateNote } from "@/components/portal/journal/private-note"
import { Screenshots } from "@/components/portal/journal/screenshots"
import { CloseTradeButton, DeleteTradeButton } from "@/components/portal/journal/trade-actions"
import { PageHeader } from "@/components/portal/page-header"
import { PriceChart, type ChartLevel, type ChartMarker } from "@/components/portal/stock/price-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Trade" }

const SOURCE_LABEL = { broker: "From your brokerage", manual: "Added by hand", csv: "Imported from CSV" } as const

function holding(openedAt: Date, closedAt: Date | null): string {
  const ms = (closedAt ?? new Date()).getTime() - openedAt.getTime()
  const hours = ms / 3_600_000
  const text = hours < 24 ? `${Math.max(1, Math.round(hours))} hours` : `${Math.round(hours / 24)} days`
  return closedAt ? text : `${text} so far`
}

export default async function TradePage({ params }: PageProps<"/members/journal/[tradeId]">) {
  const { tradeId } = await params
  const viewer = await requireViewer(`/members/journal/${tradeId}`)
  const trade = await getTrade(viewer.uid, tradeId)
  if (!trade) notFound()
  const editable = viewer.hasAccess
  const instrument = alertInstrument(trade)
  const title = instrument ? formatInstrument(instrument) : trade.symbol
  const [settings, ticker, barsDoc, linkedAlert, symbolAlerts] = await Promise.all([
    getMemberSettings(),
    viewer.hasAccess ? getTicker(trade.symbol) : Promise.resolve(null),
    viewer.hasAccess ? getTickerBars(trade.symbol) : Promise.resolve(null),
    trade.alertId && viewer.hasAccess ? getAlert(trade.alertId) : Promise.resolve(null),
    viewer.hasAccess ? listFeedAlerts({ window: 200 }) : Promise.resolve([]),
  ])
  const alerts = symbolAlerts
    .filter((a) => a.symbol === trade.symbol && a.parentId === null)
    .map((a) => ({ id: a.id, title: `${a.title} (${a.publishedAt ? isoDateInZone(a.publishedAt) : ""})` }))
  if (linkedAlert && !alerts.some((a) => a.id === linkedAlert.id))
    alerts.unshift({ id: linkedAlert.id, title: linkedAlert.title })

  // From a month before the trade to three weeks after it closed.
  const windowStart = isoDateInZone(new Date(trade.openedAt.getTime() - 30 * 86_400_000))
  const windowEnd = trade.closedAt ? isoDateInZone(new Date(trade.closedAt.getTime() + 21 * 86_400_000)) : "9999-12-31"
  const chartBars = (barsDoc?.bars ?? []).filter((b) => b.date >= windowStart && b.date <= windowEnd)
  const ladder =
    ticker?.metrics && ticker.channelSize !== null && ticker.bocSize !== null
      ? channelLadder(ticker.metrics.lastClose, { ch: ticker.channelSize, boc: ticker.bocSize })
      : null
  const levels: ChartLevel[] =
    ladder?.lines.flatMap((v, i) =>
      v === null
        ? []
        : [{ value: v, label: i === 4 ? "Anchor" : "", kind: i === 4 ? ("anchor" as const) : ("line" as const) }],
    ) ?? []
  const markers: ChartMarker[] = trade.fills.map((f) => ({
    date: isoDateInZone(new Date(f.executedAt)),
    kind: f.side === "buy" ? "my-buy" : "my-sell",
    text: `${f.side === "buy" ? "Buy" : "Sell"} ${f.quantity} @ ${f.price}`,
  }))
  const multiplier = trade.assetType === "option" ? 100 : 1

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{title}</span>}
        meta={
          <>
            <ToneBadge tone={trade.status === "open" ? "neutral" : "muted"}>
              {trade.status === "open" ? "Open" : "Closed"}
            </ToneBadge>
            <span className="capitalize">{trade.direction}</span>
            <span>{SOURCE_LABEL[trade.source]}</span>
            {trade.alertId && (
              <Link
                href={`/members/alerts/${trade.alertId}`}
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ToneBadge tone="positive">
                  <LuBell aria-hidden="true" />
                  Followed an HG alert
                </ToneBadge>
              </Link>
            )}
          </>
        }
        actions={
          editable && trade.source !== "broker" ? (
            <>
              {trade.status === "open" && (
                <CloseTradeButton
                  tradeId={trade.id}
                  openQuantity={trade.quantity}
                  isOption={trade.assetType === "option"}
                />
              )}
              <DeleteTradeButton tradeId={trade.id} />
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              <Stat
                label="Realized P&L"
                value={trade.realizedPnl === null ? "-" : <Signed value={trade.realizedPnl} as="money" />}
                hint={trade.status === "open" && trade.realizedPnl !== null ? "From partial exits" : undefined}
              />
              <Stat
                label="Return"
                value={trade.returnPct === null ? "-" : <Signed value={trade.returnPct} digits={1} />}
              />
              <Stat
                label={trade.assetType === "option" ? "Contracts" : "Shares"}
                value={trade.quantity}
                hint={`Avg in ${formatPrice(trade.avgEntry)}${trade.avgExit !== null ? ` · out ${formatPrice(trade.avgExit)}` : ""}`}
              />
              <Stat
                label="Held"
                value={<span className="text-lg">{holding(trade.openedAt, trade.closedAt)}</span>}
                hint={`Fees ${formatPrice(trade.fees)}`}
              />
            </CardContent>
          </Card>

          {viewer.hasAccess && chartBars.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{trade.symbol} around this trade</CardTitle>
                <CardDescription>
                  Daily candles with today&apos;s channel lines. Dots mark your fills
                  {trade.assetType === "option" ? " (the option premium itself is not on this chart)" : ""}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PriceChart bars={chartBars} levels={levels} markers={markers} height={300} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Journal</CardTitle>
              <CardDescription>
                Your setup, thesis, plan and lessons. Admins can read this to coach you; the private note below stays
                private.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JournalForm
                tradeId={trade.id}
                editable={editable}
                setupTags={settings.setupTags}
                alerts={alerts}
                initial={{
                  setup: trade.setup,
                  thesis: trade.thesis,
                  plan: trade.plan,
                  outcome: trade.outcome,
                  lesson: trade.lesson,
                  emotions: trade.emotions,
                  rating: trade.rating,
                  tags: trade.tags,
                  alertId: trade.alertId,
                }}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Fills</CardTitle>
              <CardDescription>{trade.fills.length} executions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-0">When</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="px-0 text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trade.fills.map((f) => (
                    <TableRow key={f.id} className="hover:bg-transparent">
                      <TableCell className="px-0 text-xs text-muted-foreground">
                        {formatDateTimeET(new Date(f.executedAt))}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={f.side === "buy" ? "positive" : "negative"}>
                          {f.side === "buy" ? "Buy" : "Sell"}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.quantity}</TableCell>
                      <TableCell className="px-0 text-right tabular-nums">{formatPrice(f.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Cost basis {formatPrice(trade.avgEntry * trade.quantity * multiplier)}
                {trade.assetType === "option" && " (100 shares per contract)"}
                {trade.returnPct !== null && ` · ${formatPercent(trade.returnPct, { digits: 1 })} on cost`}
              </p>
            </CardContent>
          </Card>

          {linkedAlert && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LuBell className="size-4" />
                  HG&apos;s alert
                </CardTitle>
                <CardDescription className="font-mono">{linkedAlert.title}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {linkedAlert.resultPct !== null && (
                  <p className="text-sm">
                    HG&apos;s result <Signed value={linkedAlert.resultPct} digits={1} />
                    {trade.returnPct !== null && (
                      <>
                        {" "}
                        · yours <Signed value={trade.returnPct} digits={1} />
                      </>
                    )}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/members/alerts/${linkedAlert.id}`} />}
                  nativeButton={false}
                >
                  Open the alert
                  <LuArrowUpRight />
                </Button>
              </CardContent>
            </Card>
          )}

          <Card size="sm">
            <CardHeader>
              <CardTitle>Screenshots</CardTitle>
            </CardHeader>
            <CardContent>
              <Screenshots uid={viewer.uid} tradeId={trade.id} paths={trade.screenshots} editable={editable} />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Private note</CardTitle>
            </CardHeader>
            <CardContent>
              <PrivateNote uid={viewer.uid} tradeId={trade.id} editable={editable} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
