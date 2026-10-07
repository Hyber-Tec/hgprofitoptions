"use client"

import { useState, useTransition } from "react"
import { LuSave } from "react-icons/lu"
import { saveJournalDay } from "@/lib/actions/journal"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export interface DayNote {
  date: string
  body: string
  mood: number | null
}

const MOODS = ["Rough", "Off", "Okay", "Good", "Great"]
const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const label = (date: string) => LONG_DATE.format(new Date(`${date}T12:00:00Z`))

/** A free-form market diary, one note per day. */
export function DailyNotes({ notes, today, editable }: { notes: DayNote[]; today: string; editable: boolean }) {
  const [date, setDate] = useState(today)
  const existing = notes.find((n) => n.date === date)
  const [body, setBody] = useState(existing?.body ?? "")
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null)
  const [pending, startTransition] = useTransition()

  const pick = (next: string) => {
    const note = notes.find((n) => n.date === next)
    setDate(next)
    setBody(note?.body ?? "")
    setMood(note?.mood ?? null)
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveJournalDay({ date, body, mood })
      toast.add(
        result.ok
          ? { title: "Note saved", type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>{label(date)}</CardTitle>
          <CardDescription>What happened in the market, what you did and how you felt.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-44">
              <FieldLabel htmlFor="note-date">Day</FieldLabel>
              <Input
                id="note-date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && pick(e.target.value)}
              />
            </Field>
            <Field className="w-auto">
              <FieldLabel>Mood</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={mood === null ? [] : [String(mood)]}
                onValueChange={(v: string[]) => setMood(v[0] ? Number(v[0]) : null)}
                disabled={!editable}
                aria-label="Mood"
              >
                {MOODS.map((m, i) => (
                  <ToggleGroupItem key={m} value={String(i + 1)}>
                    {m}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Choppy open. Waited for the 10 AM candle..."
            readOnly={!editable}
            aria-label="Note"
          />
          {editable && (
            <div>
              <Button onClick={save} disabled={pending}>
                {pending ? <Spinner /> : <LuSave />}
                Save note
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Recent notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
          {notes.map((n) => (
            <button
              key={n.date}
              type="button"
              onClick={() => pick(n.date)}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                n.date === date && "bg-muted",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                {label(n.date)}
                {n.mood !== null && (
                  <span className="text-xs font-normal text-muted-foreground">{MOODS[n.mood - 1]}</span>
                )}
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
