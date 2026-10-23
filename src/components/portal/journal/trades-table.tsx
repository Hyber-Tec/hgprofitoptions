"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { LuBell, LuSearch, LuSlidersHorizontal } from "react-icons/lu"
import type { IsoDate, OptionRight } from "@/core/domain/types"
import { formatPercent, formatPrice, formatShortDate } from "@/core/format"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Signed, ToneBadge } from "../display"
import { compareValues } from "../tools/sort-head"

export interface TradeRow {
  id: string
  label: string
  symbol: string
  /** The contract, for option trades. */
  option: { strike: number; right: OptionRight; expiry: IsoDate } | null
  assetType: "stock" | "option"
  direction: "long" | "short"
  status: "open" | "closed"
  source: "broker" | "manual" | "csv"
  openedAt: string
  closedAt: string | null
  quantity: number
  avgEntry: number
  avgExit: number | null
  realizedPnl: number | null
  returnPct: number | null
  tags: string[]
  setup: string | null
  alertId: string | null
}

const ET_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/New_York",
})

function holding(row: TradeRow): number | null {
  return row.closedAt ? new Date(row.closedAt).getTime() - new Date(row.openedAt).getTime() : null
}

function formatHolding(ms: number | null): string | null {
  if (ms === null) return null
  const hours = ms / 3_600_000
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? "day" : "days"}`
}

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "gain", label: "Biggest gain first" },
  { value: "loss", label: "Biggest loss first" },
  { value: "held", label: "Held longest first" },
  { value: "ticker", label: "Ticker A to Z" },
] as const
type Sort = (typeof SORTS)[number]["value"]

const select = (
  items: readonly { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void,
  label: string,
  width: string,
) => (
  <Select items={items} value={value} onValueChange={(v: string | null) => onChange(v ?? "all")}>
    <SelectTrigger className={width} aria-label={label}>
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

/** The journal's trades: one readable line each, with the less used filters behind a Filters button. */
export function TradesTable({ rows }: { rows: TradeRow[] }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [outcome, setOutcome] = useState("all")
  const [origin, setOrigin] = useState("all")
  const [asset, setAsset] = useState("all")
  const [tag, setTag] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [sort, setSort] = useState<Sort>("newest")
  const [showFilters, setShowFilters] = useState(false)
  const tags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows])
  const activeFilters = [outcome, origin, asset, tag].filter((v) => v !== "all").length + (from ? 1 : 0) + (to ? 1 : 0)

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    const list = rows.filter((r) => {
      const day = ET_DAY.format(new Date(r.closedAt ?? r.openedAt))
      if (q && !r.symbol.includes(q) && !r.label.toUpperCase().includes(q)) return false
      if (status !== "all" && r.status !== status) return false
      if (outcome === "win" && !((r.realizedPnl ?? 0) > 0 && r.status === "closed")) return false
      if (outcome === "loss" && !((r.realizedPnl ?? 0) < 0 && r.status === "closed")) return false
      if (origin === "alert" && !r.alertId) return false
      if (origin === "own" && r.alertId) return false
      if (asset !== "all" && r.assetType !== asset) return false
      if (tag !== "all" && !r.tags.includes(tag)) return false
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
    const order: Record<Sort, [(r: TradeRow) => number | string, 1 | -1]> = {
      newest: [(r) => r.openedAt, -1],
      oldest: [(r) => r.openedAt, 1],
      gain: [(r) => r.realizedPnl ?? Number.NEGATIVE_INFINITY, -1],
      loss: [(r) => r.realizedPnl ?? Number.POSITIVE_INFINITY, 1],
      held: [(r) => holding(r) ?? Number.NEGATIVE_INFINITY, -1],
      ticker: [(r) => r.label, 1],
    }
    const [value, dir] = order[sort]
    return [...list].sort((a, b) => compareValues(value(a), value(b), dir))
  }, [rows, query, status, outcome, origin, asset, tag, from, to, sort])
  const total = filtered.reduce((s, r) => s + (r.status === "closed" ? (r.realizedPnl ?? 0) : 0), 0)

  const clearFilters = () => {
    setOutcome("all")
    setOrigin("all")
    setAsset("all")
    setTag("all")
    setFrom("")
    setTo("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 w-full sm:w-48">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticker"
            aria-label="Search ticker"
          />
        </InputGroup>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[status]}
          onValueChange={(v: string[]) => v[0] && setStatus(v[0])}
          aria-label="Open or closed"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="open">Open</ToggleGroupItem>
          <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="outline"
          aria-expanded={showFilters}
          aria-controls="journal-filters"
          onClick={() => setShowFilters((on) => !on)}
        >
          <LuSlidersHorizontal />
          Filters
          {activeFilters > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground tabular-nums">
              {activeFilters}
            </span>
          )}
        </Button>
        <div className="sm:ml-auto">{select(SORTS, sort, (v) => setSort(v as Sort), "Sort", "w-48")}</div>
      </div>

      {showFilters && (
        <div id="journal-filters" className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
          {select(
            [
              { value: "all", label: "Wins and losses" },
              { value: "win", label: "Wins" },
              { value: "loss", label: "Losses" },
            ],
            outcome,
            setOutcome,
            "Outcome",
            "w-40",
          )}
          {select(
            [
              { value: "all", label: "Any idea" },
              { value: "alert", label: "Followed an HG alert" },
              { value: "own", label: "My own idea" },
            ],
            origin,
            setOrigin,
            "Idea",
            "w-48",
          )}
          {select(
            [
              { value: "all", label: "Stocks and options" },
              { value: "option", label: "Options" },
              { value: "stock", label: "Stocks" },
            ],
            asset,
            setAsset,
            "Asset",
            "w-44",
          )}
          {tags.length > 0 &&
            select(
              [{ value: "all", label: "Any tag" }, ...tags.map((t) => ({ value: t, label: `#${t}` }))],
              tag,
              setTag,
              "Tag",
              "w-36",
            )}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            From
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
              aria-label="From date"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            to
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
              aria-label="To date"
            />
          </label>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "trade" : "trades"} · closed trades made{" "}
        <Signed value={total} as="money" className="font-medium" />
      </p>

      {filtered.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle>{rows.length === 0 ? "No trades yet" : "No trades match"}</EmptyTitle>
            <EmptyDescription>
              {rows.length === 0
                ? "Link your brokerage, add a trade or import a CSV to start your journal."
                : "Clear a filter to see more trades."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul aria-label="Trades" className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
          {filtered.map((r) => {
            const unit = r.assetType === "option" ? "contract" : "share"
            const held = formatHolding(holding(r))
            const notes = [r.setup, ...r.tags.map((t) => `#${t}`)].filter(Boolean).join(" ")
            return (
              <li key={r.id}>
                <Link
                  href={`/members/journal/${r.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-base font-semibold">{r.symbol}</span>
                      {r.option && (
                        <>
                          <span className="font-medium whitespace-nowrap">
                            {formatPrice(r.option.strike)} {r.option.right === "call" ? "Call" : "Put"}
                          </span>
                          <span className="text-sm whitespace-nowrap text-muted-foreground">
                            Exp {formatShortDate(r.option.expiry)}
                          </span>
                        </>
                      )}
                      {r.alertId && (
                        <ToneBadge tone="positive">
                          <LuBell aria-hidden="true" />
                          HG alert
                        </ToneBadge>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {ET_DATE.format(new Date(r.openedAt))}
                      {r.closedAt ? ` to ${ET_DATE.format(new Date(r.closedAt))}` : ""}
                      {held && ` (${held})`} · {r.direction === "short" ? "Short " : ""}
                      {r.quantity} {r.quantity === 1 ? unit : `${unit}s`} at {formatPrice(r.avgEntry)}
                      {r.avgExit !== null && `, out at ${formatPrice(r.avgExit)}`}
                    </span>
                    {notes && <span className="truncate text-xs text-muted-foreground">{notes}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {r.status === "closed" ? (
                      <>
                        <Signed value={r.realizedPnl} as="money" className="text-base font-semibold" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatPercent(r.returnPct, { digits: 1 })}
                        </span>
                      </>
                    ) : (
                      <ToneBadge tone="neutral">Open</ToneBadge>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
