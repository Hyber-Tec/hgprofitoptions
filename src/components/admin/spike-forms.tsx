"use client"

import { useMemo, useState, useTransition } from "react"
import { LuPencil, LuSend, LuTrash2 } from "react-icons/lu"
import type { IsoDate } from "@/core/domain/types"
import { plural } from "@/core/format"
import { defaultSpikeTitle, parseSpikeList, type SpikeAt } from "@/core/spikes"
import { deleteSpike, deleteSpikeList, postSpikeList, updateSpike } from "@/lib/actions/admin/spikes"
import { SpikeTable, type SpikeView } from "@/components/portal/alerts/spike-table"
import { useEditorDialog } from "./use-editor-dialog"
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
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Result = { ok: true } | { ok: false; message: string }
const fail = (result: Result) => {
  if (!result.ok) toast.add({ title: "Not saved", description: result.message, type: "error" })
  return result.ok
}

const EXAMPLE = `Profit options
TSM 421.50 412.35
NVDA 218.53 212.21
META 745 on the close 4:20 PM 10/21, close 648.85`

/**
 * Paste HG's spike list as he writes it, check the preview, and post it. Each line is a ticker, its spike
 * price and the day's close; the session and "on the open" are the defaults a line can override.
 */
export function SpikeListComposer({ defaultDate }: { defaultDate: IsoDate }) {
  const [date, setDate] = useState<string>(defaultDate)
  const [at, setAt] = useState<"open" | "close">("open")
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [notify, setNotify] = useState(true)
  const [pending, startTransition] = useTransition()
  const session = (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaultDate) as IsoDate
  const parsed = useMemo(() => parseSpikeList(text, { date: session, at }), [text, session, at])
  const preview: SpikeView[] = parsed.rows.map((r) => ({
    id: String(r.line),
    symbol: r.symbol,
    price: r.price,
    date: r.date,
    at: r.at,
    time: r.time,
    close: r.close,
    group: r.group,
    recoveredOn: null,
    sessionsToRecover: null,
  }))

  const post = () =>
    startTransition(async () => {
      const result = await postSpikeList({ title, text, date: session, at, notify })
      if (!result.ok) {
        fail(result)
        return
      }
      toast.add({
        title: `${plural(result.data.count, "spike")} posted`,
        description: notify ? "Members are being told." : undefined,
        type: "success",
      })
      setText("")
      setTitle("")
    })

  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-start">
        <Field>
          <FieldLabel htmlFor="s-date">Session</FieldLabel>
          <Input id="s-date" type="date" className="sm:w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Spikes hit</FieldLabel>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[at]}
            onValueChange={(v: string[]) => v[0] && setAt(v[0] as "open" | "close")}
            aria-label="Spikes hit"
          >
            <ToggleGroupItem value="open">On the open</ToggleGroupItem>
            <ToggleGroupItem value="close">On the close</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="s-title">Title</FieldLabel>
          <Input
            id="s-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultSpikeTitle(session)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="s-text">The list</FieldLabel>
        <Textarea
          id="s-text"
          rows={10}
          className="max-h-[28rem] min-h-40 font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
        />
        <FieldDescription>
          Paste HG&apos;s message, one stock per line: the ticker, the spike price, then the day&apos;s close. Write
          &quot;on the close&quot;, a time or a date on a line that differs. A line without prices is a heading.
        </FieldDescription>
      </Field>
      {text.trim() !== "" && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="text-sm font-medium">
            {parsed.rows.length === 0 ? "No spike read yet" : `${plural(parsed.rows.length, "spike")} to post`}
          </p>
          {parsed.issues.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {parsed.issues.map((issue) => (
                <li key={issue.line}>
                  <span className="font-medium">Line {issue.line}:</span> {issue.message}{" "}
                  <span className="text-muted-foreground">It is left out.</span>
                </li>
              ))}
            </ul>
          )}
          {preview.length > 0 && <SpikeTable spikes={preview} listDate={session} linkStocks={false} status={false} />}
        </div>
      )}
      <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <span>
          <span className="block text-sm font-medium">Tell members</span>
          <span className="block text-sm text-muted-foreground">One notification for the whole list.</span>
        </span>
        <Switch checked={notify} onCheckedChange={setNotify} aria-label="Tell members" />
      </label>
      <div>
        <Button disabled={pending || parsed.rows.length === 0} onClick={post}>
          {pending ? <Spinner /> : <LuSend />}
          {parsed.rows.length > 0 ? `Post ${plural(parsed.rows.length, "spike")}` : "Post"}
        </Button>
      </div>
    </FieldGroup>
  )
}

