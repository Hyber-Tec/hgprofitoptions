import type { Metadata } from "next"
import { median } from "@/core/calc/standing"
import { formatPercent } from "@/core/format"
import { quarterLabel, quarterOf } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import { requireAdmin } from "@/lib/auth/guards"
import { listMemberRows } from "@/lib/data/admin"
import { PerformanceTable, type PerformanceRow } from "@/components/admin/performance-table"
import { Histogram } from "@/components/portal/charts"
import { Signed } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Member performance" }

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< -20%", min: -Infinity, max: -0.2 },
  { label: "-20 to -10", min: -0.2, max: -0.1 },
  { label: "-10 to -5", min: -0.1, max: -0.05 },
  { label: "-5 to 0", min: -0.05, max: 0 },
  { label: "0 to 5", min: 0, max: 0.05 },
  { label: "5 to 10", min: 0.05, max: 0.1 },
  { label: "10 to 20", min: 0.1, max: 0.2 },
  { label: "> 20%", min: 0.2, max: Infinity },
]

export default async function AdminPerformancePage() {
  await requireAdmin({ next: "/admin/performance" })
  const rows = (await listMemberRows()).filter((r) => r.member.role === "member")
  const tableRows: PerformanceRow[] = rows.map(({ member, status }) => ({
    uid: member.uid,
    fullName: member.fullName,
    status: membershipSummary(status).status,
    active: status.kind === "active",
    linked: member.brokerage.status === "needs_reauth" ? "error" : member.brokerage.linked ? "yes" : "no",
    accounts: member.brokerage.linked ? 1 : 0,
    value: member.stats?.portfolioValue ?? null,
    week: member.stats?.weekReturn ?? null,
    month: member.stats?.monthReturn ?? null,
    qtd: member.stats?.qtdReturn ?? null,
    ytd: member.stats?.ytdReturn ?? null,
    realizedQtd: member.stats?.realizedQtd ?? null,
    winRate: member.stats?.winRateQtd ?? null,
    trades: member.stats?.tradesQtd ?? 0,
    followedPct: member.stats?.followedAlertsPct ?? null,
    drawdown: member.stats?.maxDrawdownQtd ?? null,
    lastSync: member.brokerage.lastSyncedAt?.toISOString() ?? null,
    lastLogin: member.lastLoginAt?.toISOString() ?? null,
  }))
  const returns = tableRows.filter((r) => r.active && r.qtd !== null).map((r) => r.qtd ?? 0)
  const buckets = BUCKETS.map((b) => ({
    label: b.label,
    count: returns.filter((r) => r >= b.min && r < b.max).length,
    positive: b.min >= 0,
  }))
  // Keyed by year*10+quarter so the table sorts by time, not by label text.
  const cohorts = new Map<number, { label: string; values: number[] }>()
  for (const { member } of rows) {
    if (!member.memberSince || member.stats?.qtdReturn == null) continue
    const q = quarterOf(member.memberSince)
    const key = q.year * 10 + q.q
    const entry = cohorts.get(key) ?? { label: quarterLabel(q.year, q.q), values: [] }
    entry.values.push(member.stats.qtdReturn)
    cohorts.set(key, entry)
  }

  return (
    <>
      <PageHeader
        title="Member performance"
        description="How every member is doing this quarter, so you can help the ones who need it before their next one-on-one."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Quarter-to-date returns</CardTitle>
            <CardDescription>
              {returns.length} active members with linked accounts · median{" "}
              <Signed value={median(returns)} digits={1} /> ·{" "}
              {returns.length > 0
                ? formatPercent(returns.filter((r) => r > 0).length / returns.length, { signed: false, digits: 0 })
                : "-"}{" "}
              in the green
            </CardDescription>
          </CardHeader>
          <CardContent>
            {returns.length > 0 ? (
              <Histogram buckets={buckets} />
            ) : (
              <p className="text-sm text-muted-foreground">No linked members yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By join quarter</CardTitle>
            <CardDescription>Median quarter-to-date return by when members joined</CardDescription>
          </CardHeader>
          <CardContent>
            {cohorts.size === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-0">Joined</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="px-0 text-right">Median QTD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...cohorts.entries()]
                    .sort(([a], [b]) => b - a)
                    .map(([key, { label, values }]) => (
                      <TableRow key={key} className="hover:bg-transparent">
                        <TableCell className="px-0 font-medium">{label}</TableCell>
                        <TableCell className="text-right tabular-nums">{values.length}</TableCell>
                        <TableCell className="px-0 text-right">
                          <Signed value={median(values)} digits={1} />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <PerformanceTable rows={tableRows} />
    </>
  )
}
