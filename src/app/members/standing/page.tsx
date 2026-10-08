import type { Metadata } from "next"
import Link from "next/link"
import { LuShieldCheck, LuUsers } from "react-icons/lu"
import { isoDateInZone } from "@/core/dates"
import { MIN_COHORT } from "@/core/calc/standing"
import { parseInstrumentKey } from "@/core/calc/trades"
import { formatDateTimeET, formatInstrument, formatPercent, formatPrice, formatShortDate } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getStanding } from "@/lib/data/tools"
import { EquityCurve, MonthlyBars } from "@/components/portal/charts"
import { Signed, Stat } from "@/components/portal/display"
import { AsOf, PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "HG standing" }

const RETURN_LABELS = [
  ["week", "1W"],
  ["month", "1M"],
  ["qtd", "Quarter"],
  ["ytd", "Year"],
  ["all", "All time"],
] as const

export default async function StandingPage() {
  await requireActiveMember("/members/standing")
  const standing = await getStanding()
  const hg = standing?.hgPortfolio ?? null
  const record = standing?.alertsTrackRecord
  const community = standing?.community ?? null
  const curve = hg?.curve.map((p) => ({ date: p.date, value: p.index - 1 })) ?? []

  return (
    <>
      <PageHeader
        title="HG standing"
        description="How HG's own portfolio and published alerts are doing, and how the community is doing as a whole."
        meta={standing && <AsOf>Updated {formatDateTimeET(standing.computedAt)}</AsOf>}
      />

      <Card>
        <CardHeader>
          <CardTitle>HG&apos;s portfolio</CardTitle>
          <CardDescription>
            Time-weighted returns of HG&apos;s own linked accounts, so deposits and withdrawals do not count as
            performance.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {hg ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {RETURN_LABELS.map(([key, label]) => (
                  <div key={key} className="rounded-lg border px-3 py-2.5">
                    <Stat label={label} value={<Signed value={hg.returns[key]} />} />
                  </div>
                ))}
              </div>
              <EquityCurve points={curve} format="percent" label="Growth" />
              {hg.value !== null && (
                <p className="text-sm text-muted-foreground">Account value {formatPrice(hg.value)}</p>
              )}
            </>
          ) : (
            <Empty className="border border-dashed py-12">
              <EmptyHeader>
                <EmptyTitle>Not shared yet</EmptyTitle>
                <EmptyDescription>HG&apos;s portfolio appears here once his accounts are linked.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      {hg && (hg.positions !== null || hg.closedTrades !== null) && (
        <div
          className={
            hg.positions !== null && hg.closedTrades !== null ? "grid gap-6 lg:grid-cols-2" : "grid gap-6 lg:max-w-2xl"
          }
        >
          {hg.positions !== null && (
            <Card>
              <CardHeader>
                <CardTitle>Open positions</CardTitle>
                <CardDescription>By weight in the portfolio</CardDescription>
              </CardHeader>
              <CardContent>
                {hg.positions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open positions.</p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Position</TableHead>
                          <TableHead className="text-right">Weight</TableHead>
                          {hg.positions.some((p) => p.marketValue !== null) && (
                            <TableHead className="text-right">Value</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...hg.positions]
                          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
                          .map((p) => (
                            <TableRow key={p.instrumentKey}>
                              <TableCell>
                                <Link
                                  href={`/members/stocks/${p.symbol}`}
                                  className="rounded-sm font-mono text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  {(() => {
                                    const instrument = parseInstrumentKey(p.instrumentKey)
                                    return instrument ? formatInstrument(instrument) : p.instrumentKey
                                  })()}
                                </Link>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPercent(p.weight, { signed: false, digits: 1 })}
                              </TableCell>
                              {p.marketValue !== null && (
                                <TableCell className="text-right tabular-nums">{formatPrice(p.marketValue)}</TableCell>
                              )}
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {hg.closedTrades !== null && (
            <Card>
              <CardHeader>
                <CardTitle>Recently closed trades</CardTitle>
              </CardHeader>
              <CardContent>
                {hg.closedTrades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No closed trades yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {hg.closedTrades.slice(0, 10).map((t) => {
                      const instrument = parseInstrumentKey(t.instrumentKey)
                      return (
                        <li
                          key={`${t.instrumentKey}-${t.closedAt}`}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-sm">
                              {instrument ? formatInstrument(instrument) : t.instrumentKey}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Closed {t.closedAt ? formatShortDate(isoDateInZone(new Date(t.closedAt))) : ""}
                            </span>
                          </span>
                          <span className="flex flex-col items-end">
                            <Signed value={t.returnPct} digits={1} />
                            {t.realizedPnl !== null && (
                              <Signed value={t.realizedPnl} as="money" icon={false} className="text-xs" />
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alerts track record</CardTitle>
          <CardDescription>
            Every closed buy alert, scored from HG&apos;s published buy point and sell points, not from anyone&apos;s
            fills.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Closed alerts" value={record?.closed ?? 0} />
            <Stat
              label="Win rate"
              value={record?.winRate == null ? "-" : formatPercent(record.winRate, { signed: false, digits: 0 })}
              hint={record ? `${record.wins} winners` : undefined}
            />
            <Stat label="Average result" value={<Signed value={record?.averageReturn ?? null} digits={1} />} />
            <Stat label="Median result" value={<Signed value={record?.medianReturn ?? null} digits={1} />} />
          </div>
          {record && record.byMonth.length > 0 ? (
            <MonthlyBars
              data={record.byMonth.map((m) => ({ month: m.month, value: m.averageReturn ?? 0, count: m.closed }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              The monthly breakdown appears after the first closed alerts.
            </p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <LuShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Method: the entry is the midpoint of the published buy point; exits are the published sell points, weighted
            by the portion sold. Options results are on the premium.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Community standing</CardTitle>
          <CardDescription>Anonymized results of members with a linked brokerage, this quarter.</CardDescription>
        </CardHeader>
        <CardContent>
          {community ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Members included" value={community.members} />
              <Stat
                label="Members in the green"
                value={formatPercent(community.pctGreen, { signed: false, digits: 0 })}
              />
              <Stat label="Median return" value={<Signed value={community.medianReturn} digits={1} />} />
              <Stat label="Average return" value={<Signed value={community.averageReturn} digits={1} />} />
              <Stat
                label="Average win rate"
                value={
                  community.averageWinRate === null
                    ? "-"
                    : formatPercent(community.averageWinRate, { signed: false, digits: 0 })
                }
              />
              <Stat label="Trades closed" value={community.totalTrades} />
            </div>
          ) : (
            <Empty className="border border-dashed py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LuUsers />
                </EmptyMedia>
                <EmptyTitle>Not enough members yet</EmptyTitle>
                <EmptyDescription>
                  Community numbers appear once at least {MIN_COHORT} members have linked a brokerage, so nobody can be
                  identified.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Past performance does not guarantee future results. Results are not typical. Educational content, not
        personalized investment advice.
      </p>
    </>
  )
}
