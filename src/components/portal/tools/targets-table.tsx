"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Fragment, useMemo, useState } from "react"
import { LuBell, LuSearch } from "react-icons/lu"
import { targetStatus } from "@/core/parsers/strike-targets"
import { formatExpiry, formatLevel, formatPrice } from "@/core/format"
import type { GroupTab, RemovedRow, TargetRow } from "@/lib/tools/targets"
import { useLiveQuotes } from "@/hooks/use-live-quotes"
import { useResponsiveRows } from "@/hooks/use-responsive-rows"
import { useUpdateSearchParams } from "@/hooks/use-update-search-params"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToneBadge } from "../display"
import { LiveDot } from "./live-dot"
import { TargetQuotes } from "./target-quotes"
import { StatusBadge, type PricedRow } from "./target-status"

/** A value with the previous one struck through when it changed since the last update. */
function Changed<T extends number | string>({
  value,
  previous,
  format,
}: {
  value: T
  previous: number | string | undefined
  format: (v: T) => string
}) {
  if (previous === undefined) return <>{format(value)}</>
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-semibold">{format(value)}</span>
      <span className="text-xs text-muted-foreground line-through">{format(previous as T)}</span>
    </span>
  )
}

/** HG's "w" value: the stock's weight in the Dow, in percent. */
function DowWeight({ weight }: { weight: number | null }) {
  if (weight === null) return null
  return (
    <span className="text-xs text-muted-foreground tabular-nums" title="Weight in the Dow">
      w {formatLevel(weight)}%
    </span>
  )
}

function Badges({ row }: { row: TargetRow }) {
  return (
    <>
      <DowWeight weight={row.dowWeight} />
      {row.change === "new" && <ToneBadge tone="neutral">New</ToneBadge>}
      {row.alertId && (
        <Link
          href={`/members/alerts/${row.alertId}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Open HG alert for ${row.symbol}`}
        >
          <ToneBadge tone="positive">
            <LuBell aria-hidden="true" />
            HG alert
          </ToneBadge>
        </Link>
      )}
    </>
  )
}