const WHEN_LABELS: Record<SpikeAt, string> = { open: "Open", close: "Close", time: "Time" }

/** Edit or remove one stock in a posted list. */
export function SpikeRowActions({ spike }: { spike: SpikeView }) {
  const dialog = useEditorDialog<SpikeView>()
  const [form, setForm] = useState({
    price: "",
    close: "",
    date: "",
    at: "open" as SpikeAt,
    time: "",
    recoveredOn: "",
  })
  const [pending, startTransition] = useTransition()
  const open = () => {
    setForm({
      price: String(spike.price),
      close: spike.close?.toString() ?? "",
      date: spike.date,
      at: spike.at,
      time: spike.time ?? "",
      recoveredOn: spike.recoveredOn ?? "",
    })
    dialog.show(spike)
  }
  const save = () =>
    startTransition(async () => {
      const result = await updateSpike({
        id: spike.id,
        price: Number(form.price),
        close: form.close.trim() === "" ? null : Number(form.close),
        date: form.date,
        at: form.at,
        time: form.time === "" ? null : form.time,
        recoveredOn: form.recoveredOn === "" ? null : form.recoveredOn,
      })
      if (!fail(result)) return
      toast.add({ title: `${spike.symbol} saved`, type: "success" })
      dialog.close()
    })
  const remove = () =>
    startTransition(async () => {
      if (!window.confirm(`Remove ${spike.symbol} from this list?`)) return
      if (fail(await deleteSpike(spike.id))) toast.add({ title: `${spike.symbol} removed`, type: "success" })
    })
  return (
    <span className="flex justify-end">
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${spike.symbol}`} onClick={open}>
        <LuPencil />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${spike.symbol}`} disabled={pending} onClick={remove}>
        <LuTrash2 />
      </Button>
      <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{spike.symbol} spike</DialogTitle>
            <DialogDescription>Fix a number, or when it happened.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="e-price">Spike price</FieldLabel>
                <Input
                  id="e-price"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="e-close">Day&apos;s close</FieldLabel>
                <Input
                  id="e-close"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={form.close}
                  onChange={(e) => setForm({ ...form, close: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="e-date">Day</FieldLabel>
              <Input
                id="e-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>When</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[form.at]}
                  onValueChange={(v: string[]) => v[0] && setForm({ ...form, at: v[0] as SpikeAt })}
                  aria-label="When"
                >
                  {(["open", "close", "time"] as const).map((v) => (
                    <ToggleGroupItem key={v} value={v}>
                      {WHEN_LABELS[v]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {form.at !== "open" && (
                  <Input
                    type="time"
                    className="w-32"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    aria-label="Time"
                  />
                )}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="e-recovered">Reached the spike price again on</FieldLabel>
              <Input
                id="e-recovered"
                type="date"
                value={form.recoveredOn}
                onChange={(e) => setForm({ ...form, recoveredOn: e.target.value })}
              />
              <FieldDescription>
                Filled in by itself from the daily prices. Set it here only to correct it; leave it empty while it has
                not.
              </FieldDescription>
            </Field>
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
    </span>
  )
}

export function DeleteSpikeListButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (!window.confirm(`Delete "${title}" and every spike in it?`)) return
          if (fail(await deleteSpikeList(id))) toast.add({ title: "Spike list deleted", type: "success" })
        })
      }
    >
      {pending ? <Spinner /> : <LuTrash2 />}
      Delete list
    </Button>
  )
}
