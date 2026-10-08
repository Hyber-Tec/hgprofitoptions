import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { LuCircleAlert } from "react-icons/lu"
import { alertInstrument } from "@/core/alerts"
import { isoDateInZone, todayInMarketZone } from "@/core/dates"
import { formatInstrument, formatPercent, formatPrice } from "@/core/format"
import { growthIndex } from "@/core/calc/returns"
import { requireViewer } from "@/lib/auth/guards"
import { brokerageConfig } from "@/lib/env.server"
import { adminDb } from "@/lib/firebase/admin"
import { listTrades } from "@/lib/data/journal"
import { portfolioSeries, readAccounts, readConnections, readHoldings, returnsBlock } from "@/server/portfolio"
import { AllocationChart, EquityCurve, MonthlyBars } from "@/components/portal/charts"
import { Signed, Stat, ToneBadge } from "@/components/portal/display"
import { AsOf, PageHeader } from "@/components/portal/page-header"
import {
  ConnectBrokerage,
  IncludeAccountSwitch,
  RefreshButton,
  SyncAfterConnect,
} from "@/components/portal/portfolio/brokerage-controls"
import { RelativeTime } from "@/components/shared/relative-time"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Portfolio" }

const RETURN_LABELS = [
  ["week", "1W"],
  ["month", "1M"],
  ["qtd", "Quarter"],
  ["ytd", "Year"],
  ["all", "All"],
] as const

const BROKERS = ["Webull", "Schwab", "Fidelity", "Robinhood", "Interactive Brokers", "E*TRADE", "and more"]

