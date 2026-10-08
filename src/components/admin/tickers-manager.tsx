"use client"

import { useMemo, useState, useTransition } from "react"
import { LuDownload, LuPencil, LuPlus, LuSearch } from "react-icons/lu"
import type { IsoDate } from "@/core/domain/types"
import { formatDate, formatLevel, formatPrice } from "@/core/format"
import { describePeriodRange } from "@/core/membership/quarters"
import { createTicker, updateTicker } from "@/lib/actions/admin/market"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "@/components/portal/display"
import { useEditorDialog } from "./use-editor-dialog"

export interface TickerAdminRow {
  symbol: string
  name: string | null
  kind: "stock" | "etf" | "index"
  active: boolean
  channelSize: number | null
  bocSize: number | null
  fsLevels: number[]
  ssLevels: number[]
  earningsStart: string | null
  earningsEnd: string | null
  notes: string | null
  lastClose: number | null
  asOf: string | null
}

const KINDS = [
  { value: "all", label: "All kinds" },
  { value: "stock", label: "Stocks" },
  { value: "etf", label: "ETFs" },
  { value: "index", label: "Indices" },
]

function earningsLabel(start: string | null, end: string | null): string {
  if (!start) return "-"
  if (!end || end === start) return formatDate(start as IsoDate)
  return describePeriodRange(start as IsoDate, end as IsoDate)
}

const levels = (text: string) =>
  text
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

