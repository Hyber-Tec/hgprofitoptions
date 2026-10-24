"use client"

import { useMemo, useState, useTransition } from "react"
import { LuDownload, LuPencil, LuPlus, LuSearch } from "react-icons/lu"
import type { IsoDate } from "@/core/domain/types"
import { EARNINGS_TIMINGS, EARNINGS_TIMING_LABELS, describeEarnings, type EarningsTiming } from "@/core/earnings"
import { formatLevel, formatPrice, plural } from "@/core/format"
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
  earningsTiming: EarningsTiming | null
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

const TIMING_ITEMS = [
  { value: "unknown", label: "Time not known" },
  ...EARNINGS_TIMINGS.map((t) => ({
    value: t,
    label: EARNINGS_TIMING_LABELS[t].charAt(0).toUpperCase() + EARNINGS_TIMING_LABELS[t].slice(1),
  })),
]

const levels = (text: string) =>
  text
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

export function TickersManager({ rows, marketData }: { rows: TickerAdminRow[]; marketData: boolean }) {
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
    earningsTiming: "unknown",
    notes: "",
  })
  const [newTicker, setNewTicker] = useState({ symbol: "", ch: "" })
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
      earningsTiming: r.earningsTiming ?? "unknown",
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
        earningsTiming: form.earningsTiming === "unknown" ? null : (form.earningsTiming as EarningsTiming),
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
      const symbol = newTicker.symbol.trim().toUpperCase()
      const result = await createTicker({ symbol, channelSize: newTicker.ch ? Number(newTicker.ch) : null })
      if (!result.ok) {
        toast.add({ title: "Not added", description: result.message, type: "error" })
        return
      }
      const { name, bars, addedToWeek, priced } = result.data
      toast.add({
        title: `${symbol} added${name ? `: ${name}` : ""}`,
        description: !priced
          ? "Its prices arrive once market data is connected."
          : bars === 0
            ? "No prices yet. They arrive after the next close."
            : addedToWeek
              ? "Prices loaded. It is in Key Market Data and the Median & Channel Chart now."
              : "Prices loaded. It joins Key Market Data with the next weekly update.",
        type: "success",
      })
      setAdding(false)
      setNewTicker({ symbol: "", ch: "" })
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
          <span className="text-sm text-muted-foreground tabular-nums">{plural(filtered.length, "ticker")}</span>
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
                  {describeEarnings(
                    r.earningsStart as IsoDate | null,
                    r.earningsEnd as IsoDate | null,
                    r.earningsTiming,
                  ) ?? "-"}
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
                <FieldDescription>Leave empty for a single day.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="k-et">On the day</FieldLabel>
                <Select
                  items={TIMING_ITEMS}
                  value={form.earningsTiming}
                  onValueChange={(v: string | null) => v && setForm({ ...form, earningsTiming: v })}
                >
                  <SelectTrigger id="k-et" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMING_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <DialogDescription>
              {marketData
                ? "Type the symbol. Its name and prices fill in by themselves."
                : "Type the symbol. Prices fill in once market data is connected."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="n-symbol">Ticker</FieldLabel>
                <Input
                  id="n-symbol"
                  value={newTicker.symbol}
                  onChange={(e) => setNewTicker({ ...newTicker, symbol: e.target.value.toUpperCase() })}
                  className="font-mono uppercase"
                  autoComplete="off"
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="n-ch">Channel (optional)</FieldLabel>
                <Input
                  id="n-ch"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={newTicker.ch}
                  onChange={(e) => setNewTicker({ ...newTicker, ch: e.target.value })}
                  placeholder="For example, 6.50"
                />
                <FieldDescription>
                  The stock&apos;s normal moving range. BOC starts at half of it; both can be changed later.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || newTicker.symbol.trim() === ""}>
                {pending && <Spinner />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
