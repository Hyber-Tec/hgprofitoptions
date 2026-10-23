"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { LuSearch, LuTriangle } from "react-icons/lu"
import { formatFixed, formatPlain, formatPrice, formatShortDate, plural } from "@/core/format"
import type { ChannelRow } from "@/lib/tools/channels"
import { useLiveQuotes } from "@/hooks/use-live-quotes"
import { useResponsiveRows } from "@/hooks/use-responsive-rows"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToneBadge } from "../display"
import { ChannelStrip } from "./channel-strip"
import { LiveDot } from "./live-dot"

/** ▲ when the price is above the median, ▼ when below. Shape, not only color, carries the meaning. */
function Median({ label, value, price }: { label: string; value: number | null; price: number }) {
  if (value === null) return null
  const above = price >= value
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      {formatFixed(value)}
      <LuTriangle
        aria-label={above ? "price above" : "price below"}
        className={cn("size-2.5 fill-current", above ? "text-positive" : "rotate-180 text-negative")}
      />
    </span>
  )
}

function Levels({ label, values }: { label: string; values: readonly number[] }) {
  if (values.length === 0) return null
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-muted-foreground">{label} </span>
      {values.map((v) => formatPlain(v)).join(", ")}
    </span>
  )
}

function Earnings({ row }: { row: ChannelRow }) {
  if (row.earningsIn === null || !row.earningsStart) return null
  const range =
    row.earningsEnd && row.earningsEnd !== row.earningsStart
      ? `${formatShortDate(row.earningsStart)} to ${formatShortDate(row.earningsEnd)}`
      : formatShortDate(row.earningsStart)
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <ToneBadge tone={row.earningsIn <= 7 ? "warning" : "muted"}>
          {row.earningsIn === 0 ? "Earnings now" : `Earnings in ${row.earningsIn} d`}
        </ToneBadge>
      </TooltipTrigger>
      <TooltipContent>Earnings window {range}</TooltipContent>
    </Tooltip>
  )
}

export function ChannelsTable({
  rows,
  groups,
  live,
}: {
  rows: ChannelRow[]
  groups: { slug: string; shortName: string }[]
  /** True when a market data provider is set up, so prices refresh while the page is open. */
  live: boolean
}) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("all")
  const groupItems = useMemo(
    () => [{ value: "all", label: "All categories" }, ...groups.map((g) => ({ value: g.slug, label: g.shortName }))],
    [groups],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return rows
      .filter(
        (r) =>
          (!q || r.symbol.includes(q) || (r.name ?? "").toUpperCase().includes(q)) &&
          (group === "all" || r.groups.includes(group)),
      )
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [rows, query, group])
  // One list for every width (the strip shows fewer levels in narrow boxes), rendered in full after hydration.
  const { table, cards } = useResponsiveRows(filtered, "md")
  const list = table.length > 0 ? table : cards
  const { quotes } = useLiveQuotes(
    useMemo(() => filtered.map((r) => r.symbol), [filtered]),
    { enabled: live },
  )

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
        <ul className="flex flex-col divide-y rounded-xl border">
          {list.map((r) => {
            const quote = quotes[r.symbol]
            const price = quote?.last ?? r.anchor
            return (
              <li key={r.symbol} className="@container flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/members/stocks/${r.symbol}`}
                      className="rounded-sm font-mono text-base font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {r.symbol}
                    </Link>
                    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                      {quote && <LiveDot status={quote.marketStatus} />}
                      {formatPrice(price)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      CH {formatFixed(r.ch)} · BOC {formatFixed(r.boc)}
                    </span>
                    <Earnings row={r} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <Median label="5D" value={r.m5} price={price} />
                    <Median label="30D" value={r.m30} price={price} />
                    <Median label="90D" value={r.m90} price={price} />
                    <Levels label="FS" values={r.fs} />
                    <Levels label="SS" values={r.ss} />
                  </div>
                </div>
                <ChannelStrip {...r} price={price} steps={4} className="hidden @4xl:grid" />
                <ChannelStrip {...r} price={price} steps={3} className="hidden @xl:grid @4xl:hidden" />
                <ChannelStrip {...r} price={price} steps={2} className="@xl:hidden" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
