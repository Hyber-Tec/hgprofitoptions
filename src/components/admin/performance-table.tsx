"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { LuDownload } from "react-icons/lu"
import { formatPercent, formatPrice } from "@/core/format"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Signed, ToneBadge } from "@/components/portal/display"
import { SortHead, compareValues, toggleSort, type SortState } from "@/components/portal/tools/sort-head"

export interface PerformanceRow {
  uid: string
  fullName: string
  status: string
  active: boolean
  linked: "yes" | "no" | "error"
  accounts: number
  value: number | null
  week: number | null
  month: number | null
  qtd: number | null
  ytd: number | null
  realizedQtd: number | null
  winRate: number | null
  trades: number
  followedPct: number | null
  drawdown: number | null
  lastSync: string | null
  lastLogin: string | null
}

type SortKey =
  | "fullName"
  | "value"
  | "week"
  | "month"
  | "qtd"
  | "ytd"
  | "realizedQtd"
  | "winRate"
  | "trades"
  | "followedPct"
  | "drawdown"

const PRESETS = [
  { value: "active", label: "Active members" },
  { value: "all", label: "Everyone" },
  { value: "drawdown", label: "Drawdown worse than -15%" },
  { value: "unlinked", label: "Not linked" },
  { value: "idle", label: "No closed trades this quarter" },
  { value: "reconnect", label: "Needs reconnecting" },
]

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

export function PerformanceTable({ rows }: { rows: PerformanceRow[] }) {
  const [preset, setPreset] = useState("active")
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "qtd", dir: -1 })
  const filtered = useMemo(
    () =>
      rows
        .filter((r) => {
          switch (preset) {
            case "active":
              return r.active
            case "drawdown":
              return r.drawdown !== null && r.drawdown < -0.15
            case "unlinked":
              return r.active && r.linked === "no"
            case "idle":
              return r.active && r.trades === 0
            case "reconnect":
              return r.linked === "error"
            default:
              return true
          }
        })
        .sort((a, b) =>
          compareValues(
            a[sort.key] ?? (sort.dir === 1 ? Infinity : -Infinity),
            b[sort.key] ?? (sort.dir === 1 ? Infinity : -Infinity),
            sort.dir,
          ),
        ),
    [rows, preset, sort],
  )
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))

  const exportCsv = () => {
    const header = [
      "name",
      "status",
      "linked",
      "accounts",
      "value",
      "return_1w",
      "return_1m",
      "return_qtd",
      "return_ytd",
      "realized_qtd",
      "win_rate_qtd",
      "trades_qtd",
      "followed_hg_alerts",
      "max_drawdown_qtd",
      "last_sync",
      "last_login",
    ]
    const cell = (v: string | number | null) =>
      v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    const lines = filtered.map((r) =>
      [
        r.fullName,
        r.status,
        r.linked,
        r.accounts,
        r.value,
        r.week,
        r.month,
        r.qtd,
        r.ytd,
        r.realizedQtd,
        r.winRate,
        r.trades,
        r.followedPct,
        r.drawdown,
        r.lastSync,
        r.lastLogin,
      ]
        .map(cell)
        .join(","),
    )
    const url = URL.createObjectURL(
      new Blob([`﻿${[header.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" }),
    )
    const a = document.createElement("a")
    a.href = url
    a.download = "hg-member-performance.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select items={PRESETS} value={preset} onValueChange={(v: string | null) => setPreset(v ?? "active")}>
          <SelectTrigger size="sm" className="w-64" aria-label="Filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <LuDownload />
          Export CSV
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortHead label="Member" sortKey="fullName" sort={sort} onSort={onSort} />
              <TableHead>Linked</TableHead>
              <SortHead label="Value" sortKey="value" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="1W" sortKey="week" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="1M" sortKey="month" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="QTD" sortKey="qtd" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="YTD" sortKey="ytd" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="Realized QTD" sortKey="realizedQtd" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="Win rate" sortKey="winRate" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="Trades" sortKey="trades" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="HG alerts" sortKey="followedPct" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="Drawdown" sortKey="drawdown" sort={sort} onSort={onSort} className="text-right" />
              <TableHead>Synced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.uid}>
                <TableCell>
                  <Link
                    href={`/admin/members/${r.uid}?tab=performance`}
                    className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {r.fullName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{r.status}</span>
                </TableCell>
                <TableCell>
                  <ToneBadge tone={r.linked === "yes" ? "positive" : r.linked === "error" ? "warning" : "muted"}>
                    {r.linked === "yes" ? `${r.accounts} acct` : r.linked === "error" ? "Reconnect" : "No"}
                  </ToneBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.value === null ? "-" : formatPrice(r.value).replace(/\.\d{2}$/, "")}
                </TableCell>
                {([r.week, r.month, r.qtd, r.ytd] as const).map((v, i) => (
                  <TableCell key={i} className="text-right">
                    {v === null ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <Signed value={v} digits={1} icon={false} />
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {r.realizedQtd === null ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <Signed value={r.realizedQtd} as="money" icon={false} />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.winRate === null ? "-" : formatPercent(r.winRate, { signed: false, digits: 0 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.trades}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.followedPct === null ? "-" : formatPercent(r.followedPct, { signed: false, digits: 0 })}
                </TableCell>
                <TableCell className="text-right">
                  {r.drawdown === null ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <Signed value={r.drawdown} digits={1} icon={false} />
                  )}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {r.lastSync ? DATE.format(new Date(r.lastSync)) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} members. Returns are time-weighted from linked accounts; trade stats come from journals. Click
        a name for their full portfolio (viewing is recorded in the audit log).
      </p>
    </div>
  )
}
