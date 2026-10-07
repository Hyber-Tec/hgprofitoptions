"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { LuSearch, LuTriangle } from "react-icons/lu"
import { formatLevel, formatPercent, formatPrice, formatShortDate } from "@/core/format"
import type { ChannelRow } from "@/lib/tools/channels"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToneBadge } from "../display"
import { MiniLadder } from "./mini-ladder"
import { SortHead, compareValues, toggleSort, type SortState } from "./sort-head"

type SortKey = "symbol" | "price" | "ch" | "toAbove" | "toBelow" | "earningsIn" | "vs30"

const EARNINGS_ITEMS = [
  { value: "any", label: "Any earnings" },
  { value: "7", label: "Earnings in 7 days" },
  { value: "14", label: "Earnings in 14 days" },
  { value: "30", label: "Earnings in 30 days" },
]
const NEAR_ITEMS = [
  { value: "any", label: "Any distance" },
  { value: "0.01", label: "Within 1% of a line" },
  { value: "0.02", label: "Within 2% of a line" },
  { value: "0.03", label: "Within 3% of a line" },
]
const MEDIAN_ITEMS = [
  { value: "any", label: "Any vs 30D" },
  { value: "above", label: "Above 30D median" },
  { value: "below", label: "Below 30D median" },
]

/** ▲ when the price is above the median, ▼ when below. Shape, not only color, carries the meaning. */
function MedianCell({ value, price }: { value: number | null; price: number }) {
  if (value === null) return <span className="text-muted-foreground">-</span>
  const above = price >= value
  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums">
      {formatLevel(value)}
      <LuTriangle
        aria-label={above ? "price above" : "price below"}
        className={cn("size-2.5 fill-current", above ? "text-positive" : "rotate-180 text-negative")}
      />
    </span>
  )
}

function Levels({ values }: { values: readonly number[] }) {
  if (values.length === 0) return <span className="text-muted-foreground">-</span>
  return <span className="tabular-nums">{values.map((v) => formatLevel(v)).join(", ")}</span>
}

function Earnings({ row }: { row: ChannelRow }) {
  if (row.earningsIn === null || !row.earningsStart) return <span className="text-muted-foreground">-</span>
  const range =
    row.earningsEnd && row.earningsEnd !== row.earningsStart
      ? `${formatShortDate(row.earningsStart)} to ${formatShortDate(row.earningsEnd)}`
      : formatShortDate(row.earningsStart)
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <ToneBadge tone={row.earningsIn <= 7 ? "warning" : "muted"}>
          {row.earningsIn === 0 ? "Earnings now" : `In ${row.earningsIn} d`}
        </ToneBadge>
      </TooltipTrigger>
      <TooltipContent>Earnings window {range}</TooltipContent>
    </Tooltip>
  )
}

