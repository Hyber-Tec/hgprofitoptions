import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LuArrowUpRight, LuCalendarClock, LuLayers } from "react-icons/lu"
import { alertInstrument } from "@/core/alerts"
import { channelLadder, nearestLevels } from "@/core/calc/channels"
import { medians } from "@/core/calc/medians"
import { daysBetween, isoDateInZone, todayInMarketZone } from "@/core/dates"
import {
  formatDate,
  formatExpiry,
  formatInstrument,
  formatLevel,
  formatPercent,
  formatPrice,
  formatShortDate,
  formatSigned,
} from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { listFeedAlerts } from "@/lib/data/alerts"
import { listTrades } from "@/lib/data/journal"
import {
  getEtfConfig,
  getTargetGroups,
  getTicker,
  getTickerBars,
  getWeek,
  listTargetUpdates,
  listWeeks,
} from "@/lib/data/tools"
import { AlertCard, toAlertView } from "@/components/portal/alerts/alert-card"
import { Signed, Stat, ToneBadge } from "@/components/portal/display"
import { AsOf, PageHeader } from "@/components/portal/page-header"
import { ChannelLadder, LadderTable, type LadderLevel } from "@/components/portal/stock/channel-ladder"
import { PriceChart, type ChartLevel, type ChartMarker } from "@/components/portal/stock/price-chart"
import { Watermark } from "@/components/portal/watermark"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export async function generateMetadata({ params }: PageProps<"/members/stocks/[symbol]">): Promise<Metadata> {
  const { symbol } = await params
  return { title: decodeURIComponent(symbol).toUpperCase() }
}

