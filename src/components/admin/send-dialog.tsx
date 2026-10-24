"use client"

import { useMemo, useState, useTransition } from "react"
import { LuSearch, LuSend } from "react-icons/lu"
import { plural } from "@/core/format"
import { LEVEL_LABELS, TRADER_LEVELS, type TraderLevel } from "@/core/levels"
import type { Audience } from "@/server/notifications"
import { sendPresentation } from "@/lib/actions/admin/content"
import { sendRecording } from "@/lib/actions/admin/recaps"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export interface SendableMember {
  uid: string
  fullName: string
  email: string
  level: TraderLevel
}

/** What is sent: a presentation's slides and recording, or a class recap's recording. */
export type SendTarget =
  | { kind: "presentation"; id: string; title: string; hasSlides: boolean; hasRecording: boolean }
  | { kind: "recording"; recapId: string; title: string }

type To = "everyone" | "levels" | "members"

/**
 * Sends class material to members by email and in the app: every member, chosen levels, or chosen
 * members. Says plainly when email is not set up yet, so only the app notification goes out.
 */
export function SendDialog({
  target,
  members,
  emailReady,
  open,
  onOpenChange,
}: {
  target: SendTarget
  members: SendableMember[]
  emailReady: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [to, setTo] = useState<To>("everyone")
  const [levels, setLevels] = useState<Set<TraderLevel>>(new Set(["beginner"]))
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [slides, setSlides] = useState(target.kind === "presentation" && target.hasSlides)
  const [recording, setRecording] = useState(target.kind === "recording" || target.hasRecording)
  const [pending, startTransition] = useTransition()
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => !q || `${m.fullName} ${m.email}`.toLowerCase().includes(q))
  }, [members, query])
  const toggle = <T,>(set: Set<T>, value: T, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(value)
    else next.delete(value)
    return next
  }
  const count =
    to === "everyone"
      ? members.length
      : to === "levels"
        ? members.filter((m) => levels.has(m.level)).length
        : chosen.size
  const audience: Audience =
    to === "everyone" ? { to } : to === "levels" ? { to, levels: [...levels] } : { to, uids: [...chosen] }

  const send = () =>
    startTransition(async () => {
      const result =
        target.kind === "presentation"
          ? await sendPresentation(target.id, { slides, recording, audience })
          : await sendRecording(target.recapId, audience)
      if (!result.ok) {
        toast.add({ title: "Not sent", description: result.message, type: "error" })
        return
      }
      toast.add({
        title: `Sent to ${plural(result.data.members, "member")}`,
        description: emailReady
          ? `${plural(result.data.emailed, "email")} on the way.`
          : "As a notification in the app.",
        type: "success",
      })
      onOpenChange(false)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.kind === "presentation" ? "Send to members" : "Send the recording"}</DialogTitle>
          <DialogDescription>
            {target.title}.{" "}
            {emailReady
              ? "Members get an email and a notification in the app."
              : "Email is not set up yet, so members get a notification in the app."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {target.kind === "presentation" && (
            <Field>
              <FieldLabel>What</FieldLabel>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox checked={slides} onCheckedChange={setSlides} disabled={!target.hasSlides} />
                  The slides{target.hasSlides ? "" : " (none yet)"}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox checked={recording} onCheckedChange={setRecording} disabled={!target.hasRecording} />
                  The recording{target.hasRecording ? "" : " (add its link first)"}
                </label>
              </div>
            </Field>
          )}
          <Field>
            <FieldLabel>Who</FieldLabel>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[to]}
              onValueChange={(v: string[]) => v[0] && setTo(v[0] as To)}
              aria-label="Who"
            >
              <ToggleGroupItem value="everyone">Every member</ToggleGroupItem>
              <ToggleGroupItem value="levels">By level</ToggleGroupItem>
              <ToggleGroupItem value="members">Choose</ToggleGroupItem>
            </ToggleGroup>
            {to === "levels" && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm">
                {TRADER_LEVELS.map((level) => (
                  <label key={level} className="flex items-center gap-2">
                    <Checkbox
                      checked={levels.has(level)}
                      onCheckedChange={(on) => setLevels((s) => toggle(s, level, on))}
                    />
                    {LEVEL_LABELS[level]}
                  </label>
                ))}
              </div>
            )}
            {to === "members" && (
              <div className="flex flex-col gap-2 pt-1">
                <InputGroup className="h-9">
                  <InputGroupAddon>
                    <LuSearch />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a member"
                    aria-label="Find a member"
                  />
                </InputGroup>
                <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-lg border">
                  {shown.length === 0 ? (
                    <li className="p-3 text-sm text-muted-foreground">No members match.</li>
                  ) : (
                    shown.map((m) => (
                      <li key={m.uid}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                          <Checkbox
                            checked={chosen.has(m.uid)}
                            onCheckedChange={(on) => setChosen((s) => toggle(s, m.uid, on))}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{m.fullName}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {LEVEL_LABELS[m.level]} · {m.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
            <FieldDescription>Members whose membership is active. {plural(count, "member")} chosen.</FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={send}
            disabled={pending || count === 0 || (target.kind === "presentation" && !slides && !recording)}
          >
            {pending ? <Spinner /> : <LuSend />}
            Send to {plural(count, "member")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
