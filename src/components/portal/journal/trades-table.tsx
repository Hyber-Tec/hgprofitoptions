"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { LuBell, LuSearch } from "react-icons/lu"
import { formatPercent, formatPrice } from "@/core/format"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Signed, ToneBadge } from "../display"
import { SortHead, compareValues, toggleSort, type SortState } from "../tools/sort-head"

export interface TradeRow {
  id: string
  label: string
  symbol: string
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

type SortKey = "openedAt" | "closedAt" | "symbol" | "quantity" | "realizedPnl" | "returnPct" | "holding"

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

function formatHolding(ms: number | null): string {
  if (ms === null) return "-"
  const hours = ms / 3_600_000
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`
  return `${Math.round(hours / 24)} d`
}

const select = (
  items: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void,
  label: string,
  width: string,
) => (
  <Select items={items} value={value} onValueChange={(v: string | null) => onChange(v ?? "all")}>
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

export function TradesTable({ rows }: { rows: TradeRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [outcome, setOutcome] = useState("all")
  const [origin, setOrigin] = useState("all")
  const [asset, setAsset] = useState("all")
  const [tag, setTag] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "openedAt", dir: -1 })
  const tags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows])

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
    const value = (r: TradeRow): number | string => {
      switch (sort.key) {
        case "openedAt":
          return r.openedAt
        case "closedAt":
          return r.closedAt ?? ""
        case "symbol":
          return r.label
        case "quantity":
          return r.quantity
        case "realizedPnl":
          return r.realizedPnl ?? Number.NEGATIVE_INFINITY
        case "returnPct":
          return r.returnPct ?? Number.NEGATIVE_INFINITY
        case "holding":
          return holding(r) ?? Number.POSITIVE_INFINITY
      }
    }
    return [...list].sort((a, b) => compareValues(value(a), value(b), sort.dir))
  }, [rows, query, status, outcome, origin, asset, tag, from, to, sort])
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))
  const total = filtered.reduce((s, r) => s + (r.status === "closed" ? (r.realizedPnl ?? 0) : 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full sm:w-40">
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
        {select(
          [
            { value: "all", label: "Open and closed" },
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ],
          status,
          setStatus,
          "Status",
          "w-38",
        )}
        {select(
          [
            { value: "all", label: "Wins and losses" },
            { value: "win", label: "Wins" },
            { value: "loss", label: "Losses" },
          ],
          outcome,
          setOutcome,
          "Outcome",
          "w-38",
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
          "w-44",
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
            "w-32",
          )}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-36"
            aria-label="From date"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          to
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-36"
            aria-label="To date"
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "trade" : "trades"} · realized{" "}
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
        <>
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead label="Opened" sortKey="openedAt" sort={sort} onSort={onSort} />
                  <SortHead label="Closed" sortKey="closedAt" sort={sort} onSort={onSort} />
                  <SortHead label="Contract" sortKey="symbol" sort={sort} onSort={onSort} />
                  <TableHead>Side</TableHead>
                  <SortHead label="Qty" sortKey="quantity" sort={sort} onSort={onSort} className="text-right" />
                  <TableHead className="text-right">Entry / exit</TableHead>
                  <SortHead label="P&L" sortKey="realizedPnl" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Return" sortKey="returnPct" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Held" sortKey="holding" sort={sort} onSort={onSort} className="text-right" />
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a,button")) router.push(`/members/journal/${r.id}`)
                    }}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {ET_DATE.format(new Date(r.openedAt))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {r.closedAt ? ET_DATE.format(new Date(r.closedAt)) : <ToneBadge tone="neutral">Open</ToneBadge>}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Link
                          href={`/members/journal/${r.id}`}
                          className="rounded-sm font-mono text-[13px] font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {r.label}
                        </Link>
                        {r.alertId && (
                          <Link
                            href={`/members/alerts/${r.alertId}`}
                            aria-label="Linked HG alert"
                            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <ToneBadge tone="positive">
                              <LuBell aria-hidden="true" />
                              HG
                            </ToneBadge>
                          </Link>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{r.direction}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatPrice(r.avgEntry)}
                      <span className="text-muted-foreground">
                        {" "}
                        / {r.avgExit === null ? "-" : formatPrice(r.avgExit)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "closed" ? (
                        <Signed value={r.realizedPnl} as="money" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "closed" ? (
                        <Signed value={r.returnPct} digits={1} icon={false} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatHolding(holding(r))}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                      {[r.setup, ...r.tags.map((t) => `#${t}`)].filter(Boolean).join(" ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/members/journal/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] font-medium">{r.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ET_DATE.format(new Date(r.openedAt))}
                      {r.closedAt ? ` to ${ET_DATE.format(new Date(r.closedAt))}` : " · open"} · {r.quantity}{" "}
                      {r.assetType === "option" ? "contracts" : "shares"}
                      {r.alertId && " · HG alert"}
                    </span>
                  </span>
                  <span className={cn("flex flex-col items-end text-sm")}>
                    {r.status === "closed" ? (
                      <>
                        <Signed value={r.realizedPnl} as="money" />
                        <span className="text-xs text-muted-foreground">
                          {formatPercent(r.returnPct, { digits: 1 })}
                        </span>
                      </>
                    ) : (
                      <ToneBadge tone="neutral">Open</ToneBadge>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
