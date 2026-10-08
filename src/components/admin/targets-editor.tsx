"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition, type KeyboardEvent, type ReactNode } from "react"
import {
  LuArrowDown,
  LuArrowUp,
  LuCircleAlert,
  LuCopy,
  LuEye,
  LuFileText,
  LuPlus,
  LuSave,
  LuSend,
  LuTrash2,
  LuTriangleAlert,
  LuWand,
} from "react-icons/lu"
import { channelLadder, nearestLevel } from "@/core/calc/channels"
import { dayOfWeek, isIsoDate } from "@/core/dates"
import type { IsoDate, StrikeTarget } from "@/core/domain/types"
import { formatExpiry, formatLevel } from "@/core/format"
import {
  diffTargets,
  parseStrikeTargets,
  slugify,
  type ParseIssue,
  type TargetGroupDef,
} from "@/core/parsers/strike-targets"
import { deleteTargetDraft, publishTargetUpdate, saveTargetDraft } from "@/lib/actions/admin/targets"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "@/components/portal/display"

export interface EditorRow {
  key: string
  group: string
  symbol: string
  target: string
  breakLevel: string
  putStrike: string
  expiry: string
  dowWeight: string
  note: string | null
}

export interface EditorTicker {
  symbol: string
  lastClose: number | null
  ch: number | null
  boc: number | null
}

export interface EditorInitial {
  mode: "new" | "draft" | "revise"
  draftId: string | null
  effectiveDate: string
  text: string
  rows: EditorRow[]
  groups: { slug: string; name: string }[]
}

type Column = "symbol" | "target" | "breakLevel" | "putStrike" | "expiry" | "dowWeight"

