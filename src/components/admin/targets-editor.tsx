"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { LuCircleAlert, LuCircleCheck, LuCopy, LuSave, LuSend, LuTrash2, LuTriangleAlert } from "react-icons/lu"
import type { IsoDate, StrikeTarget } from "@/core/domain/types"
import { formatDateWithWeekday, formatExpiry, formatLevel, formatShortDate } from "@/core/format"
import {
  diffTargets,
  formatTargetLine,
  parseStrikeTargets,
  readTitle,
  targetsToText,
  titleDate,
  type ParseIssue,
  type TargetGroupDef,
} from "@/core/parsers/strike-targets"
import {
  deleteTargetDraft,
  lookUpSymbols,
  publishTargetUpdate,
  saveTargetDraft,
  type SymbolLookup,
} from "@/lib/actions/admin/targets"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToneBadge } from "@/components/portal/display"
import { Level } from "@/components/portal/tools/targets-table"

export interface EditorTicker {
  symbol: string
  lastClose: number | null
  ch: number | null
  boc: number | null
}

export interface EditorInitial {
  mode: "new" | "draft" | "revise"
  draftId: string | null
  /** The update's date; for a new update, today until the pasted title says otherwise. */
  effectiveDate: string
  /** The update written the way HG's Google Doc is. */
  text: string
}

/** Lines that cannot be published as they are. */
const MUST_FIX = new Set<ParseIssue["code"]>(["unparseable", "stray-token", "entry-before-group", "duplicate-ticker"])

/** What a line can be published with, but is worth a second look. Other notes were read fine and stay quiet. */
const CHECKS: Partial<Record<ParseIssue["code"], (entry: StrikeTarget) => string>> = {
  "target-not-above-break": () => "The target is not above the break.",
  "put-equals-break": () => "The put strike is the same as the break.",
  "all-equal": () => "Target, break and put are all the same.",
  "expiry-not-friday": (e) => `Expires ${formatExpiry(e.expiry)}, which is not a Friday.`,
  "expiry-too-far": (e) => `Expires ${formatShortDate(e.expiry)}, more than four months out.`,
}

/** What a line that cannot be published needs, in plain words. */
const FIXES: Partial<Record<ParseIssue["code"], string>> = {
  unparseable: "This line could not be read. Write it like: TSM- 472.50 or break of 465 PUT 457.50 10/23",
  "entry-before-group": "This line comes before any category name. Put the category's name on the line above it.",
}

/** One stock as members will see it, with what changed since the last update struck through. */
function PreviewLine({
  entry,
  isNew,
  previous,
  lastClose,
  name,
  notes,
}: {
  entry: StrikeTarget
  /** Not in the last update. */
  isNew: boolean
  previous: StrikeTarget | undefined
  lastClose: number | null
  name: string | null
  notes: string[]
}) {
  const was = (now: number, before: number | undefined) =>
    before !== undefined && before !== now ? formatLevel(before) : undefined
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 sm:px-5 lg:grid-cols-[2rem_10rem_minmax(0,1fr)_9rem] lg:items-center">
      <span className="pt-1.5 text-sm text-muted-foreground tabular-nums lg:pt-0">{entry.position}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-2xl font-semibold tracking-tight">{entry.symbol}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {entry.dowWeight !== null && <span className="tabular-nums">w {formatLevel(entry.dowWeight)}%</span>}
          {isNew && <ToneBadge tone="neutral">New</ToneBadge>}
          {name && <span className="min-w-0 truncate">{name}</span>}
        </span>
      </span>
      <span className="col-span-2 grid grid-cols-3 gap-4 lg:col-span-1 lg:gap-6">
        <Level label="Target" value={formatLevel(entry.target)} previous={was(entry.target, previous?.target)} strong />
        <Level
          label="Or break of"
          value={formatLevel(entry.breakLevel)}
          previous={was(entry.breakLevel, previous?.breakLevel)}
        />
        <Level label="Put" value={formatLevel(entry.putStrike)} previous={was(entry.putStrike, previous?.putStrike)}>
          <span className="text-xs text-muted-foreground tabular-nums">
            Expires {formatExpiry(entry.expiry)}
            {previous && previous.expiry !== entry.expiry && (
              <span className="ml-1 line-through">{formatExpiry(previous.expiry)}</span>
            )}
          </span>
        </Level>
      </span>
      <span className="col-span-2 text-sm text-muted-foreground tabular-nums lg:col-span-1 lg:text-right">
        {lastClose !== null && <>Last close {formatLevel(lastClose)}</>}
      </span>
      {notes.map((note) => (
        <p key={note} className="col-span-full flex items-start gap-1.5 text-sm text-warning">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {note}
        </p>
      ))}
      {entry.note && <p className="col-span-full text-sm text-muted-foreground">{entry.note}</p>}
    </li>
  )
}

