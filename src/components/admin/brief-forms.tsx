"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuClock, LuPlus, LuSave, LuSend, LuSparkles, LuTrash2, LuX } from "react-icons/lu"
import { deleteBrief, saveBrief, tryBriefWithAi, updateBriefSettings } from "@/lib/actions/admin/briefs"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

export interface BriefFormValue {
  id: string | null
  title: string
  body: string
  status: "draft" | "scheduled" | "published" | null
  /** "2026-10-23T09:40" in New York, for a scheduled brief. */
  publishAt: string | null
  notify: boolean
}

type When = "now" | "later" | "draft"
const OTHER = "other"

/**
 * Paste the brief (or write it), then post it now, at one of the brief's times, or keep it as a draft.
 * `slots` are the next brief times ("Today, 9:40 AM") offered for scheduling.
 */
export function BriefComposer({
  initial,
  slots,
}: {
  initial: BriefFormValue
  slots: { value: string; label: string }[]
}) {
  const router = useRouter()
  const published = initial.status === "published"
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [when, setWhen] = useState<When>(published ? "now" : initial.status === "scheduled" ? "later" : "now")
  const [slot, setSlot] = useState(initial.publishAt ?? slots[0]?.value ?? OTHER)
  const [custom, setCustom] = useState(initial.publishAt ?? "")
  const [notify, setNotify] = useState(initial.notify)
  const [pending, startTransition] = useTransition()
  const slotItems = [...slots, { value: OTHER, label: "Another time" }]
  const publishAt = when === "later" ? (slot === OTHER ? custom : slot) || null : null

  const submit = () =>
    startTransition(async () => {
      const result = await saveBrief({ id: initial.id, title, body, when, publishAt, notify })
      if (!fail(result)) return
      toast.add({
        title: published
          ? "Changes saved"
          : when === "now"
            ? "Brief posted"
            : when === "later"
              ? "Brief scheduled"
              : "Draft saved",
        type: "success",
      })
      if (initial.id) router.replace("/admin/briefs")
      else {
        setTitle("")
        setBody("")
      }
    })

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="b-title">Title</FieldLabel>
        <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pre-market brief" />
      </Field>
      <Field>
        <FieldLabel htmlFor="b-body">The brief</FieldLabel>
        <Textarea
          id="b-body"
          rows={12}
          className="max-h-[32rem] min-h-48"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste the brief here. Blank lines start a new paragraph; lines starting with - become a list."
        />
      </Field>
      {!published && (
        <Field>
          <FieldLabel>When</FieldLabel>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[when]}
            onValueChange={(v: string[]) => v[0] && setWhen(v[0] as When)}
            aria-label="When"
          >
            <ToggleGroupItem value="now">Now</ToggleGroupItem>
            <ToggleGroupItem value="later">At a set time</ToggleGroupItem>
            <ToggleGroupItem value="draft">Draft</ToggleGroupItem>
          </ToggleGroup>
          {when === "later" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select items={slotItems} value={slot} onValueChange={(v: string | null) => v && setSlot(v)}>
                <SelectTrigger className="w-full sm:w-64" aria-label="Brief time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slotItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {slot === OTHER && (
                <Input
                  type="datetime-local"
                  className="sm:w-56"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  aria-label="Day and time"
                />
              )}
            </div>
          )}
          <FieldDescription>New York time. A scheduled brief goes out by itself.</FieldDescription>
        </Field>
      )}
      {!published && (
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Tell members</span>
            <span className="block text-sm text-muted-foreground">A notification when it is posted.</span>
          </span>
          <Switch checked={notify} onCheckedChange={setNotify} aria-label="Tell members" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={submit}>
          {pending ? (
            <Spinner />
          ) : published ? (
            <LuSave />
          ) : when === "now" ? (
            <LuSend />
          ) : when === "later" ? (
            <LuClock />
          ) : (
            <LuSave />
          )}
          {published ? "Save changes" : when === "now" ? "Post now" : when === "later" ? "Schedule" : "Save draft"}
        </Button>
        {initial.id && (
          <Button variant="outline" disabled={pending} onClick={() => router.replace("/admin/briefs")}>
            Cancel
          </Button>
        )}
      </div>
    </FieldGroup>
  )
}

export function DeleteBriefButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${title}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (!window.confirm(`Delete "${title}"? Members will no longer see it.`)) return
          if (fail(await deleteBrief(id))) toast.add({ title: "Brief deleted", type: "success" })
        })
      }
    >
      {pending ? <Spinner /> : <LuTrash2 />}
    </Button>
  )
}

/** The brief's times on market days, and the AI writing it then with the team's instructions. */
export function BriefSettingsForm({
  initial,
  aiReady,
}: {
  initial: { times: string[]; ai: { enabled: boolean; instructions: string } }
  aiReady: boolean
}) {
  const router = useRouter()
  const [times, setTimes] = useState(initial.times)
  const [newTime, setNewTime] = useState("")
  const [enabled, setEnabled] = useState(initial.ai.enabled)
  const [instructions, setInstructions] = useState(initial.ai.instructions)
  const [pending, startTransition] = useTransition()
  const [trying, startTrying] = useTransition()
  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return
    setTimes((list) => [...new Set([...list, newTime])].sort())
    setNewTime("")
  }
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Brief times</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          {times.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-sm tabular-nums"
            >
              {t}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${t}`}
                onClick={() => setTimes((list) => list.filter((x) => x !== t))}
              >
                <LuX />
              </Button>
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <Input
              type="time"
              className="h-8 w-32"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              aria-label="Another time"
            />
            <Button variant="outline" size="sm" onClick={add} disabled={newTime === ""}>
              <LuPlus />
              Add
            </Button>
          </span>
        </div>
        <FieldDescription>New York time, on market days. They are offered when you schedule a brief.</FieldDescription>
      </Field>
      <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <span>
          <span className="block text-sm font-medium">AI writes and posts the brief at these times</span>
          <span className="block text-sm text-muted-foreground">
            {aiReady
              ? "Following the instructions below, with the site's data: the index closes, strike targets, spikes and earnings."
              : "AI is not set up on the server yet."}
          </span>
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!aiReady}
          aria-label="AI writes and posts the brief at these times"
        />
      </label>
      <Field>
        <FieldLabel htmlFor="b-instructions">Instructions for the AI</FieldLabel>
        <Textarea
          id="b-instructions"
          rows={6}
          className="max-h-96"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="The process the team uses for the brief today: what it covers and how it reads."
        />
        <FieldDescription>Try them first: the AI writes a draft below that nobody else sees.</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (fail(await updateBriefSettings({ times, ai: { enabled, instructions } })))
                toast.add({ title: "Brief settings saved", type: "success" })
            })
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save
        </Button>
        <Button
          variant="outline"
          disabled={!aiReady || trying || instructions.trim() === ""}
          onClick={() =>
            startTrying(async () => {
              const result = await tryBriefWithAi(instructions)
              if (!result.ok) {
                fail(result)
                return
              }
              toast.add({
                title: "The AI wrote a draft",
                description: "Check it, then post it or delete it.",
                type: "success",
              })
              router.replace(`/admin/briefs?edit=${result.data.id}` as Route)
            })
          }
        >
          {trying ? <Spinner /> : <LuSparkles />}
          {trying ? "Writing" : "Try it now"}
        </Button>
      </div>
    </FieldGroup>
  )
}
