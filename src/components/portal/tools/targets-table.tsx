"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Fragment, useMemo, useState } from "react"
import { LuBell, LuSearch } from "react-icons/lu"
import type { TargetStatus } from "@/core/parsers/strike-targets"
import { formatExpiry, formatLevel, formatPercent, formatPrice } from "@/core/format"
import type { GroupTab, RemovedRow, TargetRow } from "@/lib/tools/targets"
import { useResponsiveRows } from "@/hooks/use-responsive-rows"
import { useUpdateSearchParams } from "@/hooks/use-update-search-params"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToneBadge, type Tone } from "../display"
import { SortHead, compareValues, toggleSort, type SortState } from "./sort-head"

const STATUS: Record<TargetStatus, { label: string; tone: Tone }> = {
  "above-target": { label: "Above target", tone: "positive" },
  between: { label: "Between", tone: "neutral" },
  "below-break": { label: "Below break", tone: "negative" },
}

type SortKey =
  "position" | "symbol" | "target" | "breakLevel" | "putStrike" | "expiry" | "lastClose" | "toTarget" | "toBreak"

const STATUS_ITEMS = [
  { value: "all", label: "Any status" },
  { value: "above-target", label: "Above target" },
  { value: "between", label: "Between" },
  { value: "below-break", label: "Below break" },
]

function StatusBadge({ status }: { status: TargetStatus | null }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  return <ToneBadge tone={STATUS[status].tone}>{STATUS[status].label}</ToneBadge>
}

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
      <span className="font-medium">{format(value)}</span>
      <span className="text-xs text-muted-foreground line-through">{format(previous as T)}</span>
    </span>
  )
}