export function ChannelsTable({ rows, groups }: { rows: ChannelRow[]; groups: { slug: string; shortName: string }[] }) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("all")
  const [earnings, setEarnings] = useState("any")
  const [near, setNear] = useState("any")
  const [median, setMedian] = useState("any")
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "symbol", dir: 1 })
  const groupItems = useMemo(
    () => [{ value: "all", label: "All categories" }, ...groups.map((g) => ({ value: g.slug, label: g.shortName }))],
    [groups],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    const list = rows.filter((r) => {
      if (q && !r.symbol.includes(q) && !(r.name ?? "").toUpperCase().includes(q)) return false
      if (group !== "all" && !r.groups.includes(group)) return false
      if (earnings !== "any" && (r.earningsIn === null || r.earningsIn > Number(earnings))) return false
      if (near !== "any") {
        const closest = Math.min(Math.abs(r.toAbove ?? Infinity), Math.abs(r.toBelow ?? Infinity))
        if (!(closest <= Number(near))) return false
      }
      if (median !== "any") {
        if (r.m30 === null) return false
        if (median === "above" ? r.price < r.m30 : r.price >= r.m30) return false
      }
      return true
    })
    const value = (r: ChannelRow): number | string => {
      switch (sort.key) {
        case "symbol":
          return r.symbol
        case "price":
          return r.price
        case "ch":
          return r.ch
        case "toAbove":
          return r.toAbove ?? Infinity
        case "toBelow":
          return r.toBelow === null ? -Infinity : r.toBelow
        case "earningsIn":
          return r.earningsIn ?? Infinity
        case "vs30":
          return r.m30 === null ? Infinity : (r.price - r.m30) / r.m30
      }
    }
    return [...list].sort((a, b) => compareValues(value(a), value(b), sort.dir))
  }, [rows, query, group, earnings, near, median, sort])

  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))

  const filter = (
    items: { value: string; label: string }[],
    value: string,
    onChange: (v: string) => void,
    label: string,
    width: string,
  ) => (
    <Select items={items} value={value} onValueChange={(v: string | null) => onChange(v ?? items[0]?.value ?? "any")}>
      <SelectTrigger size="sm" className={width} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

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
        {filter(groupItems, group, setGroup, "Category", "w-40")}
        {filter(EARNINGS_ITEMS, earnings, setEarnings, "Earnings", "w-44")}
        {filter(NEAR_ITEMS, near, setNear, "Distance to a line", "w-44")}
        {filter(MEDIAN_ITEMS, median, setMedian, "Versus the 30-day median", "w-40")}
        <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} tickers</span>
      </div>

      {filtered.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle>No tickers match</EmptyTitle>
            <EmptyDescription>Loosen a filter to see more tickers.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead label="Ticker" sortKey="symbol" sort={sort} onSort={onSort} />
                  <SortHead label="Price" sortKey="price" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="CH / BOC" sortKey="ch" sort={sort} onSort={onSort} className="text-right" />
                  <TableHead className="text-right">5D</TableHead>
                  <SortHead label="30D" sortKey="vs30" sort={sort} onSort={onSort} className="text-right" />
                  <TableHead className="text-right">90D</TableHead>
                  <SortHead label="Next line up" sortKey="toAbove" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead
                    label="Next line down"
                    sortKey="toBelow"
                    sort={sort}
                    onSort={onSort}
                    className="text-right"
                  />
                  <TableHead>Ladder</TableHead>
                  <SortHead label="Earnings" sortKey="earningsIn" sort={sort} onSort={onSort} />
                  <TableHead>FS / SS</TableHead>
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
                    <TableCell className="text-right tabular-nums">{formatPrice(r.price)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {r.ch.toFixed(2)} / {r.boc.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MedianCell value={r.m5} price={r.price} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MedianCell value={r.m30} price={r.price} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MedianCell value={r.m90} price={r.price} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLevel(r.above)}{" "}
                      <span className="text-xs text-muted-foreground">{formatPercent(r.toAbove, { digits: 1 })}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatLevel(r.below)}{" "}
                      <span className="text-xs text-muted-foreground">{formatPercent(r.toBelow, { digits: 1 })}</span>
                    </TableCell>
                    <TableCell>
                      <MiniLadder price={r.price} lines={r.lines} bocLevels={r.bocLevels} median={r.m30} />
                    </TableCell>
                    <TableCell>
                      <Earnings row={r} />
                    </TableCell>
                    <TableCell className="text-xs leading-tight">
                      {r.fs.length === 0 && r.ss.length === 0 ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <>
                          <span className="block">
                            <span className="text-muted-foreground">FS </span>
                            <Levels values={r.fs} />
                          </span>
                          <span className="block">
                            <span className="text-muted-foreground">SS </span>
                            <Levels values={r.ss} />
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((r) => (
              <li key={r.symbol} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/members/stocks/${r.symbol}`}
                    className="rounded-sm font-mono font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {r.symbol}
                  </Link>
                  <span className="font-medium tabular-nums">{formatPrice(r.price)}</span>
                </div>
                <MiniLadder price={r.price} lines={r.lines} bocLevels={r.bocLevels} median={r.m30} className="w-full" />
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      ["5D", r.m5],
                      ["30D", r.m30],
                      ["90D", r.m90],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="flex flex-col rounded-lg bg-muted/50 px-2 py-1.5">
                      <dt className="text-xs text-muted-foreground">{label} median</dt>
                      <dd>
                        <MedianCell value={v} price={r.price} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span>
                    CH {r.ch.toFixed(2)} · BOC {r.boc.toFixed(2)}
                  </span>
                  <span>
                    Up {formatLevel(r.above)} ({formatPercent(r.toAbove, { digits: 1 })})
                  </span>
                  <span>
                    Down {formatLevel(r.below)} ({formatPercent(r.toBelow, { digits: 1 })})
                  </span>
                  <Earnings row={r} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