let counter = 0
const newKey = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`
const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v))

export function rowFromEntry(e: StrikeTarget): EditorRow {
  return {
    key: newKey(),
    group: e.group,
    symbol: e.symbol,
    target: String(e.target),
    breakLevel: String(e.breakLevel),
    putStrike: String(e.putStrike),
    expiry: e.expiry,
    dowWeight: e.dowWeight === null ? "" : String(e.dowWeight),
    note: e.note,
  }
}

function rowProblems(
  row: EditorRow,
  known: Set<string>,
  duplicates: Set<string>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const symbol = row.symbol.trim().toUpperCase()
  if (!/^[A-Z][A-Z.]{0,5}$/.test(symbol)) errors.push("Ticker")
  const target = num(row.target)
  const brk = num(row.breakLevel)
  const put = num(row.putStrike)
  if (target === null || target <= 0) errors.push("Target")
  if (brk === null || brk <= 0) errors.push("Break")
  if (put === null || put <= 0) errors.push("Put")
  if (!isIsoDate(row.expiry)) errors.push("Expiry")
  if (errors.length > 0) return { errors, warnings }
  if (target !== null && brk !== null && put !== null) {
    if (target === brk && brk === put) warnings.push("All three values are equal")
    else {
      if (put === brk) warnings.push("Put equals break")
      if (target <= brk) warnings.push("Target is not above break")
    }
  }
  if (dayOfWeek(row.expiry as IsoDate) !== 5) warnings.push("Expiry is not a Friday")
  if (!known.has(symbol)) warnings.push("Not in the ticker list")
  if (duplicates.has(symbol)) warnings.push("Listed twice")
  if (row.note) warnings.push(`Note: ${row.note}`)
  return { errors, warnings }
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground tabular-nums">{children}</span>
}

export function TargetsEditor({
  initial,
  configGroups,
  tickers,
  previous,
}: {
  initial: EditorInitial
  configGroups: TargetGroupDef[]
  tickers: EditorTicker[]
  previous: { effectiveDate: string; entries: StrikeTarget[] } | null
}) {
  const router = useRouter()
  const [effectiveDate, setEffectiveDate] = useState(initial.effectiveDate)
  const [text, setText] = useState(initial.text)
  const [rows, setRows] = useState<EditorRow[]>(initial.rows)
  const [groups, setGroups] = useState(initial.groups)
  const [issues, setIssues] = useState<ParseIssue[]>([])
  const [draftId, setDraftId] = useState(initial.draftId)
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [notify, setNotify] = useState(true)
  const [changeNote, setChangeNote] = useState("")
  const [pending, startTransition] = useTransition()

  const tickerMap = useMemo(() => new Map(tickers.map((t) => [t.symbol, t])), [tickers])
  const known = useMemo(() => new Set(tickers.map((t) => t.symbol)), [tickers])
  const previousBySymbol = useMemo(() => new Map((previous?.entries ?? []).map((e) => [e.symbol, e])), [previous])
  const duplicates = useMemo(() => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const r of rows) {
      const s = r.symbol.trim().toUpperCase()
      if (seen.has(s)) dupes.add(s)
      seen.add(s)
    }
    return dupes
  }, [rows])
  const problems = useMemo(
    () => new Map(rows.map((r) => [r.key, rowProblems(r, known, duplicates)])),
    [rows, known, duplicates],
  )
  const errorCount = [...problems.values()].filter((p) => p.errors.length > 0).length
  const warningCount = [...problems.values()].filter((p) => p.errors.length === 0 && p.warnings.length > 0).length

  const entries = (): StrikeTarget[] => {
    const position = new Map<string, number>()
    return rows.map((r) => {
      const n = (position.get(r.group) ?? 0) + 1
      position.set(r.group, n)
      return {
        group: r.group,
        position: n,
        symbol: r.symbol.trim().toUpperCase(),
        target: num(r.target) ?? 0,
        breakLevel: num(r.breakLevel) ?? 0,
        putStrike: num(r.putStrike) ?? 0,
        expiry: r.expiry as IsoDate,
        dowWeight: num(r.dowWeight),
        note: r.note,
      }
    })
  }

  const readText = () => {
    if (!isIsoDate(effectiveDate)) {
      toast.add({
        title: "Pick the update date first",
        description: "Expiries like 10/23 are read relative to it.",
        type: "error",
      })
      return
    }
    const parsed = parseStrikeTargets(text, { effectiveDate: effectiveDate, groups: configGroups, knownTickers: known })
    setRows(parsed.groups.flatMap((g) => g.entries.map(rowFromEntry)))
    setGroups(parsed.groups.map((g) => ({ slug: g.slug, name: g.name })))
    setIssues(parsed.issues)
    const errors = parsed.issues.filter((i) => i.severity === "error").length
    toast.add({
      title: `Read ${parsed.groups.reduce((n, g) => n + g.entries.length, 0)} tickers in ${parsed.groups.length} categories`,
      description:
        errors > 0
          ? `${errors} ${errors === 1 ? "line needs" : "lines need"} a fix below.`
          : parsed.issues.length > 0
            ? `${parsed.issues.length} ${parsed.issues.length === 1 ? "note" : "notes"} to review.`
            : "No problems found.",
      type: errors > 0 ? "warning" : "success",
    })
  }

  const applySuggestion = (issue: ParseIssue) => {
    const s = issue.suggestion
    if (!s) return
    setRows((current) => {
      const inGroup = current.filter((r) => r.group === s.group)
      const before = inGroup[s.position - 2]
      const index = before ? current.indexOf(before) + 1 : current.findIndex((r) => r.group === s.group)
      const next = [...current]
      next.splice(index < 0 ? next.length : index, 0, rowFromEntry(s))
      return next
    })
    setIssues((list) => list.filter((i) => i !== issue))
  }

  const clonePrevious = () => {
    if (!previous) return
    setRows(previous.entries.map(rowFromEntry))
    const slugs = [...new Set(previous.entries.map((e) => e.group))]
    setGroups(slugs.map((slug) => ({ slug, name: configGroups.find((g) => g.slug === slug)?.name ?? slug })))
    setIssues([])
  }

  const update = (key: string, column: Column | "group", value: string) =>
    setRows((list) =>
      list.map((r) => (r.key === key ? { ...r, [column]: column === "symbol" ? value.toUpperCase() : value } : r)),
    )
  const remove = (key: string) => setRows((list) => list.filter((r) => r.key !== key))
  const move = (key: string, dir: -1 | 1) =>
    setRows((list) => {
      const i = list.findIndex((r) => r.key === key)
      const row = list[i]
      if (!row) return list
      let j = i + dir
      while (j >= 0 && j < list.length && list[j]?.group !== row.group) j += dir
      const other = list[j]
      if (!other) return list
      const next = [...list]
      next[i] = other
      next[j] = row
      return next
    })
  const addRow = (group: string) =>
    setRows((list) => {
      const last = list
        .map((r, i) => (r.group === group ? i : -1))
        .filter((i) => i >= 0)
        .at(-1)
      const row: EditorRow = {
        key: newKey(),
        group,
        symbol: "",
        target: "",
        breakLevel: "",
        putStrike: "",
        expiry: rows.find((r) => r.group === group)?.expiry ?? "",
        dowWeight: "",
        note: null,
      }
      const next = [...list]
      next.splice(last === undefined ? next.length : last + 1, 0, row)
      return next
    })
  const addGroup = (name: string) => {
    const slug = slugify(name)
    if (!slug || groups.some((g) => g.slug === slug)) return
    setGroups((g) => [...g, { slug, name }])
    addRow(slug)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, column: Column) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return
    const dir = event.key === "ArrowUp" ? -1 : 1
    const target = document.querySelector<HTMLInputElement>(`[data-cell="${rowIndex + dir}:${column}"]`)
    if (target) {
      event.preventDefault()
      target.focus()
      target.select()
    }
  }

  const payload = () => ({
    effectiveDate,
    entries: entries(),
    sourceText: text.trim() || null,
    groups: groups.filter((g) => rows.some((r) => r.group === g.slug)),
  })

  const save = () =>
    startTransition(async () => {
      const result = await saveTargetDraft(payload(), draftId)
      if (!result.ok) {
        toast.add({ title: "Not saved", description: result.message, type: "error" })
        return
      }
      setDraftId(result.data.id)
      toast.add({ title: "Draft saved", type: "success" })
      if (!draftId) router.replace(`/admin/targets/${result.data.id}`)
    })

  const publish = () =>
    startTransition(async () => {
      const result = await publishTargetUpdate({ ...payload(), changeNote: changeNote || null, notify }, draftId)
      if (!result.ok) {
        toast.add({ title: "Not published", description: result.message, type: "error" })
        return
      }
      toast.add({
        title: result.data.revision > 1 ? "Correction published" : "Strike targets published",
        description: notify ? "Members are being notified." : undefined,
        type: "success",
      })
      router.push(`/admin/targets/${effectiveDate}`)
    })

  const discard = () =>
    startTransition(async () => {
      if (!draftId) return
      const result = await deleteTargetDraft(draftId)
      if (result.ok) router.replace("/admin/targets")
    })

  const diff = previous ? diffTargets(previous.entries, entries()) : null
  const groupName = (slug: string) =>
    groups.find((g) => g.slug === slug)?.name ?? configGroups.find((g) => g.slug === slug)?.name ?? slug
  const groupItems = groups.map((g) => ({ value: g.slug, label: g.name }))

  if (view === "preview") {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Review before publishing</CardTitle>
            <CardDescription>
              {rows.length} tickers in {new Set(rows.map((r) => r.group)).size} categories, effective {effectiveDate}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              {groups
                .filter((g) => rows.some((r) => r.group === g.slug))
                .map((g) => (
                  <span key={g.slug} className="rounded-lg border px-3 py-1.5 text-sm">
                    {g.name}{" "}
                    <span className="text-muted-foreground tabular-nums">
                      {rows.filter((r) => r.group === g.slug).length}
                    </span>
                  </span>
                ))}
            </div>
            {diff && (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="mb-2 text-sm font-medium">New ({diff.added.length})</p>
                  <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                    {diff.added.map((t) => t.symbol).join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Removed ({diff.removed.length})</p>
                  <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                    {diff.removed.map((t) => t.symbol).join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Changed ({diff.changed.length})</p>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {diff.changed.slice(0, 30).map((c) => (
                      <li key={c.after.symbol}>
                        <span className="font-mono text-foreground">{c.after.symbol}</span>{" "}
                        {c.fields
                          .map((f) =>
                            f === "expiry"
                              ? `expiry ${formatExpiry(c.before.expiry)} → ${formatExpiry(c.after.expiry)}`
                              : f === "group"
                                ? `moved to ${groupName(c.after.group)}`
                                : `${f === "breakLevel" ? "break" : f === "putStrike" ? "put" : "target"} ${formatLevel(c.before[f])} → ${formatLevel(c.after[f])}`,
                          )
                          .join(", ")}
                      </li>
                    ))}
                    {diff.changed.length === 0 && <li>None</li>}
                  </ul>
                </div>
              </div>
            )}
            {initial.mode === "revise" && (
              <Field>
                <FieldLabel htmlFor="t-change">What changed</FieldLabel>
                <Input
                  id="t-change"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="Fixed the TTWO put strike"
                />
                <FieldDescription>Members see this note on the corrected update.</FieldDescription>
              </Field>
            )}
            <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">Notify members</span>
                <span className="block text-sm text-muted-foreground">
                  A browser notification to members who keep &quot;New strike targets&quot; on.
                </span>
              </span>
              <Switch checked={notify} onCheckedChange={setNotify} />
            </label>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setView("edit")}>
            Back to editing
          </Button>
          <Button
            onClick={publish}
            disabled={pending || errorCount > 0 || (initial.mode === "revise" && changeNote.trim() === "")}
          >
            {pending ? <Spinner /> : <LuSend />}
            {initial.mode === "revise" ? "Publish correction" : "Publish"}
          </Button>
        </div>
      </div>
    )
  }

  // Display order (category by category) drives keyboard navigation between rows.
  const displayIndex = new Map(groups.flatMap((g) => rows.filter((r) => r.group === g.slug)).map((r, i) => [r.key, i]))
  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-0">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LuFileText className="size-4" />
              Paste the Google Doc
            </CardTitle>
            <CardDescription>
              Paste the whole update, including the category headings. Lines are read into the grid below, and anything
              unusual is flagged.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="max-h-72 font-mono text-xs"
              placeholder={
                "STRIKE PRICE TARGETS UPDATE OCT 7\nProfit Options Small Channel\nTSM- 472.50 or break of 465 PUT 457.50 10/23"
              }
              aria-label="Update text"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={readText} disabled={text.trim() === ""}>
                <LuWand />
                Read into the grid
              </Button>
              {previous && (
                <Button variant="outline" onClick={clonePrevious}>
                  <LuCopy />
                  Start from the {previous.effectiveDate} update
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Update date</CardTitle>
            <CardDescription>
              {initial.mode === "revise" ? "Corrections keep the original date." : "Usually the Wednesday it goes out."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              disabled={initial.mode === "revise"}
              aria-label="Update date"
            />
            <div className="flex flex-wrap gap-2 text-sm">
              <ToneBadge tone="neutral">{rows.length} tickers</ToneBadge>
              {errorCount > 0 && <ToneBadge tone="negative">{errorCount} to fix</ToneBadge>}
              {warningCount > 0 && <ToneBadge tone="warning">{warningCount} to review</ToneBadge>}
            </div>
          </CardContent>
        </Card>
      </div>

      {issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lines to review</CardTitle>
            <CardDescription>
              From the pasted text. Fixed rows are already in the grid; apply a suggestion to add a row the reader could
              not take as is.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[...issues]
              .sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1))
              .map((issue, i) => (
                <div
                  key={`${issue.line}-${issue.code}-${i}`}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
                    issue.severity === "error" && "border-destructive/40",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {issue.severity === "error" ? (
                      <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                    ) : (
                      <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm">{issue.message}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        Line {issue.line}: {issue.raw.trim()}
                      </p>
                    </div>
                  </div>
                  {issue.suggestion && (
                    <Button size="sm" variant="outline" onClick={() => applySuggestion(issue)}>
                      Apply: {issue.suggestion.symbol} put {formatLevel(issue.suggestion.putStrike)}
                    </Button>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Alert>
          <AlertTitle>No tickers yet</AlertTitle>
          <AlertDescription>Paste the update above, start from the last one, or add a category below.</AlertDescription>
        </Alert>
      ) : (
        groups
          .filter((g) => rows.some((r) => r.group === g.slug))
          .map((g) => (
            <Card key={g.slug}>
              <CardHeader>
                <CardTitle>{g.name}</CardTitle>
                <CardDescription>{rows.filter((r) => r.group === g.slug).length} tickers</CardDescription>
                <CardAction>
                  <Button size="sm" variant="outline" onClick={() => addRow(g.slug)}>
                    <LuPlus />
                    Add ticker
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 pl-4">#</TableHead>
                      <TableHead className="w-28">Ticker</TableHead>
                      <TableHead className="w-28">Target</TableHead>
                      <TableHead className="w-28">Break of</TableHead>
                      <TableHead className="w-28">Put</TableHead>
                      <TableHead className="w-40">Expiry</TableHead>
                      <TableHead className="w-20">Dow w</TableHead>
                      <TableHead className="w-40">Category</TableHead>
                      <TableHead className="pr-4 text-right">Check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      if (r.group !== g.slug) return null
                      const index = displayIndex.get(r.key) ?? 0
                      const t = tickerMap.get(r.symbol.trim().toUpperCase())
                      const ladder =
                        t?.lastClose && t.ch && t.boc ? channelLadder(t.lastClose, { ch: t.ch, boc: t.boc }) : null
                      const prev = previousBySymbol.get(r.symbol.trim().toUpperCase())
                      const p = problems.get(r.key) ?? { errors: [], warnings: [] }
                      const position = rows.filter((x) => x.group === g.slug).indexOf(r) + 1
                      const cell = (
                        column: Column,
                        props: { type?: string; step?: string; className?: string } = {},
                      ) => (
                        <Input
                          data-cell={`${index}:${column}`}
                          value={r[column]}
                          onChange={(e) => update(r.key, column, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, index, column)}
                          aria-label={`${column} for row ${position}`}
                          aria-invalid={
                            p.errors.some((x) =>
                              x
                                .toLowerCase()
                                .startsWith(
                                  column === "breakLevel"
                                    ? "break"
                                    : column === "putStrike"
                                      ? "put"
                                      : column.toLowerCase(),
                                ),
                            ) || undefined
                          }
                          type={props.type ?? "text"}
                          inputMode={column === "symbol" || column === "expiry" ? undefined : "decimal"}
                          step={props.step}
                          className={cn("h-8 tabular-nums", props.className)}
                        />
                      )
                      const levelHint = (value: string) => {
                        const v = num(value)
                        const near = v !== null && ladder ? nearestLevel(v, ladder) : null
                        return near !== null ? <Hint>line {formatLevel(near)}</Hint> : null
                      }
                      return (
                        <TableRow
                          key={r.key}
                          className={cn("align-top hover:bg-transparent", p.errors.length > 0 && "bg-destructive/5")}
                        >
                          <TableCell className="pt-3.5 pl-4 text-muted-foreground tabular-nums">{position}</TableCell>
                          <TableCell>
                            {cell("symbol", { className: "font-mono uppercase" })}
                            {t?.lastClose != null && <Hint>last {formatLevel(t.lastClose)}</Hint>}
                          </TableCell>
                          <TableCell>
                            {cell("target")}
                            {levelHint(r.target)}
                            {prev && prev.target !== num(r.target) && <Hint>was {formatLevel(prev.target)}</Hint>}
                          </TableCell>
                          <TableCell>
                            {cell("breakLevel")}
                            {levelHint(r.breakLevel)}
                            {prev && prev.breakLevel !== num(r.breakLevel) && (
                              <Hint>was {formatLevel(prev.breakLevel)}</Hint>
                            )}
                          </TableCell>
                          <TableCell>
                            {cell("putStrike")}
                            {levelHint(r.putStrike)}
                            {prev && prev.putStrike !== num(r.putStrike) && (
                              <Hint>was {formatLevel(prev.putStrike)}</Hint>
                            )}
                          </TableCell>
                          <TableCell>{cell("expiry", { type: "date" })}</TableCell>
                          <TableCell>{cell("dowWeight")}</TableCell>
                          <TableCell>
                            <Select
                              items={groupItems}
                              value={r.group}
                              onValueChange={(v: string | null) => v && update(r.key, "group", v)}
                            >
                              <SelectTrigger size="sm" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {groupItems.map((gi) => (
                                  <SelectItem key={gi.value} value={gi.value}>
                                    {gi.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="pr-4">
                            <div className="flex items-center justify-end gap-0.5">
                              {(p.errors.length > 0 || p.warnings.length > 0) && (
                                <span
                                  title={[...p.errors.map((e) => `${e} is missing or invalid`), ...p.warnings].join(
                                    "\n",
                                  )}
                                  className="mr-1"
                                >
                                  {p.errors.length > 0 ? (
                                    <LuCircleAlert className="size-4 text-destructive" aria-label="Has errors" />
                                  ) : (
                                    <LuTriangleAlert className="size-4 text-warning" aria-label="Has warnings" />
                                  )}
                                </span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Move up"
                                onClick={() => move(r.key, -1)}
                              >
                                <LuArrowUp />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Move down"
                                onClick={() => move(r.key, 1)}
                              >
                                <LuArrowDown />
                              </Button>
                              <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => remove(r.key)}>
                                <LuTrash2 />
                              </Button>
                            </div>
                            {p.warnings.length > 0 && p.errors.length === 0 && <Hint>{p.warnings.join(" · ")}</Hint>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
      )}

      <AddCategory
        groups={configGroups}
        existing={groups.map((g) => g.slug)}
        onAdd={(slug, name) => {
          if (!groups.some((g) => g.slug === slug)) setGroups((list) => [...list, { slug, name }])
          addRow(slug)
        }}
        onCustom={addGroup}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap gap-2 border-t bg-background/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        {initial.mode !== "revise" && (
          <Button variant="outline" disabled={pending || rows.length === 0} onClick={save}>
            {pending ? <Spinner /> : <LuSave />}
            Save draft
          </Button>
        )}
        <Button disabled={rows.length === 0 || errorCount > 0} onClick={() => setView("preview")}>
          <LuEye />
          Preview and publish
        </Button>
        {draftId && initial.mode === "draft" && (
          <Button variant="ghost" className="ml-auto text-destructive" disabled={pending} onClick={discard}>
            <LuTrash2 />
            Delete draft
          </Button>
        )}
      </div>
    </div>
  )
}

function AddCategory({
  groups,
  existing,
  onAdd,
  onCustom,
}: {
  groups: TargetGroupDef[]
  existing: string[]
  onAdd: (slug: string, name: string) => void
  onCustom: (name: string) => void
}) {
  const [name, setName] = useState("")
  const missing = groups.filter((g) => !existing.includes(g.slug))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {missing.map((g) => (
        <Button key={g.slug} size="sm" variant="outline" onClick={() => onAdd(g.slug, g.name)}>
          <LuPlus />
          {g.name}
        </Button>
      ))}
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New category name"
        className="h-8 w-56"
        aria-label="New category name"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={name.trim().length < 2}
        onClick={() => {
          onCustom(name.trim())
          setName("")
        }}
      >
        <LuPlus />
        Add category
      </Button>
    </div>
  )
}