function Ticker({ row }: { row: TargetRow }) {
  const link = (
    <Link
      href={`/members/stocks/${row.symbol}`}
      className="rounded-sm font-mono font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {row.symbol}
    </Link>
  )
  return (
    <span className="inline-flex items-center gap-1.5">
      {row.name ? (
        <Tooltip>
          <TooltipTrigger render={<span />}>{link}</TooltipTrigger>
          <TooltipContent>{row.name}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
      {row.change === "new" && <ToneBadge tone="neutral">New</ToneBadge>}
      {row.alertId && (
        <Link
          href={`/members/alerts/${row.alertId}`}
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
  )
}

export function TargetsTable({
  rows,
  removed,
  groups,
}: {
  rows: TargetRow[]
  removed: RemovedRow[]
  groups: GroupTab[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  // The page always holds every row; the group tabs and the changes toggle only filter them here.
  const [update] = useUpdateSearchParams({ clientOnly: true })
  const group = params.get("group") ?? "all"
  const showChanges = params.get("changes") === "1"
  const [query, setQuery] = useState("")
  const [expiry, setExpiry] = useState("all")
  const [status, setStatus] = useState("all")
  const [etfOnly, setEtfOnly] = useState(false)
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "position", dir: 1 })

  const groupBySlug = useMemo(() => new Map(groups.map((g) => [g.slug, g])), [groups])
  const groupOrder = useMemo(() => new Map(groups.map((g, i) => [g.slug, i])), [groups])
  const expiries = useMemo(() => [...new Set(rows.map((r) => r.expiry))].sort(), [rows])
  const expiryItems = useMemo(
    () => [{ value: "all", label: "Any expiry" }, ...expiries.map((e) => ({ value: e, label: formatExpiry(e) }))],
    [expiries],
  )
  const hasChanges = rows.some((r) => r.change !== null) || removed.length > 0

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    const list = rows.filter((r) => {
      if (group !== "all" && r.group !== group) return false
      if (q && !r.symbol.includes(q) && !(r.name ?? "").toUpperCase().includes(q)) return false
      if (expiry !== "all" && r.expiry !== expiry) return false
      if (status !== "all" && r.status !== status) return false
      if (etfOnly && !r.etf) return false
      if (showChanges && r.change === null) return false
      return true
    })
    const value = (r: TargetRow): number | string => {
      if (sort.key === "position") return (groupOrder.get(r.group) ?? 0) * 1000 + r.position
      return r[sort.key] ?? (sort.dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    }
    return [...list].sort((a, b) => compareValues(value(a), value(b), sort.dir))
  }, [rows, group, query, expiry, status, etfOnly, showChanges, sort, groupOrder])
  const { table, cards } = useResponsiveRows(filtered, "sm")

  const grouped = sort.key === "position" && group === "all"
  const showWeights = group === "all" ? groups.some((g) => g.hasWeights) : (groupBySlug.get(group)?.hasWeights ?? false)
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))
  const columns = 11 + (showWeights ? 1 : 0)

  const renderRow = (r: TargetRow) => (
    <TableRow
      key={r.symbol}
      className={cn("cursor-pointer", r.change === "new" && "bg-muted/40")}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a,button")) router.push(`/members/stocks/${r.symbol}`)
      }}
    >
      <TableCell className="w-10 text-muted-foreground tabular-nums">{r.position}</TableCell>
      <TableCell>
        <Ticker row={r} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
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
      <TableCell className="text-right tabular-nums">{formatPrice(r.lastClose)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPercent(r.toTarget, { digits: 1 })}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPercent(r.toBreak, { digits: 1 })}</TableCell>
      <TableCell>
        <StatusBadge status={r.status} />
      </TableCell>
      {showWeights && (
        <TableCell className="text-right tabular-nums">
          {r.dowWeight === null ? "" : `${formatLevel(r.dowWeight)}%`}
        </TableCell>
      )}
      <TableCell className="font-mono text-xs">
        {r.etf ? (
          <Link
            href="/members/etfs"
            className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {r.etf}
          </Link>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
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

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full sm:w-48">
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
        <Select items={expiryItems} value={expiry} onValueChange={(v: string | null) => setExpiry(v ?? "all")}>
          <SelectTrigger size="sm" className="w-32" aria-label="Expiry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expiryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={STATUS_ITEMS} value={status} onValueChange={(v: string | null) => setStatus(v ?? "all")}>
          <SelectTrigger size="sm" className="w-36" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={etfOnly} onCheckedChange={setEtfOnly} />
          Has 2x ETF
        </label>
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
            <EmptyDescription>Clear a filter or pick another category.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Desktop and tablet: one table. */}
          <div className="hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead label="#" sortKey="position" sort={sort} onSort={onSort} className="w-10" />
                  <SortHead label="Ticker" sortKey="symbol" sort={sort} onSort={onSort} />
                  <SortHead label="Target" sortKey="target" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Break of" sortKey="breakLevel" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Put" sortKey="putStrike" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Expiry" sortKey="expiry" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="Last close" sortKey="lastClose" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="To target" sortKey="toTarget" sort={sort} onSort={onSort} className="text-right" />
                  <SortHead label="To break" sortKey="toBreak" sort={sort} onSort={onSort} className="text-right" />
                  <TableHead>Status</TableHead>
                  {showWeights && <TableHead className="text-right">Dow weight</TableHead>}
                  <TableHead>2x ETF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped
                  ? groups.map((g) => {
                      const items = table.filter((r) => r.group === g.slug)
                      if (items.length === 0) return null
                      return (
                        <Fragment key={g.slug}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell
                              colSpan={columns}
                              className="py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                            >
                              {g.name}
                              {g.description && (
                                <span className="ml-2 font-normal tracking-normal normal-case">{g.description}</span>
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
              <li key={r.symbol} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Ticker row={r} />
                    <span className="text-xs text-muted-foreground">{groupBySlug.get(r.group)?.shortName}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <dl className="grid grid-cols-4 gap-2 text-sm">
                  {[
                    ["Target", formatLevel(r.target)],
                    ["Break", formatLevel(r.breakLevel)],
                    ["Put", formatLevel(r.putStrike)],
                    ["Expiry", formatExpiry(r.expiry)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col rounded-lg bg-muted/50 px-2 py-1.5">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Last {formatPrice(r.lastClose)} · {formatPercent(r.toTarget, { digits: 1 })} to target ·{" "}
                  {formatPercent(r.toBreak, { digits: 1 })} to break
                  {r.etf && ` · 2x ${r.etf}`}
                </p>
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
    </div>
  )
}