export default async function PortfolioPage() {
  const viewer = await requireViewer("/members/portfolio")
  const available = brokerageConfig() !== null && viewer.hasAccess
  const db = adminDb()
  const [connections, accounts, { series }, trades] = await Promise.all([
    readConnections(db, viewer.uid),
    readAccounts(db, viewer.uid),
    portfolioSeries(db, viewer.uid),
    listTrades(viewer.uid, { status: "closed" }),
  ])
  const holdings = (
    await Promise.all(
      accounts
        .filter((a) => a.included)
        .map(async (a) => (await readHoldings(db, viewer.uid, a.id)).map((h) => ({ ...h, accountId: a.id }))),
    )
  ).flat()
  const linked = accounts.length > 0
  const today = todayInMarketZone()
  const returns = returnsBlock(series, today)
  const latest = series.at(-1)
  const totalCash = accounts.filter((a) => a.included).reduce((s, a) => s + (a.balance?.cash ?? 0), 0)
  const reauth = connections.filter((c) => c.status === "needs_reauth")
  const lastSync = accounts
    .map((a) => a.lastSyncedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  // Realized P&L by month, from closed trades.
  const byMonth = new Map<string, { value: number; count: number }>()
  for (const t of trades) {
    if (!t.closedAt || t.realizedPnl === null) continue
    const month = isoDateInZone(t.closedAt).slice(0, 7)
    const entry = byMonth.get(month) ?? { value: 0, count: 0 }
    byMonth.set(month, { value: entry.value + t.realizedPnl, count: entry.count + 1 })
  }
  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, v]) => ({ month, value: Math.round(v.value * 100) / 100, count: v.count }))

  // Holdings grouped by underlying.
  const groups = new Map<string, typeof holdings>()
  for (const h of holdings) groups.set(h.symbol, [...(groups.get(h.symbol) ?? []), h])
  const allocation = [...groups.entries()].map(([name, list]) => ({
    name,
    value: list.reduce((s, h) => s + Math.abs(h.marketValue ?? 0), 0),
  }))

  return (
    <>
      <Suspense>
        <SyncAfterConnect />
      </Suspense>
      <PageHeader
        title="My portfolio"
        description={
          linked
            ? "Your linked accounts, read-only. Returns are time-weighted, so deposits and withdrawals do not count as performance."
            : "Link your brokerage to see holdings, balances and returns. HG Profit Options never places trades."
        }
        meta={
          lastSync && (
            <AsOf>
              Last synced <RelativeTime iso={lastSync.toISOString()} />
            </AsOf>
          )
        }
        actions={linked ? <RefreshButton available={available} /> : undefined}
      />

      {reauth.map((c) => (
        <Alert key={c.id} className="border-warning/40">
          <LuCircleAlert className="text-warning" />
          <AlertTitle>{c.brokerageName} needs you to sign in again</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            Brokers expire connections from time to time. Reconnect to keep your journal and performance up to date.
            <ConnectBrokerage available={available} reconnectId={c.id} label={`Reconnect ${c.brokerageName}`} />
          </AlertDescription>
        </Alert>
      ))}

      {!linked && (
        <Card>
          <CardHeader>
            <CardTitle>Connect your brokerage</CardTitle>
            <CardDescription>Read-only, through SnapTrade. Supports {BROKERS.join(", ")}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectBrokerage available={available} />
          </CardContent>
        </Card>
      )}

      {linked && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm">
              <CardContent>
                <Stat
                  label="Total value"
                  value={formatPrice(latest?.value ?? null)}
                  hint={`Cash ${formatPrice(totalCash)}`}
                />
              </CardContent>
            </Card>
            <Card size="sm" className="sm:col-span-1 lg:col-span-3">
              <CardContent className="grid grid-cols-3 gap-4 sm:grid-cols-5">
                {RETURN_LABELS.map(([key, label]) => (
                  <Stat key={key} label={label} value={<Signed value={returns[key]} />} />
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
              <CardDescription>Time-weighted growth of the accounts included in your stats, day by day</CardDescription>
            </CardHeader>
            <CardContent>
              {series.length > 1 ? (
                <EquityCurve
                  points={growthIndex(series).map((p) => ({ date: p.date, value: p.index - 1 }))}
                  format="percent"
                  label="Growth"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Your curve builds up one day at a time after linking.</p>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Holdings</CardTitle>
                <CardDescription>
                  {holdings.length} positions across {groups.size} underlyings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {holdings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open positions.</p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Position</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Avg cost</TableHead>
                          <TableHead className="text-right">Last</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead className="text-right">Unrealized</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...groups.entries()]
                          .sort(
                            ([, a], [, b]) =>
                              b.reduce((s, h) => s + (h.marketValue ?? 0), 0) -
                              a.reduce((s, h) => s + (h.marketValue ?? 0), 0),
                          )
                          .flatMap(([symbol, list]) =>
                            list.map((h, i) => {
                              const multiplier = h.assetType === "option" ? 100 : 1
                              const cost = h.avgCost !== null ? h.avgCost * h.quantity * multiplier : null
                              const pnl = cost !== null && h.marketValue !== null ? h.marketValue - cost : null
                              const instrument = alertInstrument(h)
                              return (
                                <TableRow key={`${h.accountId}-${h.id}`}>
                                  <TableCell>
                                    {i === 0 ? (
                                      <Link
                                        href={`/members/stocks/${symbol}`}
                                        className="rounded-sm font-mono text-[13px] font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                                      >
                                        {instrument ? formatInstrument(instrument) : symbol}
                                      </Link>
                                    ) : (
                                      <span className="font-mono text-[13px]">
                                        {instrument ? formatInstrument(instrument) : symbol}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{h.quantity}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatPrice(h.avgCost)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatPrice(h.lastPrice)}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatPrice(h.marketValue)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className="flex flex-col items-end">
                                      <Signed value={pnl} as="money" icon={false} />
                                      <span className="text-xs text-muted-foreground">
                                        {cost ? formatPercent((pnl ?? 0) / cost, { digits: 1 }) : ""}
                                      </span>
                                    </span>
                                  </TableCell>
                                </TableRow>
                              )
                            }),
                          )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Allocation</CardTitle>
                <CardDescription>By underlying, market value</CardDescription>
              </CardHeader>
              <CardContent>
                {allocation.length > 0 ? (
                  <AllocationChart slices={allocation} />
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>
                Excluded accounts stay linked but do not count toward your stats or what HG sees.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {accounts.map((a) => {
                  const connection = connections.find((c) => c.id === a.connectionId)
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {connection?.brokerageName ?? "Brokerage"} · {a.name ?? "Account"}
                          {a.numberMask && <span className="text-muted-foreground"> ••{a.numberMask}</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatPrice(a.balance?.total ?? null)}
                          {connection?.status === "needs_reauth" && " · needs reconnecting"}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        Include in my stats
                        <IncludeAccountSwitch accountId={a.id} included={a.included} />
                      </label>
                    </li>
                  )
                })}
              </ul>
              <ButtonLink variant="link" className="mt-2 px-0" href="/members/settings/brokerages">
                Manage connections
              </ButtonLink>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Realized P&L by month</CardTitle>
          <CardDescription>
            {linked ? "From your brokerage trades and anything you added by hand" : "From the trades in your journal"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthly.length > 0 ? (
            <MonthlyBars data={monthly} format="money" label="Realized P&L" />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">No closed trades yet.</p>
              {viewer.hasAccess && (
                <ButtonLink variant="outline" size="sm" href="/members/journal/new">
                  Add a trade by hand
                </ButtonLink>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {!linked && viewer.member.stats?.realizedQtd != null && (
        <p className="text-sm text-muted-foreground">
          Realized this quarter <Signed value={viewer.member.stats.realizedQtd} as="money" />{" "}
          <ToneBadge tone="muted">from your journal</ToneBadge>
        </p>
      )}
    </>
  )
}
