"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { LuBell, LuSearch } from "react-icons/lu"
import { targetStatus } from "@/core/parsers/strike-targets"
import { formatExpiry, formatLevel, formatPercent, formatPrice } from "@/core/format"
import type { GroupTab, RemovedRow, TargetRow } from "@/lib/tools/targets"
import { useLiveQuotes } from "@/hooks/use-live-quotes"
import { useUpdateSearchParams } from "@/hooks/use-update-search-params"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToneBadge } from "../display"
import { LiveDot } from "./live-dot"
import { TargetQuotes } from "./target-quotes"
import { StatusBadge, type PricedRow } from "./target-status"

/** One of HG's levels, large, with the earlier value struck through when it changed since the last update. */
export function Level({
  label,
  value,
  previous,
  strong = false,
  children,
}: {
  label: string
  value: string
  previous?: string
  strong?: boolean
  children?: ReactNode
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      <span
        className={cn(
          "text-xl leading-tight tabular-nums sm:text-2xl",
          strong ? "font-semibold" : "font-medium text-foreground/80",
        )}
      >
        {value}
      </span>
      {previous !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums line-through">{previous}</span>
      )}
      {children}
    </span>
  )
}

/** "2.0% above the target", "1.3% to the target" or "0.4% below the break": where the price sits. */
function whereNow({ price, status, target, breakLevel }: PricedRow): string | null {
  if (price === null || status === null) return null
  const pct = (level: number) => formatPercent(Math.abs(price - level) / level, { digits: 1, signed: false })
  if (status === "above-target") return `${pct(target)} above the target`
  if (status === "below-break") return `${pct(breakLevel)} below the break`
  return `${pct(target)} to the target`
}

/** One stock, read the way HG writes it: the target, or the break of a level and the put to play below it. */
function TargetLine({ row, onOpen }: { row: PricedRow; onOpen: () => void }) {
  const prev = row.previous
  return (
    <li
      className={cn(
        "grid cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5 lg:grid-cols-[2rem_10rem_minmax(0,1fr)_13rem] lg:items-center lg:py-3.5",
        row.change === "new" && "bg-muted/30",
      )}
      onClick={onOpen}
    >
      <span className="pt-1.5 text-sm text-muted-foreground tabular-nums lg:pt-0">{row.position}</span>

      <span className="flex min-w-0 flex-col gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          aria-haspopup="dialog"
          aria-label={`${row.symbol}: live prices and details`}
          className="w-fit rounded-sm font-mono text-2xl font-semibold tracking-tight outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {row.symbol}
        </button>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {row.dowWeight !== null && (
            <span className="tabular-nums" title="Weight in the Dow">
              w {formatLevel(row.dowWeight)}%
            </span>
          )}
          {row.etf && <span title="Leveraged ETF">2x {row.etf}</span>}
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
        </span>
      </span>

      {/* The price and status sit beside the ticker on phones, and at the end of the line from desktop up. */}
      <span className="flex flex-col items-end gap-1.5 text-right lg:order-last">
        <span className="flex items-center gap-2 text-xl font-semibold tabular-nums">
          {row.live && <LiveDot status={row.session} />}
          {formatPrice(row.price)}
        </span>
        <StatusBadge status={row.status} />
        {whereNow(row) && <span className="text-xs text-muted-foreground tabular-nums">{whereNow(row)}</span>}
      </span>

      <span className="col-span-3 grid grid-cols-3 gap-4 lg:col-span-1 lg:gap-6">
        <Level label="Target" value={formatLevel(row.target)} previous={prevLevel(prev?.target)} strong />
        <Level label="Or break of" value={formatLevel(row.breakLevel)} previous={prevLevel(prev?.breakLevel)} />
        <Level label="Put" value={formatLevel(row.putStrike)} previous={prevLevel(prev?.putStrike)}>
          <span className="text-xs text-muted-foreground tabular-nums">
            Expires {formatExpiry(row.expiry)}
            {prev?.expiry !== undefined && (
              <span className="ml-1 line-through">{formatExpiry(String(prev.expiry) as typeof row.expiry)}</span>
            )}
          </span>
        </Level>
      </span>

      {row.note && <p className="col-span-3 text-sm text-muted-foreground lg:col-span-3 lg:col-start-2">{row.note}</p>}
    </li>
  )
}

const prevLevel = (value: string | number | undefined) => (value === undefined ? undefined : formatLevel(Number(value)))

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

  const sections = groups
    .map((g) => ({ group: g, items: filtered.filter((r) => r.group === g.slug) }))
    .filter((s) => s.items.length > 0)
  const opened = priced.find((r) => r.symbol === openSymbol) ?? null

  return (
    <div className="flex flex-col gap-5">
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
        <InputGroup className="h-10 w-full sm:w-64">
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

      {filtered.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle>No tickers match</EmptyTitle>
            <EmptyDescription>Clear the search or pick another category.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        sections.map(({ group: g, items }) => (
          <section
            key={g.slug}
            aria-labelledby={`group-${g.slug}`}
            className="overflow-hidden rounded-2xl border bg-card"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/40 px-4 py-3 sm:px-5">
              <h2 id={`group-${g.slug}`} className="text-lg font-semibold tracking-tight">
                {g.name}
              </h2>
              {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
            </header>
            <ul className="divide-y">
              {items.map((r) => (
                <TargetLine key={r.symbol} row={r} onOpen={() => setOpenSymbol(r.symbol)} />
              ))}
            </ul>
          </section>
        ))
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
