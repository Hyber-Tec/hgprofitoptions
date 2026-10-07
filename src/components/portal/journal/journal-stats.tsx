import { addDays, dayOfWeek, isoDateInZone, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { dailyPnl, journalStats } from "@/core/calc/journal-stats"
import { formatPercent, formatSignedMoney } from "@/core/format"
import type { TradeDoc } from "@/server/model"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EquityCurve } from "../charts"
import { Signed, Stat } from "../display"

type Closed = TradeDoc & { closedAt: Date; realizedPnl: number }

const closedOnly = (trades: readonly TradeDoc[]): Closed[] =>
  trades.filter((t): t is Closed => t.status === "closed" && t.closedAt !== null && t.realizedPnl !== null)

const toStatInput = (t: Closed) => ({ realizedPnl: t.realizedPnl, closedAt: t.closedAt.toISOString() })

function Breakdown({
  title,
  rows,
}: {
  title: string
  rows: { key: string; trades: number; winRate: number | null; pnl: number }[]
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed trades yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-0">
                  {title.replace("By ", "").replace(/^\w/, (c) => c.toUpperCase())}
                </TableHead>
                <TableHead className="h-8 text-right">Trades</TableHead>
                <TableHead className="h-8 text-right">Win rate</TableHead>
                <TableHead className="h-8 px-0 text-right">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key} className="hover:bg-transparent">
                  <TableCell className="px-0 font-medium">{r.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.trades}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.winRate === null ? "-" : formatPercent(r.winRate, { signed: false, digits: 0 })}
                  </TableCell>
                  <TableCell className="px-0 text-right">
                    <Signed value={r.pnl} as="money" icon={false} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function group(trades: readonly Closed[], keyOf: (t: Closed) => string[]) {
  const map = new Map<string, Closed[]>()
  for (const t of trades) for (const k of keyOf(t)) map.set(k, [...(map.get(k) ?? []), t])
  return [...map.entries()]
    .map(([key, list]) => {
      const s = journalStats(list.map(toStatInput))
      return { key, trades: list.length, winRate: s.winRate, pnl: s.totalPnl }
    })
    .sort((a, b) => b.pnl - a.pnl)
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function JournalStatsView({ trades }: { trades: readonly TradeDoc[] }) {
  const closed = closedOnly(trades)
  const stats = journalStats(closed.map(toStatInput))
  const ordered = [...closed].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
  const curve = ordered.reduce<{ date: string; value: number }[]>((points, t) => {
    const previous = points.at(-1)?.value ?? 0
    points.push({ date: isoDateInZone(t.closedAt), value: Math.round((previous + t.realizedPnl) * 100) / 100 })
    return points
  }, [])
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Closed trades", String(stats.trades)],
          ["Win rate", stats.winRate === null ? "-" : formatPercent(stats.winRate, { signed: false, digits: 0 })],
          ["Average win", stats.avgWin === null ? "-" : formatSignedMoney(stats.avgWin)],
          ["Average loss", stats.avgLoss === null ? "-" : formatSignedMoney(stats.avgLoss)],
          ["Profit factor", stats.profitFactor === null ? "-" : stats.profitFactor.toFixed(2)],
          ["Expectancy", stats.expectancy === null ? "-" : formatSignedMoney(stats.expectancy)],
          [
            "Best / worst",
            `${stats.best === null ? "-" : formatSignedMoney(stats.best)} / ${stats.worst === null ? "-" : formatSignedMoney(stats.worst)}`,
          ],
          ["Streaks", `${stats.maxWinStreak} W · ${stats.maxLossStreak} L`],
        ].map(([label, value]) => (
          <Card key={label} size="sm">
            <CardContent>
              <Stat label={label} value={<span className="text-lg">{value}</span>} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Realized P&L over time</CardTitle>
          <CardDescription>Cumulative, by close date · total {formatSignedMoney(stats.totalPnl)}</CardDescription>
        </CardHeader>
        <CardContent>
          {curve.length > 1 ? (
            <EquityCurve points={curve} format="signed-money" label="Realized P&L" />
          ) : (
            <p className="text-sm text-muted-foreground">The curve appears after two closed trades.</p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown title="By setup" rows={group(closed, (t) => [t.setup ?? "No setup"])} />
        <Breakdown
          title="By tag"
          rows={group(closed, (t) => (t.tags.length > 0 ? t.tags.map((x) => `#${x}`) : ["No tag"]))}
        />
        <Breakdown title="By ticker" rows={group(closed, (t) => [t.symbol]).slice(0, 12)} />
        <Breakdown
          title="By weekday"
          rows={group(closed, (t) => [WEEKDAYS[dayOfWeek(isoDateInZone(t.closedAt))] ?? ""])}
        />
      </div>
    </div>
  )
}

/** A GitHub-style calendar of daily realized P&L for the last 26 weeks. */
export function PnlHeatmap({ trades }: { trades: readonly TradeDoc[] }) {
  const closed = closedOnly(trades)
  const byDay = dailyPnl(closed.map(toStatInput), (iso) => isoDateInZone(new Date(iso)))
  const today = todayInMarketZone()
  const start = addDays(today, -(7 * 25 + dayOfWeek(today)))
  const days: IsoDate[] = []
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d)
  const max = Math.max(1, ...[...byDay.values()].map((v) => Math.abs(v)))
  const weeks: IsoDate[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  const tone = (v: number | undefined) => {
    if (v === undefined) return "bg-muted/60"
    const strength = Math.min(1, Math.abs(v) / max)
    const level = strength > 0.66 ? 3 : strength > 0.33 ? 2 : 1
    if (v > 0) return ["", "bg-positive/30", "bg-positive/60", "bg-positive"][level] ?? "bg-positive"
    if (v < 0) return ["", "bg-negative/30", "bg-negative/60", "bg-negative"][level] ?? "bg-negative"
    return "bg-muted-foreground/40"
  }
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
  const traded = [...byDay.entries()].filter(([d]) => d >= start)
  const greenDays = traded.filter(([, v]) => v > 0).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily P&L calendar</CardTitle>
        <CardDescription>
          Last 26 weeks · {traded.length} trading days with closed trades · {greenDays} green
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 overflow-x-auto">
        <div className="flex gap-1">
          <div className="mt-5 flex flex-col gap-1 pr-1 text-[10px] text-muted-foreground">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="flex h-3.5 items-center">
                {i % 2 === 1 ? d : ""}
              </span>
            ))}
          </div>
          {weeks.map((week) => {
            const first = week[0]
            const showMonth = first !== undefined && Number(first.slice(8, 10)) <= 7
            return (
              <div key={first} className="flex flex-col gap-1">
                <span className="h-4 text-[10px] whitespace-nowrap text-muted-foreground">
                  {showMonth && first ? monthLabel.format(new Date(`${first}T12:00:00Z`)) : ""}
                </span>
                {week.map((day) => {
                  const value = byDay.get(day)
                  return (
                    <span
                      key={day}
                      title={`${day}: ${value === undefined ? "no closed trades" : formatSignedMoney(value)}`}
                      className={cn("size-3.5 rounded-[3px]", tone(value))}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Loss
          {[
            "bg-negative",
            "bg-negative/60",
            "bg-negative/30",
            "bg-muted/60",
            "bg-positive/30",
            "bg-positive/60",
            "bg-positive",
          ].map((c) => (
            <span key={c} className={cn("size-3 rounded-[3px]", c)} />
          ))}
          Gain
        </div>
      </CardContent>
    </Card>
  )
}
