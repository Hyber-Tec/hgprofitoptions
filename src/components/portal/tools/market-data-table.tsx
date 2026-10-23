"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { LuSearch } from "react-icons/lu"
import { formatLevel, formatPercent, formatSigned, plural } from "@/core/format"
import type { WeekRow } from "@/lib/tools/market-data"
import { cn } from "@/lib/utils"
import { useResponsiveRows } from "@/hooks/use-responsive-rows"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { SortHead, compareValues, toggleSort, type SortState } from "./sort-head"

type SortKey = "symbol" | "pfcp" | "high" | "low" | "close" | "range" | "svi"

/** Green when the week closed above the previous Friday's close, red when below. */
const direction = (r: WeekRow) => (r.close > r.pfcp ? "text-positive" : r.close < r.pfcp ? "text-negative" : "")

export function MarketDataTable({ rows, groups }: { rows: WeekRow[]; groups: { slug: string; shortName: string }[] }) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("all")
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "symbol", dir: 1 })
  const groupItems = useMemo(
    () => [{ value: "all", label: "All categories" }, ...groups.map((g) => ({ value: g.slug, label: g.shortName }))],
    [groups],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return rows
      .filter((r) => (!q || r.symbol.includes(q)) && (group === "all" || r.categories.includes(group)))
      .sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.dir))
  }, [rows, query, group, sort])
  const { table, cards } = useResponsiveRows(filtered, "md")
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 w-full sm:w-56">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker"
            aria-label="Search ticker"
          />
        </InputGroup>
        <Select items={groupItems} value={group} onValueChange={(v: string | null) => setGroup(v ?? "all")}>
          <SelectTrigger className="w-44" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground tabular-nums">{plural(filtered.length, "ticker")}</span>
      </div>
      {filtered.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle>No tickers match</EmptyTitle>
            <EmptyDescription>Clear the search or pick another category.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden rounded-xl border md:block">
            <Table className="text-[15px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead label="Ticker" sortKey="symbol" sort={sort} onSort={onSort} />
                  <SortHead label="PFCP" sortKey="pfcp" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="High" sortKey="high" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Low" sortKey="low" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Close" sortKey="close" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Range" sortKey="range" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="SVI" sortKey="svi" sort={sort} onSort={onSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.map((r) => (
                  <TableRow key={r.symbol} className="h-12">
                    <TableCell>
                      <Link
                        href={`/members/stocks/${r.symbol}`}
                        className="rounded-sm font-mono font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {r.symbol}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatLevel(r.pfcp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatLevel(r.high)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatLevel(r.low)}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", direction(r))}>
                      {formatLevel(r.close)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", direction(r))}>
                      {formatSigned(r.range)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", direction(r))}>
                      {formatPercent(r.svi)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {cards.map((r) => (
              <li
                key={r.symbol}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    href={`/members/stocks/${r.symbol}`}
                    className="rounded-sm font-mono font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {r.symbol}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    PFCP {formatLevel(r.pfcp)} · H {formatLevel(r.high)} · L {formatLevel(r.low)}
                  </span>
                </div>
                <div className={cn("flex flex-col items-end gap-1 tabular-nums", direction(r))}>
                  <span className="font-semibold">{formatLevel(r.close)}</span>
                  <span className="text-xs">
                    {formatSigned(r.range)} · SVI {formatPercent(r.svi)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