export default async function StockPage({ params }: PageProps<"/members/stocks/[symbol]">) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase()
  const viewer = await requireActiveMember(`/members/stocks/${symbol}`)
  const ticker = await getTicker(symbol)
  if (!ticker) notFound()

  const [barsDoc, weeksList, updates, groups, etfs, alerts, trades] = await Promise.all([
    getTickerBars(symbol),
    listWeeks(),
    listTargetUpdates(),
    getTargetGroups(),
    getEtfConfig(),
    listFeedAlerts({ window: 200 }),
    listTrades(viewer.uid),
  ])
  const weekDocs = (await Promise.all(weeksList.slice(0, 8).map((w) => getWeek(w.weekStart)))).filter((w) => w !== null)
  const weekly = weekDocs.flatMap((w) =>
    w.rows[symbol] ? [{ weekStart: w.weekStart, weekEnd: w.weekEnd, ...w.rows[symbol] }] : [],
  )
  const latestWeek = weekly[0]
  const groupName = new Map(groups.map((g) => [g.slug, g.shortName]))
  const history = updates.flatMap((u) =>
    u.entries.filter((e) => e.symbol === symbol).map((e) => ({ ...e, effectiveDate: u.effectiveDate })),
  )
  const currentTarget = history[0]?.effectiveDate === updates[0]?.effectiveDate ? history[0] : undefined
  const etf = etfs.pairs.find((p) => p.underlying === symbol)
  const underlying = etfs.pairs.find((p) => p.etf === symbol)
  const myAlerts = alerts.filter((a) => a.symbol === symbol)
  const rootAlerts = myAlerts.filter((a) => a.parentId === null)
  const myTrades = trades.filter((t) => t.symbol === symbol)

  const metrics = ticker.metrics
  const price = metrics?.price ?? metrics?.lastClose ?? latestWeek?.close ?? null
  const m = metrics ? medians(metrics) : { m5: null, m30: null, m90: null }
  const ladder =
    metrics && ticker.channelSize !== null && ticker.bocSize !== null
      ? channelLadder(metrics.lastClose, { ch: ticker.channelSize, boc: ticker.bocSize })
      : null
  const near = ladder && price !== null ? nearestLevels(price, ladder) : null
  const today = todayInMarketZone()
  const earningsIn =
    ticker.earningsStart && ticker.earningsEnd && ticker.earningsEnd >= today
      ? Math.max(0, daysBetween(today, ticker.earningsStart))
      : null

  const ladderLevels: LadderLevel[] = []
  if (ladder) {
    ladder.lines.forEach((v, i) => {
      if (v !== null)
        ladderLevels.push({
          value: v,
          kind: i === 4 ? "anchor" : "line",
          label: i === 4 ? "Last close (anchor)" : `Line ${i - 4 > 0 ? "+" : ""}${i - 4}`,
        })
    })
    ladder.bocAbove.forEach(
      (v, i) => v !== null && ladderLevels.push({ value: v, kind: "boc", label: `BOC +${i + 1}` }),
    )
    ladder.bocBelow.forEach(
      (v, i) => v !== null && ladderLevels.push({ value: v, kind: "boc", label: `BOC -${i + 1}` }),
    )
  }
  if (m.m5 !== null) ladderLevels.push({ value: m.m5, kind: "median", label: "5D" })
  if (m.m30 !== null) ladderLevels.push({ value: m.m30, kind: "median", label: "30D" })
  if (m.m90 !== null) ladderLevels.push({ value: m.m90, kind: "median", label: "90D" })
  ticker.fsLevels.forEach((v) => ladderLevels.push({ value: v, kind: "fs", label: "FS" }))
  ticker.ssLevels.forEach((v) => ladderLevels.push({ value: v, kind: "ss", label: "SS" }))
  if (currentTarget) {
    ladderLevels.push({ value: currentTarget.target, kind: "target", label: "Target" })
    ladderLevels.push({ value: currentTarget.breakLevel, kind: "break", label: "Break" })
    ladderLevels.push({ value: currentTarget.putStrike, kind: "put", label: "Put" })
  }

  const bars = (barsDoc?.bars ?? []).slice(-90)
  const chartLevels: ChartLevel[] = [
    ...(ladder?.lines.flatMap((v, i) =>
      v === null
        ? []
        : [{ value: v, label: i === 4 ? "Anchor" : "", kind: i === 4 ? ("anchor" as const) : ("line" as const) }],
    ) ?? []),
    ...(m.m30 !== null ? [{ value: m.m30, label: "30D", kind: "median" as const }] : []),
    ...(currentTarget ? [{ value: currentTarget.target, label: "Target", kind: "target" as const }] : []),
  ]
  const markers: ChartMarker[] = []
  for (const a of myAlerts) {
    if (a.parentId !== null) continue
    if (a.kind === "buy" && a.publishedAt)
      markers.push({ date: isoDateInZone(a.publishedAt), kind: "hg-buy", text: "HG buy" })
    for (const exit of a.exits) markers.push({ date: isoDateInZone(exit.at), kind: "hg-sell", text: "HG sell" })
  }
  for (const t of myTrades) {
    for (const f of t.fills)
      markers.push({
        date: isoDateInZone(new Date(f.executedAt)),
        kind: f.side === "buy" ? "my-buy" : "my-sell",
        text: f.side === "buy" ? "My buy" : "My sell",
      })
  }

  return (
    <>
      <Watermark text={viewer.email} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono">{symbol}</span>
            {ticker.name && <span className="text-base font-normal text-muted-foreground">{ticker.name}</span>}
          </span>
        }
        meta={
          <>
            {price !== null && (
              <span className="text-base font-semibold text-foreground tabular-nums">{formatPrice(price)}</span>
            )}
            {latestWeek && (
              <span className="inline-flex items-center gap-1">
                <Signed value={(latestWeek.close - latestWeek.pfcp) / latestWeek.pfcp} /> week of{" "}
                {formatShortDate(latestWeek.weekStart)}
              </span>
            )}
            {(currentTarget ? [currentTarget.group] : []).map((g) => (
              <ToneBadge key={g} tone="neutral">
                {groupName.get(g) ?? g}
              </ToneBadge>
            ))}
            {etf && (
              <ToneBadge tone="muted">
                <LuLayers aria-hidden="true" />
                2x {etf.etf}
              </ToneBadge>
            )}
            {underlying && <ToneBadge tone="muted">2x ETF of {underlying.underlying}</ToneBadge>}
            {earningsIn !== null && (
              <ToneBadge tone={earningsIn <= 7 ? "warning" : "muted"}>
                <LuCalendarClock aria-hidden="true" />
                {earningsIn === 0 ? "Earnings now" : `Earnings in ${earningsIn} d`}
              </ToneBadge>
            )}
            {metrics && <AsOf>As of {formatDate(metrics.asOf)}</AsOf>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <Stat
              label="Channel / BOC"
              value={
                ticker.channelSize !== null && ticker.bocSize !== null
                  ? `${ticker.channelSize.toFixed(2)} / ${ticker.bocSize.toFixed(2)}`
                  : "-"
              }
              hint={
                ticker.bocSize !== null && ticker.channelSize
                  ? `BOC is ${formatPercent(ticker.bocSize / ticker.channelSize, { signed: false, digits: 0 })} of CH`
                  : undefined
              }
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Medians 5D / 30D / 90D"
              value={<span className="text-lg">{[m.m5, m.m30, m.m90].map((v) => formatLevel(v)).join(" / ")}</span>}
              hint={
                m.m30 !== null && price !== null ? `${price >= m.m30 ? "Above" : "Below"} the 30-day median` : undefined
              }
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Next line up / down"
              value={
                <span className="text-lg">
                  {near ? `${formatLevel(near.above)} / ${formatLevel(near.below)}` : "-"}
                </span>
              }
              hint={
                near && price !== null && near.above !== null && near.below !== null
                  ? `${formatPercent((near.above - price) / price, { digits: 1 })} / ${formatPercent((near.below - price) / price, { digits: 1 })}`
                  : undefined
              }
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Last week"
              value={latestWeek ? <Signed value={latestWeek.svi} /> : "-"}
              hint={latestWeek ? `SVI · range ${formatSigned(latestWeek.range)}` : "No weekly data"}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Price</CardTitle>
            <CardDescription>
              Last 90 trading days with channel lines, the 30-day median and HG&apos;s target. Arrows are HG&apos;s
              alerts; dots are your fills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bars.length > 0 ? (
              <PriceChart bars={bars} levels={chartLevels} markers={markers} />
            ) : (
              <Empty className="border border-dashed py-16">
                <EmptyHeader>
                  <EmptyTitle>No price history yet</EmptyTitle>
                  <EmptyDescription>Daily prices appear once market data is connected.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Channel ladder</CardTitle>
            <CardDescription>
              Lines around the last close, BOC levels, medians, FS and SS levels and the current target.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {price !== null && ladderLevels.length > 0 ? (
              <>
                <ChannelLadder price={price} levels={ladderLevels} />
                <Collapsible>
                  <CollapsibleTrigger
                    render={
                      <button
                        type="button"
                        className="text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    }
                  >
                    Show every level as a table
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <LadderTable price={price} levels={ladderLevels} />
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No channel settings for this ticker yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {ticker.notes && (
        <Card>
          <CardHeader>
            <CardTitle>HG&apos;s notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{ticker.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Key Market Data</CardTitle>
            <CardDescription>{weekly.length === 1 ? "Last week" : `Last ${weekly.length || 8} weeks`}</CardDescription>
          </CardHeader>
          <CardContent>
            {weekly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weekly data for {symbol} yet.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Week</TableHead>
                      <TableHead className="text-right">Close</TableHead>
                      <TableHead className="text-right">Chg %</TableHead>
                      <TableHead className="text-right">Range</TableHead>
                      <TableHead className="text-right">SVI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weekly.map((w) => (
                      <TableRow key={w.weekStart}>
                        <TableCell>{formatShortDate(w.weekStart)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatLevel(w.close)}</TableCell>
                        <TableCell className="text-right">
                          <Signed value={(w.close - w.pfcp) / w.pfcp} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatSigned(w.range)}</TableCell>
                        <TableCell className="text-right">
                          <Signed value={w.svi} icon={false} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Strike target history</CardTitle>
            <CardDescription>Every update that included {symbol}</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{symbol} has not been on the strike targets list.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Update</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Break</TableHead>
                      <TableHead className="text-right">Put</TableHead>
                      <TableHead className="text-right">Exp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={`${h.effectiveDate}-${h.group}`}>
                        <TableCell>
                          <Link
                            href={`/members/targets/${h.effectiveDate}`}
                            className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {formatShortDate(h.effectiveDate)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{groupName.get(h.group) ?? h.group}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatLevel(h.target)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatLevel(h.breakLevel)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatLevel(h.putStrike)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatExpiry(h.expiry)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>HG&apos;s alerts on {symbol}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rootAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts on {symbol} yet.</p>
            ) : (
              rootAlerts.slice(0, 6).map((a) => <AlertCard key={a.id} alert={toAlertView(a)} compact />)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My trades on {symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            {myTrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no journal trades on {symbol}.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {myTrades.slice(0, 10).map((t) => {
                  const instrument = alertInstrument(t)
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/members/journal/${t.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm">
                            {instrument ? formatInstrument(instrument) : t.symbol}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatShortDate(isoDateInZone(t.openedAt))}
                            {t.closedAt ? ` to ${formatShortDate(isoDateInZone(t.closedAt))}` : " · open"}
                          </span>
                        </span>
                        {t.status === "closed" ? (
                          <Signed value={t.realizedPnl} as="money" />
                        ) : (
                          <ToneBadge tone="neutral">Open</ToneBadge>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Link
        href="/members/channels"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Compare with every ticker on the Median & Channel Chart
        <LuArrowUpRight className="size-4" />
      </Link>
    </>
  )
}