export function TickersManager({ rows }: { rows: TickerAdminRow[] }) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("stock")
  const dialog = useEditorDialog<TickerAdminRow>()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    name: "",
    active: true,
    ch: "",
    boc: "",
    fs: "",
    ss: "",
    earningsStart: "",
    earningsEnd: "",
    notes: "",
  })
  const [newTicker, setNewTicker] = useState({ symbol: "", name: "", kind: "stock" as "stock" | "etf" })
  const [pending, startTransition] = useTransition()
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return rows.filter(
      (r) =>
        (kind === "all" || r.kind === kind) && (!q || r.symbol.includes(q) || (r.name ?? "").toUpperCase().includes(q)),
    )
  }, [rows, query, kind])

  const open = (r: TickerAdminRow) => {
    dialog.show(r)
    setForm({
      name: r.name ?? "",
      active: r.active,
      ch: r.channelSize?.toString() ?? "",
      boc: r.bocSize?.toString() ?? "",
      fs: r.fsLevels.join(", "),
      ss: r.ssLevels.join(", "),
      earningsStart: r.earningsStart ?? "",
      earningsEnd: r.earningsEnd ?? "",
      notes: r.notes ?? "",
    })
  }
  const save = () =>
    startTransition(async () => {
      const editing = dialog.target
      if (!editing) return
      const result = await updateTicker(editing.symbol, {
        name: form.name.trim() || null,
        active: form.active,
        channelSize: form.ch ? Number(form.ch) : null,
        bocSize: form.boc ? Number(form.boc) : null,
        fsLevels: levels(form.fs),
        ssLevels: levels(form.ss),
        earningsStart: form.earningsStart || null,
        earningsEnd: form.earningsEnd || null,
        notes: form.notes.trim() || null,
      })
      toast.add(
        result.ok
          ? { title: `${editing.symbol} saved`, type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
      if (result.ok) dialog.close()
    })
  const add = () =>
    startTransition(async () => {
      const result = await createTicker({
        symbol: newTicker.symbol,
        name: newTicker.name || null,
        kind: newTicker.kind,
      })
      toast.add(
        result.ok
          ? { title: `${newTicker.symbol.toUpperCase()} added`, type: "success" }
          : { title: "Not added", description: result.message, type: "error" },
      )
      if (result.ok) {
        setAdding(false)
        setNewTicker({ symbol: "", name: "", kind: "stock" })
      }
    })
  const exportCsv = () => {
    const header = "symbol,name,kind,active,ch,boc,fs,ss,earnings_start,earnings_end,last_close"
    const cell = (v: string | number | null) =>
      v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    const lines = rows.map((r) =>
      [
        r.symbol,
        r.name,
        r.kind,
        String(r.active),
        r.channelSize,
        r.bocSize,
        r.fsLevels.join(" "),
        r.ssLevels.join(" "),
        r.earningsStart,
        r.earningsEnd,
        r.lastClose,
      ]
        .map(cell)
        .join(","),
    )
    const url = URL.createObjectURL(new Blob([`﻿${[header, ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "hg-tickers.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-8 w-full sm:w-52">
            <InputGroupAddon>
              <LuSearch />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickers"
              aria-label="Search tickers"
            />
          </InputGroup>
          <Select items={KINDS} value={kind} onValueChange={(v: string | null) => setKind(v ?? "all")}>
            <SelectTrigger size="sm" className="w-32" aria-label="Kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} tickers</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <LuDownload />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <LuPlus />
            Add ticker
          </Button>
        </div>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Ticker</TableHead>
              <TableHead className="text-right">Last close</TableHead>
              <TableHead className="text-right">CH</TableHead>
              <TableHead className="text-right">BOC</TableHead>
              <TableHead className="pl-6">FS / SS</TableHead>
              <TableHead>Earnings</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.symbol}>
                <TableCell>
                  <span className="font-mono font-semibold">{r.symbol}</span>
                  {r.name && <span className="block max-w-48 truncate text-xs text-muted-foreground">{r.name}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(r.lastClose)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.channelSize === null ? "-" : r.channelSize.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.bocSize === null ? "-" : r.bocSize.toFixed(2)}
                </TableCell>
                <TableCell className="pl-6 text-xs text-muted-foreground tabular-nums">
                  {[
                    r.fsLevels.length ? `FS ${r.fsLevels.map((v) => formatLevel(v)).join(", ")}` : null,
                    r.ssLevels.length ? `SS ${r.ssLevels.map((v) => formatLevel(v)).join(", ")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "-"}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {earningsLabel(r.earningsStart, r.earningsEnd)}
                </TableCell>
                <TableCell>
                  {r.active ? (
                    <ToneBadge tone="positive">Active</ToneBadge>
                  ) : (
                    <ToneBadge tone="muted">Hidden</ToneBadge>
                  )}
                </TableCell>
                <TableCell>
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.symbol}`} onClick={() => open(r)}>
                    <LuPencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.target?.symbol}</DialogTitle>
            <DialogDescription>
              Channel settings drive the Median &amp; Channel Chart, the stock page and the editor hints.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="k-name">Company name</FieldLabel>
              <Input id="k-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="k-ch">CH (channel)</FieldLabel>
                <Input
                  id="k-ch"
                  type="number"
                  step="any"
                  value={form.ch}
                  onChange={(e) => setForm({ ...form, ch: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-boc">BOC</FieldLabel>
                <Input
                  id="k-boc"
                  type="number"
                  step="any"
                  value={form.boc}
                  onChange={(e) => setForm({ ...form, boc: e.target.value })}
                />
                <div className="flex gap-1">
                  {[2, 4].map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={!form.ch}
                      onClick={() =>
                        setForm({ ...form, boc: String(Math.round((Number(form.ch) / d) * 10000) / 10000) })
                      }
                    >
                      CH/{d}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="k-fs">FS levels</FieldLabel>
                <Input
                  id="k-fs"
                  value={form.fs}
                  onChange={(e) => setForm({ ...form, fs: e.target.value })}
                  placeholder="165, 180, 210"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-ss">SS levels</FieldLabel>
                <Input
                  id="k-ss"
                  value={form.ss}
                  onChange={(e) => setForm({ ...form, ss: e.target.value })}
                  placeholder="177, 195"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-es">Earnings from</FieldLabel>
                <Input
                  id="k-es"
                  type="date"
                  value={form.earningsStart}
                  onChange={(e) => setForm({ ...form, earningsStart: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-ee">to</FieldLabel>
                <Input
                  id="k-ee"
                  type="date"
                  value={form.earningsEnd}
                  onChange={(e) => setForm({ ...form, earningsEnd: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="k-notes">HG&apos;s notes</FieldLabel>
              <Textarea
                id="k-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
              <FieldDescription>Shown to members on the stock page.</FieldDescription>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              Show to members
            </label>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={dialog.close}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a ticker</DialogTitle>
            <DialogDescription>Set its channel after adding it.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="n-symbol">Ticker</FieldLabel>
              <Input
                id="n-symbol"
                value={newTicker.symbol}
                onChange={(e) => setNewTicker({ ...newTicker, symbol: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="n-name">Company name</FieldLabel>
              <Input
                id="n-name"
                value={newTicker.name}
                onChange={(e) => setNewTicker({ ...newTicker, name: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={newTicker.kind === "etf"}
                onCheckedChange={(v) => setNewTicker({ ...newTicker, kind: v ? "etf" : "stock" })}
              />
              It is an ETF
            </label>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={pending || newTicker.symbol.trim() === ""}>
              {pending && <Spinner />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
