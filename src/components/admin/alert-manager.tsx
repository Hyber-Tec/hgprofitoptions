"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuCircleCheck, LuMessageSquarePlus, LuPencil, LuTrash2 } from "react-icons/lu"
import { cancelAlertAction, closeAlertAction, postFollowUpAction, reviseAlertAction } from "@/lib/actions/admin/alerts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const num = (v: string) => (v.trim() === "" ? null : Number(v))
const PORTIONS = [
  { value: "0.25", label: "25%" },
  { value: "0.5", label: "Half" },
  { value: "1", label: "All" },
]

function notify(result: { ok: true } | { ok: false; message: string }, success: string): boolean {
  toast.add(
    result.ok
      ? { title: success, type: "success" }
      : { title: "Not saved", description: result.message, type: "error" },
  )
  return result.ok
}

/** Post a sell (with the exit) or an update under an open alert. Members are notified. */
export function FollowUpForm({
  alertId,
  remaining,
  isOption,
}: {
  alertId: string
  remaining: number
  isOption: boolean
}) {
  const [kind, setKind] = useState<"sell" | "update">(remaining > 0 ? "sell" : "update")
  const [body, setBody] = useState("")
  const [price, setPrice] = useState("")
  const [portion, setPortion] = useState(remaining >= 1 ? "0.5" : String(remaining))
  const [pending, startTransition] = useTransition()
  const portions = PORTIONS.filter((p) => Number(p.value) <= remaining + 0.001)

  const submit = () =>
    startTransition(async () => {
      const result = await postFollowUpAction(alertId, {
        kind,
        body,
        price: kind === "sell" ? num(price) : null,
        portion: kind === "sell" ? Number(portion) : null,
      })
      if (notify(result.ok ? { ok: true } : result, kind === "sell" ? "Sell posted" : "Update posted")) {
        setBody("")
        setPrice("")
      }
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuMessageSquarePlus className="size-4" />
          Post a follow-up
        </CardTitle>
        <CardDescription>Members get a notification and see it under this alert.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[kind]}
            onValueChange={(v: string[]) => v[0] && setKind(v[0] as "sell" | "update")}
            aria-label="Follow-up kind"
          >
            <ToggleGroupItem value="sell" disabled={remaining <= 0} className="h-10 px-4">
              Sell
            </ToggleGroupItem>
            <ToggleGroupItem value="update" className="h-10 px-4">
              Update
            </ToggleGroupItem>
          </ToggleGroup>
          {kind === "sell" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="f-price">{isOption ? "Sold at (premium)" : "Sold at"}</FieldLabel>
                <Input
                  id="f-price"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className="h-10"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Portion of the position</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[portion]}
                  onValueChange={(v: string[]) => v[0] && setPortion(v[0])}
                  aria-label="Portion"
                >
                  {portions.map((p) => (
                    <ToggleGroupItem key={p.value} value={p.value} className="h-10 px-3">
                      {p.label}
                    </ToggleGroupItem>
                  ))}
                  {!portions.some((p) => Math.abs(Number(p.value) - remaining) < 0.001) && remaining > 0 && (
                    <ToggleGroupItem value={String(remaining)} className="h-10 px-3">
                      Rest ({Math.round(remaining * 100)}%)
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>
                <FieldDescription>{Math.round(remaining * 100)}% is still open.</FieldDescription>
              </Field>
            </div>
          )}
          <Field>
            <FieldLabel htmlFor="f-body">Message</FieldLabel>
            <Textarea
              id="f-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                kind === "sell"
                  ? "Sold half at T1. Moving the stop to break-even."
                  : "Still holding. Earnings next week, so size down."
              }
            />
          </Field>
          <div>
            <Button
              onClick={submit}
              disabled={pending || body.trim() === "" || (kind === "sell" && num(price) === null)}
            >
              {pending ? <Spinner /> : <LuMessageSquarePlus />}
              Post and notify
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

/** Record exits without posting a follow-up, for example to back-fill a trade closed in class. */
export function CloseAlertForm({ alertId, remaining }: { alertId: string; remaining: number }) {
  const [price, setPrice] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuCircleCheck className="size-4" />
          Close quietly
        </CardTitle>
        <CardDescription>
          Closes the remaining {Math.round(remaining * 100)}% at one price, without a notification.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor="c-price">Exit price</FieldLabel>
          <Input
            id="c-price"
            type="number"
            inputMode="decimal"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          disabled={pending || num(price) === null}
          onClick={() =>
            startTransition(async () => {
              const result = await closeAlertAction(alertId, [{ price: Number(price), portion: remaining }])
              if (notify(result, "Alert closed")) setPrice("")
            })
          }
        >
          {pending && <Spinner />}
          Close
        </Button>
      </CardContent>
    </Card>
  )
}

/** Corrections after publishing: the previous version is kept and members see "edited". */
export function ReviseAlertForm({
  alertId,
  initial,
}: {
  alertId: string
  initial: {
    title: string
    body: string
    buyLow: number | null
    buyHigh: number | null
    sellPoints: number[]
    stop: number | null
  }
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: initial.title,
    body: initial.body,
    buyLow: initial.buyLow?.toString() ?? "",
    buyHigh: initial.buyHigh?.toString() ?? "",
    t1: initial.sellPoints[0]?.toString() ?? "",
    t2: initial.sellPoints[1]?.toString() ?? "",
    t3: initial.sellPoints[2]?.toString() ?? "",
    stop: initial.stop?.toString() ?? "",
    note: "",
  })
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LuPencil />
        Correct this alert
      </Button>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Correct this alert</CardTitle>
        <CardDescription>Members see that it was edited, and the earlier version stays in its history.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="r-title">Title</FieldLabel>
            <Input id="r-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["buyLow", "Buy from"],
                ["buyHigh", "Buy to"],
                ["stop", "Stop"],
                ["t1", "T1"],
                ["t2", "T2"],
                ["t3", "T3"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`r-${key}`}>{label}</FieldLabel>
                <Input
                  id={`r-${key}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <Field>
            <FieldLabel htmlFor="r-body">Note</FieldLabel>
            <Textarea id="r-body" rows={4} value={form.body} onChange={(e) => set("body", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="r-note">What changed</FieldLabel>
            <Input
              id="r-note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="Fixed the T2 price"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              disabled={pending || form.note.trim() === ""}
              onClick={() =>
                startTransition(async () => {
                  const result = await reviseAlertAction(alertId, {
                    title: form.title,
                    body: form.body,
                    buyLow: num(form.buyLow),
                    buyHigh: num(form.buyHigh),
                    sellPoints: [form.t1, form.t2, form.t3].map(num).filter((v): v is number => v !== null),
                    stop: num(form.stop),
                    changeNote: form.note,
                  })
                  if (notify(result, "Correction published")) setOpen(false)
                })
              }
            >
              {pending && <Spinner />}
              Publish correction
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

export function DiscardAlertButton({ alertId, scheduled }: { alertId: string; scheduled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>
        <LuTrash2 />
        {scheduled ? "Cancel schedule" : "Delete draft"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{scheduled ? "Cancel this scheduled alert?" : "Delete this draft?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {scheduled
              ? "It will not be published. You can still see it in the list as cancelled."
              : "The draft is removed. Nothing was sent to members."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelAlertAction(alertId)
                if (notify(result, scheduled ? "Schedule cancelled" : "Draft deleted")) router.replace("/admin/alerts")
              })
            }
          >
            {pending && <Spinner />}
            {scheduled ? "Cancel schedule" : "Delete draft"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