/**
 * HG's weekly strike targets, made from the Google Doc. The text is the only thing to edit: it is read as it
 * is pasted or typed, and the preview shows the update the way members will see it.
 */
export function TargetsEditor({
  initial,
  configGroups,
  tickers,
  history,
}: {
  initial: EditorInitial
  configGroups: TargetGroupDef[]
  tickers: EditorTicker[]
  /** Recent published updates, newest first, and every published date. */
  history: { recent: { effectiveDate: string; entries: StrikeTarget[] }[]; dates: string[] }
}) {
  const router = useRouter()
  const area = useRef<HTMLTextAreaElement>(null)
  const revise = initial.mode === "revise"
  const [text, setText] = useState(initial.text)
  // A new update takes its date from the pasted title ("UPDATE OCT 7") until HG picks one.
  const [pickedDate, setPickedDate] = useState(initial.mode === "new" ? "" : initial.effectiveDate)
  const [notify, setNotify] = useState(true)
  const [changeNote, setChangeNote] = useState("")
  const [draftId, setDraftId] = useState(initial.draftId)
  const [lookups, setLookups] = useState<ReadonlyMap<string, SymbolLookup>>(new Map())
  const [marketOff, setMarketOff] = useState(false)
  const [pending, startTransition] = useTransition()

  const fromTitle = useMemo(() => {
    const title = readTitle(text)
    return title ? titleDate(title, initial.effectiveDate as IsoDate) : null
  }, [text, initial.effectiveDate])
  const effectiveDate = (pickedDate || fromTitle || initial.effectiveDate) as IsoDate
  const parsed = useMemo(
    () => parseStrikeTargets(text, { effectiveDate, groups: configGroups }),
    [text, effectiveDate, configGroups],
  )

  // Compared with the update before this one, whatever date this one ends up with.
  const previous = history.recent.find((u) => u.effectiveDate < effectiveDate) ?? null
  const replaces = !revise && history.dates.includes(effectiveDate)
  const groups = parsed.groups.filter((g) => g.entries.length > 0)
  const entries = groups.flatMap((g) => g.entries.map((e, i) => ({ ...e, position: i + 1 })))
  const bySymbol = new Map(entries.map((e) => [e.symbol, e]))
  const tickerMap = useMemo(() => new Map(tickers.map((t) => [t.symbol, t])), [tickers])
  const previousBySymbol = useMemo(() => new Map((previous?.entries ?? []).map((e) => [e.symbol, e])), [previous])
  const mustFix = parsed.issues.filter((i) => MUST_FIX.has(i.code))
  const notesBySymbol = new Map<string, string[]>()
  for (const issue of parsed.issues) {
    const entry = issue.symbol ? bySymbol.get(issue.symbol) : undefined
    const note = entry ? CHECKS[issue.code]?.(entry) : undefined
    if (issue.symbol && note) notesBySymbol.set(issue.symbol, [...(notesBySymbol.get(issue.symbol) ?? []), note])
  }
  const newSymbols = [...new Set(entries.map((e) => e.symbol))].filter((s) => !tickerMap.has(s))
  for (const s of newSymbols) {
    if (lookups.get(s)?.found === false)
      notesBySymbol.set(s, [
        ...(notesBySymbol.get(s) ?? []),
        "The market data provider does not know this ticker. Check the spelling.",
      ])
  }
  const checkCount = [...notesBySymbol.values()].reduce((n, list) => n + list.length, 0)
  const diff = previous ? diffTargets(previous.entries, entries) : null

  // Names for tickers new to the list, so a typo stands out before publishing.
  const lookupKey = marketOff ? "" : newSymbols.filter((s) => !lookups.has(s)).join(",")
  useEffect(() => {
    if (lookupKey === "") return
    const timer = window.setTimeout(() => {
      void lookUpSymbols(lookupKey.split(",")).then((result) => {
        if (!result.ok) return
        const found = result.data
        if (found === null) {
          setMarketOff(true)
          return
        }
        setLookups((current) => new Map([...current, ...found.map((r) => [r.symbol, r] as const)]))
      })
    }, 600)
    return () => window.clearTimeout(timer)
  }, [lookupKey])

  const lineRange = (line: number) => {
    const lines = text.split("\n")
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
    return [start, start + (lines[line - 1]?.length ?? 0)] as const
  }
  const showLine = (line: number) => {
    const [start, end] = lineRange(line)
    area.current?.focus()
    area.current?.setSelectionRange(start, end)
  }
  const applyFix = (issue: ParseIssue) => {
    const suggestion = issue.suggestion
    if (!suggestion) return
    setText((current) => {
      const lines = current.split("\n")
      const number = /^\s*\d+\.\s*/.exec(lines[issue.line - 1] ?? "")?.[0] ?? ""
      lines[issue.line - 1] = number + formatTargetLine(suggestion)
      return lines.join("\n")
    })
  }
  const startFromPrevious = () => {
    if (!previous) return
    const slugs = [...new Set(previous.entries.map((e) => e.group))]
    setText(
      targetsToText(
        effectiveDate,
        slugs.map((slug) => ({
          name: configGroups.find((g) => g.slug === slug)?.name ?? slug,
          entries: previous.entries.filter((e) => e.group === slug),
        })),
      ),
    )
  }

  const payload = () => ({
    effectiveDate,
    entries,
    sourceText: text.trim() || null,
    groups: groups.map((g) => ({ slug: g.slug, name: g.name })),
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
        description: notify ? "Members are being told." : undefined,
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

  const blocked = entries.length === 0 || mustFix.length > 0 || (revise && changeNote.trim() === "")

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <Card className="min-w-0 xl:col-start-1">
        <CardHeader>
          <CardTitle>{revise ? "The update as text" : "Paste the Google Doc"}</CardTitle>
          <CardDescription>
            The whole update, with its title and category names. It is read as you paste, and the preview below shows it
            the way members will see it. To change something, change it here.
          </CardDescription>
          {previous && text.trim() === "" && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={startFromPrevious}>
                <LuCopy />
                Start from {formatShortDate(previous.effectiveDate as IsoDate)}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <Textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label="Update text"
            placeholder={
              "STRIKE PRICE TARGETS UPDATE OCT 7\nProfit Options Small Channel\n1. TSM- 472.50 or break of 465 PUT 457.50 10/23"
            }
            className="max-h-[32rem] min-h-56 font-mono text-sm leading-6 md:text-sm"
          />
        </CardContent>
      </Card>

      <Card className="xl:sticky xl:top-20 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <CardHeader>
          <CardTitle>{formatDateWithWeekday(effectiveDate)}</CardTitle>
          <CardDescription>
            {revise
              ? "Corrections keep the original date."
              : pickedDate
                ? "The date you picked."
                : fromTitle
                  ? "Read from the title."
                  : "Today, until the title says otherwise."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!revise && (
            <Field>
              <FieldLabel htmlFor="t-date">Update date</FieldLabel>
              <Input id="t-date" type="date" value={effectiveDate} onChange={(e) => setPickedDate(e.target.value)} />
            </Field>
          )}

          {replaces && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              {formatShortDate(effectiveDate)} already has a published update. Publishing replaces it, and members see
              it as a correction.
            </p>
          )}

          <ul className="flex flex-col gap-2.5 text-sm">
            <li className="font-medium">
              {entries.length === 0
                ? "No tickers yet"
                : `${entries.length} ${entries.length === 1 ? "ticker" : "tickers"} in ${groups.map((g) => g.name).join(", ")}`}
            </li>
            {mustFix.length > 0 ? (
              <li className="flex items-center gap-2 text-destructive">
                <LuCircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {mustFix.length} {mustFix.length === 1 ? "line needs" : "lines need"} a fix
              </li>
            ) : entries.length > 0 ? (
              <li className="flex items-center gap-2 text-positive">
                <LuCircleCheck className="size-4 shrink-0" aria-hidden="true" />
                Ready to publish
              </li>
            ) : null}
            {checkCount > 0 && (
              <li className="flex items-center gap-2 text-warning">
                <LuTriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {checkCount} to double-check below
              </li>
            )}
            {diff && entries.length > 0 && (
              <li className="text-muted-foreground">
                Since {formatShortDate(previous?.effectiveDate as IsoDate)}: {diff.added.length} new,{" "}
                {diff.changed.length} changed, {diff.removed.length} dropped
              </li>
            )}
            {newSymbols.length > 0 && (
              <li className="text-muted-foreground">
                New to the ticker list: {newSymbols.join(", ")}. They are added when you publish.
              </li>
            )}
          </ul>

          {revise && (
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
              <span className="block text-sm font-medium">Tell members</span>
              <span className="block text-sm text-muted-foreground">
                A notification to members who keep &quot;New strike targets&quot; on.
              </span>
            </span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>

          <div className="flex flex-col gap-2">
            <Button size="lg" disabled={blocked || pending} onClick={publish}>
              {pending ? <Spinner /> : <LuSend />}
              {revise ? "Publish correction" : "Publish"}
            </Button>
            {!revise && (
              <Button variant="outline" disabled={pending || entries.length === 0} onClick={save}>
                <LuSave />
                Save draft
              </Button>
            )}
            {draftId && initial.mode === "draft" && (
              <Button variant="ghost" className="text-destructive" disabled={pending} onClick={discard}>
                <LuTrash2 />
                Delete draft
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-6 xl:col-start-1">
        {mustFix.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>Needs a fix</CardTitle>
              <CardDescription>These lines are not in the update until they are fixed.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {mustFix.map((issue, i) => (
                <div
                  key={`${issue.line}-${issue.code}-${i}`}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{FIXES[issue.code] ?? issue.message}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      Line {issue.line}: {issue.raw.trim()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {issue.suggestion && (
                      <Button size="sm" onClick={() => applyFix(issue)}>
                        Use put {formatLevel(issue.suggestion.putStrike)}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => showLine(issue.line)}>
                      Show in the text
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {groups.map((g) => (
          <section key={g.slug} aria-label={g.name} className="overflow-hidden rounded-2xl border bg-card">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {g.name}
                {!configGroups.some((c) => c.slug === g.slug) && <ToneBadge tone="neutral">New category</ToneBadge>}
              </h2>
              <span className="text-sm text-muted-foreground">
                {g.entries.length} {g.entries.length === 1 ? "ticker" : "tickers"}
              </span>
            </header>
            <ul className="divide-y">
              {entries
                .filter((e) => e.group === g.slug)
                .map((entry) => (
                  <PreviewLine
                    key={`${entry.symbol}-${entry.position}`}
                    entry={entry}
                    isNew={previous !== null && !previousBySymbol.has(entry.symbol)}
                    previous={previousBySymbol.get(entry.symbol)}
                    lastClose={tickerMap.get(entry.symbol)?.lastClose ?? null}
                    name={lookups.get(entry.symbol)?.name ?? null}
                    notes={notesBySymbol.get(entry.symbol) ?? []}
                  />
                ))}
            </ul>
          </section>
        ))}

        {diff && diff.removed.length > 0 && entries.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Dropped since {formatShortDate(previous?.effectiveDate as IsoDate)}:{" "}
            <span className="font-mono">{diff.removed.map((t) => t.symbol).join(", ")}</span>
          </p>
        )}
      </div>
    </div>
  )
}
