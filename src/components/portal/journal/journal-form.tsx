"use client"

import { useState, useTransition } from "react"
import { LuSave } from "react-icons/lu"
import { saveTradeJournal } from "@/lib/actions/journal"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export interface JournalValues {
  setup: string | null
  thesis: string | null
  plan: string | null
  outcome: string | null
  lesson: string | null
  emotions: string[]
  rating: number | null
  tags: string[]
  alertId: string | null
}

const EMOTIONS = [
  "Calm",
  "Confident",
  "Disciplined",
  "Patient",
  "Anxious",
  "Impatient",
  "Greedy",
  "Fearful",
  "FOMO",
  "Revenge",
]
const NONE = "__none__"

export function JournalForm({
  tradeId,
  initial,
  setupTags,
  alerts,
  editable,
}: {
  tradeId: string
  initial: JournalValues
  setupTags: string[]
  alerts: { id: string; title: string }[]
  editable: boolean
}) {
  const [values, setValues] = useState(initial)
  const [tags, setTags] = useState(initial.tags.join(", "))
  const [pending, startTransition] = useTransition()
  const set = <K extends keyof JournalValues>(key: K, value: JournalValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const setups = [...new Set([...setupTags, ...(initial.setup ? [initial.setup] : [])])]
  const setupItems = [{ value: NONE, label: "No setup" }, ...setups.map((s) => ({ value: s, label: s }))]
  const alertItems = [
    { value: NONE, label: "Not linked to an alert" },
    ...alerts.map((a) => ({ value: a.id, label: a.title })),
  ]

  const save = () =>
    startTransition(async () => {
      const result = await saveTradeJournal(tradeId, {
        ...values,
        thesis: values.thesis ?? "",
        plan: values.plan ?? "",
        outcome: values.outcome ?? "",
        lesson: values.lesson ?? "",
        setup: values.setup ?? "",
        tags: tags
          .split(/[,#\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
      })
      toast.add(
        result.ok
          ? { title: "Journal saved", type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
    })

  const area = (key: "thesis" | "plan" | "outcome" | "lesson", label: string, placeholder: string) => (
    <Field>
      <FieldLabel htmlFor={`j-${key}`}>{label}</FieldLabel>
      <Textarea
        id={`j-${key}`}
        rows={3}
        value={values[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        readOnly={!editable}
      />
    </Field>
  )

  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Setup</FieldLabel>
          <Select
            items={setupItems}
            value={values.setup ?? NONE}
            onValueChange={(v: string | null) => set("setup", !v || v === NONE ? null : v)}
            disabled={!editable}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {setupItems.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>HG alert</FieldLabel>
          <Select
            items={alertItems}
            value={values.alertId ?? NONE}
            onValueChange={(v: string | null) => set("alertId", !v || v === NONE ? null : v)}
            disabled={!editable}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {alertItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {area("thesis", "Thesis", "Why this trade, why now?")}
      {area("plan", "Plan", "Entry, target and stop")}
      {area("outcome", "Outcome", "What happened?")}
      {area("lesson", "Lesson", "What will you repeat or change?")}
      <Field>
        <FieldLabel>Emotions</FieldLabel>
        <ToggleGroup
          variant="outline"
          size="sm"
          multiple
          value={values.emotions}
          onValueChange={(v: string[]) => set("emotions", v)}
          disabled={!editable}
          className="flex-wrap"
        >
          {EMOTIONS.map((e) => (
            <ToggleGroupItem key={e} value={e}>
              {e}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Rating</FieldLabel>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={values.rating === null ? [] : [String(values.rating)]}
            onValueChange={(v: string[]) => set("rating", v[0] ? Number(v[0]) : null)}
            disabled={!editable}
            aria-label="Rating from 1 to 5"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className="w-9">
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>How well you followed your plan, not the result.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="j-tags">Tags</FieldLabel>
          <Input
            id="j-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="swing, earnings"
            readOnly={!editable}
          />
          <FieldDescription>Separate with commas.</FieldDescription>
        </Field>
      </div>
      {editable && (
        <div>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner /> : <LuSave />}
            Save journal
          </Button>
        </div>
      )}
    </FieldGroup>
  )
}
