"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { LuCalendarPlus, LuDownload, LuSearch, LuSlidersHorizontal } from "react-icons/lu"
import { isoDateInZone } from "@/core/dates"
import type { MembershipStatus, Role } from "@/core/domain/types"
import { LEVEL_LABELS, TRADER_LEVELS, personBadge, type TraderLevel } from "@/core/levels"
import { renewNextQuarter } from "@/lib/actions/admin/members"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { Signed, ToneBadge, type Tone } from "@/components/portal/display"
import { SortHead, compareValues, toggleSort, type SortState } from "@/components/portal/tools/sort-head"

export interface MemberListRow {
  uid: string
  fullName: string
  email: string
  phone: string | null
  role: Role
  level: TraderLevel
  statusKind: MembershipStatus["kind"]
  statusLabel: string
  tone: Tone
  periodLabel: string | null
  endDate: string | null
  daysLeft: number | null
  endsQuarter: string | null
  memberSince: string | null
  linked: "yes" | "no" | "error"
  qtdReturn: number | null
  lastLoginAt: string | null
  deletionRequested: boolean
}

type SortKey = "fullName" | "statusLabel" | "endDate" | "memberSince" | "qtdReturn" | "lastLoginAt"

const STATUS_ITEMS = [
  { value: "all", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Free trial" },
  { value: "expiring", label: "Expiring soon" },
  { value: "upcoming", label: "Upcoming" },
  { value: "expired", label: "Expired" },
  { value: "suspended", label: "Suspended" },
  { value: "admin", label: "Admins" },
  { value: "editor", label: "Data editors" },
]
const LEVEL_ITEMS = [
  { value: "all", label: "Any level" },
  ...TRADER_LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] })),
]
const LINK_ITEMS = [
  { value: "all", label: "Linked or not" },
  { value: "yes", label: "Linked" },
  { value: "no", label: "Not linked" },
  { value: "error", label: "Needs reconnecting" },
]

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const fmtDate = (iso: string | null) => (iso ? DATE.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "-")
/** A moment (such as the last login) on its New York date; its UTC date can be a day ahead in the evening. */
const fmtMoment = (iso: string) => fmtDate(isoDateInZone(new Date(iso)))