export function TargetsTable({
  rows,
  removed,
  groups,
  live,
}: {
  rows: TargetRow[]
  removed: RemovedRow[]
  groups: GroupTab[]
  /** True when a market data provider is set up, so prices refresh while the page is open. */
  live: boolean
}) {
  const params = useSearchParams()
  // The page always holds every row; the group tabs and the changes toggle only filter them here.
  const [update] = useUpdateSearchParams({ clientOnly: true })
  const group = params.get("group") ?? "all"
  const showChanges = params.get("changes") === "1"
  const [query, setQuery] = useState("")
  const [openSymbol, setOpenSymbol] = useState<string | null>(null)

  const symbols = useMemo(() => rows.map((r) => r.symbol), [rows])
  const { quotes } = useLiveQuotes(symbols, { enabled: live })
  const priced = useMemo<PricedRow[]>(
    () =>
      rows.map((r) => {
        const quote = quotes[r.symbol]
        const last = quote?.last ?? null
        const price = last ?? r.lastClose
        return {
          ...r,
          price,
          live: last !== null,
          session: quote?.marketStatus ?? null,
          status: price ? targetStatus(price, r) : null,
        }
      }),
    [rows, quotes],
  )

  const groupBySlug = useMemo(() => new Map(groups.map((g) => [g.slug, g])), [groups])
  const hasChanges = rows.some((r) => r.change !== null) || removed.length > 0

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return priced.filter((r) => {
      if (group !== "all" && r.group !== group) return false
      if (q && !r.symbol.includes(q) && !(r.name ?? "").toUpperCase().includes(q)) return false
      if (showChanges && r.change === null) return false
      return true
    })
  }, [priced, group, query, showChanges])
  const { table, cards } = useResponsiveRows(filtered, "sm")

  const columns = 8
  const opened = priced.find((r) => r.symbol === openSymbol) ?? null

  const renderRow = (r: PricedRow) => (
    <TableRow
      key={r.symbol}
      className={cn("h-14 cursor-pointer text-[15px]", r.change === "new" && "bg-muted/40")}
      onClick={() => setOpenSymbol(r.symbol)}
    >
      <TableCell className="w-10 text-sm text-muted-foreground tabular-nums">{r.position}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpenSymbol(r.symbol)
            }}
            aria-haspopup="dialog"
            aria-label={`${r.symbol}: live prices and details`}
            className="rounded-sm font-mono text-base font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {r.symbol}
          </button>
          <Badges row={r} />
        </span>
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        <Changed value={r.target} previous={r.previous?.target} format={formatLevel} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Changed value={r.breakLevel} previous={r.previous?.breakLevel} format={formatLevel} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Changed value={r.putStrike} previous={r.previous?.putStrike} format={formatLevel} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Changed value={r.expiry} previous={r.previous?.expiry} format={formatExpiry} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="inline-flex items-center justify-end gap-1.5">
          {r.live && <LiveDot status={r.session} />}
          {formatPrice(r.price)}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge status={r.status} />
      </TableCell>
    </TableRow>
  )

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={group} onValueChange={(v: string) => update({ group: v === "all" ? null : v })}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="all">
              All <span className="text-muted-foreground tabular-nums">{rows.length}</span>
            </TabsTrigger>
            {groups.map((g) => (
              <TabsTrigger key={g.slug} value={g.slug}>
                {g.shortName} <span className="text-muted-foreground tabular-nums">{g.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
        {hasChanges && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showChanges} onCheckedChange={(on) => update({ changes: on ? "1" : null })} />
            Changes since last update
          </label>
        )}
      </div>

      {group !== "all" && groupBySlug.get(group)?.description && (
        <p className="text-sm text-muted-foreground">{groupBySlug.get(group)?.description}</p>
      )}

      {filtered.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle>No tickers match</EmptyTitle>
            <EmptyDescription>Clear the search or pick another category.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Desktop and tablet: one table, in the order of HG's doc. */}
          <div className="hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Break of</TableHead>
                  <TableHead className="text-right">Put</TableHead>
                  <TableHead className="text-right">Expiry</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group === "all"
                  ? groups.map((g) => {
                      const items = table.filter((r) => r.group === g.slug)
                      if (items.length === 0) return null
                      return (
                        <Fragment key={g.slug}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={columns} className="py-2.5 text-sm font-semibold">
                              {g.name}
                              {g.description && (
                                <span className="ml-2 font-normal text-muted-foreground">{g.description}</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {items.map(renderRow)}
                        </Fragment>
                      )
                    })
                  : table.map(renderRow)}
              </TableBody>
            </Table>
          </div>

          {/* Phones: cards. */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {cards.map((r) => (
              <li key={r.symbol}>
                <button
                  type="button"
                  onClick={() => setOpenSymbol(r.symbol)}
                  aria-haspopup="dialog"
                  className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold">{r.symbol}</span>
                        {r.change === "new" && <ToneBadge tone="neutral">New</ToneBadge>}
                        {r.alertId && (
                          <ToneBadge tone="positive">
                            <LuBell aria-hidden="true" />
                            HG alert
                          </ToneBadge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{groupBySlug.get(r.group)?.shortName}</span>
                    </span>
                    <StatusBadge status={r.status} />
                  </span>
                  <span className="grid grid-cols-4 gap-2 text-sm">
                    {[
                      ["Target", formatLevel(r.target)],
                      ["Break", formatLevel(r.breakLevel)],
                      ["Put", formatLevel(r.putStrike)],
                      ["Expiry", formatExpiry(r.expiry)],
                    ].map(([label, value]) => (
                      <span key={label} className="flex flex-col rounded-lg bg-muted/50 px-2 py-1.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="font-semibold tabular-nums">{value}</span>
                      </span>
                    ))}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                    {r.live && <LiveDot status={r.session} />}
                    {r.live ? "Price" : "Last close"} {formatPrice(r.price)}
                    {r.dowWeight !== null && ` · Dow weight ${formatLevel(r.dowWeight)}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {showChanges && removed.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
          <p className="text-sm font-medium">Removed since the last update</p>
          <p className="flex flex-wrap gap-2">
            {removed.map((r) => (
              <Link
                key={r.symbol}
                href={`/members/stocks/${r.symbol}`}
                className="rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground line-through outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {r.symbol}
              </Link>
            ))}
          </p>
        </div>
      )}

      <TargetQuotes
        row={opened}
        groupName={opened ? (groupBySlug.get(opened.group)?.name ?? null) : null}
        live={live}
        onClose={() => setOpenSymbol(null)}
      />
    </div>
  )
}
