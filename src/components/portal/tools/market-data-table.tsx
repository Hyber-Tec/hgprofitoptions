"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { LuSearch } from "react-icons/lu"
import { formatLevel, formatPercent, formatSigned } from "@/core/format"
import type { WeekRow } from "@/lib/tools/market-data"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Signed } from "../display"
import { SortHead, compareValues, toggleSort, type SortState } from "./sort-head"

type SortKey = "symbol" | "pfcp" | "high" | "low" | "close" | "change" | "changePct" | "range" | "svi" | "position"

const DIRECTION_ITEMS = [
  { value: "all", label: "Up and down" },
  { value: "up", label: "Closed up" },
  { value: "down", label: "Closed down" },
]

/** Where the close sits in the week's high-low range, as a small bar with a marker. */
function RangeBar({ position }: { position: number }) {
  return (
    <span
      className="relative block h-1.5 w-20 rounded-full bg-muted"
      role="img"
      aria-label={`Closed at ${Math.round(position * 100)}% of the week's range`}
    >
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
        style={{ left: `${position * 100}%` }}
      />
    </span>
  )
}

export function MarketDataTable({ rows, groups }: { rows: WeekRow[]; groups: { slug: string; shortName: string }[] }) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("all")
  const [direction, setDirection] = useState("all")
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "svi", dir: -1 })
  const groupItems = useMemo(
    () => [{ value: "all", label: "All categories" }, ...groups.map((g) => ({ value: g.slug, label: g.shortName }))],
    [groups],
  )
  const shortName = useMemo(() => new Map(groups.map((g) => [g.slug, g.shortName])), [groups])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return rows
      .filter(
        (r) =>
          (!q || r.symbol.includes(q)) &&
          (group === "all" || r.categories.includes(group)) &&
          (direction === "all" || (direction === "up" ? r.change >= 0 : r.change < 0)),
      )
      .sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.dir))
  }, [rows, query, group, direction, sort])
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full sm:w-44">
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
        {[
          { items: groupItems, value: group, set: setGroup, label: "Category", width: "w-40" },
          { items: DIRECTION_ITEMS, value: direction, set: setDirection, label: "Direction", width: "w-36" },
        ].map((f) => (
          <Select key={f.label} items={f.items} value={f.value} onValueChange={(v: string | null) => f.set(v ?? "all")}>
            <SelectTrigger size="sm" className={f.width} aria-label={f.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {f.items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} tickers</span>
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead label="Ticker" sortKey="symbol" sort={sort} onSort={onSort} />
                  <SortHead label="PFCP" sortKey="pfcp" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="High" sortKey="high" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Low" sortKey="low" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Close" sortKey="close" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Chg" sortKey="change" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Chg %" sortKey="changePct" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Range" sortKey="range" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="SVI" sortKey="svi" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="In range" sortKey="position" sort={sort} onSort={onSort} />
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.symbol}>
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
                    <TableCell className="text-right font-medium tabular-nums">{formatLevel(r.close)}</TableCell>
                    <TableCell className="text-right">
                      <Signed value={r.change} as="number" icon={false} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Signed value={r.changePct} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatSigned(r.range)}</TableCell>
                    <TableCell className="text-right">
                      <Signed value={r.svi} digits={2} />
                    </TableCell>
                    <TableCell>
                      <RangeBar position={r.position} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.categories.map((c) => shortName.get(c) ?? c).join(", ") || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((r) => (
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
                    H {formatLevel(r.high)} · L {formatLevel(r.low)} · Range {formatSigned(r.range)}
                  </span>
                </div>
                <div className={cn("flex flex-col items-end gap-1")}>
                  <span className="font-medium tabular-nums">{formatLevel(r.close)}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <Signed value={r.changePct} />
                    <span className="text-muted-foreground">SVI {formatPercent(r.svi)}</span>
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