function toCsv(rows: MemberListRow[]): string {
  const cell = (v: string | number | null) => {
    const text = v === null ? "" : String(v)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = [
    "name",
    "email",
    "phone",
    "role",
    "level",
    "status",
    "period",
    "end_date",
    "days_left",
    "member_since",
    "linked",
    "qtd_return",
    "last_login",
  ]
  return [
    header.join(","),
    ...rows.map((r) =>
      [
        r.fullName,
        r.email,
        r.phone,
        r.role,
        r.level,
        r.statusLabel,
        r.periodLabel,
        r.endDate,
        r.daysLeft,
        r.memberSince,
        r.linked,
        r.qtdReturn,
        r.lastLoginAt,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\n")
}

export function MembersTable({
  rows,
  quarters,
  initialStatus = "all",
}: {
  rows: MemberListRow[]
  quarters: string[]
  /** A status filter from the link that opened the page (?status=expired). */
  initialStatus?: string
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(() =>
    STATUS_ITEMS.some((f) => f.value === initialStatus) ? initialStatus : "all",
  )
  const [linked, setLinked] = useState("all")
  const [level, setLevel] = useState("all")
  const [quarter, setQuarter] = useState("all")
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "fullName", dir: 1 })
  const [pending, startTransition] = useTransition()
  const quarterItems = useMemo(
    () => [{ value: "all", label: "Ends any quarter" }, ...quarters.map((q) => ({ value: q, label: `Ends in ${q}` }))],
    [quarters],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (q && !`${r.fullName} ${r.email} ${r.phone ?? ""}`.toLowerCase().includes(q)) return false
        if (status === "expiring" && !(r.statusKind === "active" && r.tone === "warning")) return false
        if (status !== "all" && status !== "expiring" && r.statusKind !== status) return false
        if (linked !== "all" && r.linked !== linked) return false
        if (level !== "all" && r.level !== level) return false
        if (quarter !== "all" && r.endsQuarter !== quarter) return false
        return true
      })
      .sort((a, b) => compareValues(a[sort.key] ?? "", b[sort.key] ?? "", sort.dir))
  }, [rows, query, status, linked, level, quarter, sort])

  const activeFilters = [level, quarter, linked].filter((v) => v !== "all").length
  const clearFilters = () => {
    setLevel("all")
    setQuarter("all")
    setLinked("all")
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.uid))
  const toggleAll = (on: boolean) => setSelected(on ? new Set(filtered.map((r) => r.uid)) : new Set())
  const toggle = (uid: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(uid)
      else next.delete(uid)
      return next
    })

  const renew = () =>
    startTransition(async () => {
      const ids = [...selected].filter((uid) => rows.find((r) => r.uid === uid)?.role === "member")
      const result = await renewNextQuarter(ids)
      if (!result.ok) {
        toast.add({ title: "Not renewed", description: result.message, type: "error" })
        return
      }
      setSelected(new Set())
      toast.add({
        title: `Renewed ${result.data.renewed.length} ${result.data.renewed.length === 1 ? "member" : "members"}`,
        description:
          result.data.failed.length > 0
            ? `${result.data.failed.length} could not be renewed: ${result.data.failed[0]?.message ?? ""}`
            : undefined,
        type: result.data.failed.length > 0 ? "warning" : "success",
      })
    })

  const exportCsv = () => {
    const list = selected.size > 0 ? filtered.filter((r) => selected.has(r.uid)) : filtered
    const url = URL.createObjectURL(new Blob([`﻿${toCsv(list)}`], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "hg-members.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const select = (
    items: { value: string; label: string }[],
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
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 w-full sm:w-64">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email or phone"
            aria-label="Search members"
          />
        </InputGroup>
        {select(STATUS_ITEMS, status, setStatus, "Status", "w-40")}
        <Button
          variant="outline"
          aria-expanded={showFilters}
          aria-controls="member-filters"
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
        <Button variant="outline" className="sm:ml-auto" onClick={exportCsv}>
          <LuDownload />
          {selected.size > 0 ? `Export ${selected.size} selected` : "Export CSV"}
        </Button>
      </div>

      {showFilters && (
        <div id="member-filters" className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
          {select(LEVEL_ITEMS, level, setLevel, "Trader level", "w-36")}
          {select(quarterItems, quarter, setQuarter, "Ends in quarter", "w-48")}
          {select(LINK_ITEMS, linked, setLinked, "Brokerage", "w-48")}
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "member" : "members"} selected
          </span>
          <Button size="sm" disabled={pending} onClick={renew}>
            {pending ? <Spinner /> : <LuCalendarPlus />}
            Renew next quarter
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Tick members to renew them for the next quarter.</p>
      )}

      {filtered.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle>No members match</EmptyTitle>
            <EmptyDescription>Clear a filter, or add a member.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(v)} aria-label="Select all" />
                </TableHead>
                <SortHead
                  label="Member"
                  sortKey="fullName"
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                />
                <SortHead
                  label="Status"
                  sortKey="statusLabel"
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                />
                <TableHead>Period</TableHead>
                <SortHead label="Ends" sortKey="endDate" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortHead
                  label="Since"
                  sortKey="memberSince"
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                />
                <TableHead>Linked</TableHead>
                <SortHead
                  label="QTD"
                  sortKey="qtdReturn"
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                  className="text-right"
                />
                <SortHead
                  label="Last login"
                  sortKey="lastLoginAt"
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.uid} data-state={selected.has(r.uid) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.uid)}
                      onCheckedChange={(v) => toggle(r.uid, v)}
                      aria-label={`Select ${r.fullName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/members/${r.uid}`}
                      className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="block font-medium">{r.fullName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.email} · {personBadge(r)}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col items-start gap-1">
                      <ToneBadge tone={r.tone}>{r.statusLabel}</ToneBadge>
                      {r.deletionRequested && <span className="text-xs text-destructive">Deletion requested</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{r.periodLabel ?? "-"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fmtDate(r.endDate)}
                    {r.daysLeft !== null && (
                      <span className="block text-xs text-muted-foreground">{r.daysLeft} days left</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {fmtDate(r.memberSince)}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={r.linked === "yes" ? "positive" : r.linked === "error" ? "warning" : "muted"}>
                      {r.linked === "yes" ? "Yes" : r.linked === "error" ? "Reconnect" : "No"}
                    </ToneBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.qtdReturn === null ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <Signed value={r.qtdReturn} digits={1} />
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {r.lastLoginAt ? fmtMoment(r.lastLoginAt) : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {rows.length} members · QTD is the quarter-to-date, time-weighted return of linked
        accounts.
      </p>
    </div>
  )
}
