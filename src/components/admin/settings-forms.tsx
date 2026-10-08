"use client"

import { useState, useTransition } from "react"
import { LuPlus, LuRefreshCw, LuSave, LuTrash2 } from "react-icons/lu"
import { WEEKDAYS } from "@/core/schedule"
import {
  recomputeStanding,
  setHouseConnection,
  updateHgVisibility,
  updateMemberSettings,
  updateSiteSettings,
} from "@/lib/actions/admin/settings"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"

type Result = { ok: true } | { ok: false; message: string }
function done(result: Result, success: string): boolean {
  toast.add(
    result.ok
      ? { title: success, type: "success" }
      : { title: "Not saved", description: result.message, type: "error" },
  )
  return result.ok
}

interface ClassRow {
  day: number
  start: string
  end: string
  title: string
  audience: string
}

const DAY_ITEMS = WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))

export function SiteSettingsForm({
  initial,
}: {
  initial: {
    bookingUrl: string
    instagramUrl: string | null
    youtubeUrl: string | null
    xUrl: string | null
    classSchedule: ClassRow[]
  }
}) {
  const [form, setForm] = useState({
    bookingUrl: initial.bookingUrl,
    instagramUrl: initial.instagramUrl ?? "",
    youtubeUrl: initial.youtubeUrl ?? "",
    xUrl: initial.xUrl ?? "",
  })
  const [classes, setClasses] = useState<ClassRow[]>(initial.classSchedule)
  const [pending, startTransition] = useTransition()
  const setClass = (i: number, patch: Partial<ClassRow>) =>
    setClasses((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="s-booking">Booking link</FieldLabel>
        <Input
          id="s-booking"
          value={form.bookingUrl}
          onChange={(e) => setForm({ ...form, bookingUrl: e.target.value })}
        />
        <FieldDescription>Where &quot;Book a call&quot; buttons go (the /book link redirects here).</FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["instagramUrl", "Instagram"],
            ["youtubeUrl", "YouTube"],
            ["xUrl", "X"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key}>
            <FieldLabel htmlFor={`s-${key}`}>{label}</FieldLabel>
            <Input
              id={`s-${key}`}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              placeholder="https://"
            />
          </Field>
        ))}
      </div>
      <Field>
        <FieldLabel>Class schedule (New York time)</FieldLabel>
        <div className="flex flex-col gap-2">
          {classes.map((c, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-lg border p-3 sm:grid-cols-[9rem_8.5rem_8.5rem_1fr] xl:grid-cols-[9rem_8.5rem_8.5rem_1fr_1fr_auto]"
            >
              <Select
                items={DAY_ITEMS}
                value={String(c.day)}
                onValueChange={(v: string | null) => v && setClass(i, { day: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-full max-sm:col-span-2" aria-label="Day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_ITEMS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 max-sm:order-1 max-sm:col-span-3 sm:contents">
                <Input
                  type="time"
                  className="h-8"
                  value={c.start}
                  onChange={(e) => setClass(i, { start: e.target.value })}
                  aria-label="Starts"
                />
                <Input
                  type="time"
                  className="h-8"
                  value={c.end}
                  onChange={(e) => setClass(i, { end: e.target.value })}
                  aria-label="Ends"
                />
              </div>
              <Input
                className="h-8 max-sm:order-2 max-sm:col-span-3 sm:max-xl:order-2 sm:max-xl:col-span-2"
                value={c.title}
                onChange={(e) => setClass(i, { title: e.target.value })}
                placeholder="Beginner session"
                aria-label="Title"
              />
              <Input
                className="h-8 max-sm:order-3 max-sm:col-span-3 sm:max-xl:order-2 sm:max-xl:col-span-2"
                value={c.audience}
                onChange={(e) => setClass(i, { audience: e.target.value })}
                placeholder="Who it is for"
                aria-label="Audience"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="sm:max-xl:justify-self-end"
                aria-label="Remove class"
                onClick={() => setClasses((list) => list.filter((_, j) => j !== i))}
              >
                <LuTrash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setClasses((list) => [...list, { day: 6, start: "19:00", end: "20:00", title: "", audience: "" }])
              }
            >
              <LuPlus />
              Add a class
            </Button>
          </div>
        </div>
      </Field>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(
              async () =>
                void done(await updateSiteSettings({ ...form, classSchedule: classes }), "Site settings saved"),
            )
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save site settings
        </Button>
      </div>
    </FieldGroup>
  )
}

export function MemberSettingsForm({
  initial,
}: {
  initial: {
    zoomUrl: string | null
    whatsappUrl: string | null
    oneOnOneUrl: string | null
    expiringSoonDays: number
    sessionLimit: number
    setupTags: string[]
  }
}) {
  const [form, setForm] = useState({
    zoomUrl: initial.zoomUrl ?? "",
    whatsappUrl: initial.whatsappUrl ?? "",
    oneOnOneUrl: initial.oneOnOneUrl ?? "",
    expiringSoonDays: String(initial.expiringSoonDays),
    sessionLimit: String(initial.sessionLimit),
    setupTags: initial.setupTags.join(", "),
  })
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="m-zoom">Zoom link</FieldLabel>
          <Input
            id="m-zoom"
            value={form.zoomUrl}
            onChange={(e) => set("zoomUrl", e.target.value)}
            placeholder="https://zoom.us/j/..."
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="m-wa">WhatsApp group link</FieldLabel>
          <Input
            id="m-wa"
            value={form.whatsappUrl}
            onChange={(e) => set("whatsappUrl", e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="m-1on1">One-on-one booking link</FieldLabel>
          <Input
            id="m-1on1"
            value={form.oneOnOneUrl}
            onChange={(e) => set("oneOnOneUrl", e.target.value)}
            placeholder="https://"
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="m-exp">&quot;Expiring soon&quot; after</FieldLabel>
          <Input
            id="m-exp"
            type="number"
            min={1}
            max={60}
            value={form.expiringSoonDays}
            onChange={(e) => set("expiringSoonDays", e.target.value)}
          />
          <FieldDescription>Days left before members see the renewal notice.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="m-sessions">Signed-in browsers per member</FieldLabel>
          <Input
            id="m-sessions"
            type="number"
            min={1}
            max={10}
            value={form.sessionLimit}
            onChange={(e) => set("sessionLimit", e.target.value)}
          />
          <FieldDescription>A new sign-in beyond this signs out the oldest.</FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="m-setups">Journal setups</FieldLabel>
        <Input id="m-setups" value={form.setupTags} onChange={(e) => set("setupTags", e.target.value)} />
        <FieldDescription>The setups members can tag their trades with, separated by commas.</FieldDescription>
      </Field>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(
              async () =>
                void done(
                  await updateMemberSettings({
                    zoomUrl: form.zoomUrl,
                    whatsappUrl: form.whatsappUrl,
                    oneOnOneUrl: form.oneOnOneUrl,
                    expiringSoonDays: Number(form.expiringSoonDays),
                    sessionLimit: Number(form.sessionLimit),
                    setupTags: form.setupTags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }),
                  "Member settings saved",
                ),
            )
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save member settings
        </Button>
      </div>
    </FieldGroup>
  )
}

export function HgVisibilityForm({
  initial,
}: {
  initial: { showDollars: boolean; showPositions: boolean; showClosedTrades: boolean; positionDelayHours: number }
}) {
  const [form, setForm] = useState(initial)
  const [pending, startTransition] = useTransition()
  const toggle = (key: "showDollars" | "showPositions" | "showClosedTrades", label: string, description: string) => (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <Switch checked={form[key]} onCheckedChange={(v) => setForm({ ...form, [key]: v })} />
    </label>
  )
  return (
    <FieldGroup>
      {toggle("showDollars", "Show dollar amounts", "Off by default: members see percentages only.")}
      {toggle("showPositions", "Show open positions", "Off by default. Members see positions by weight.")}
      {toggle("showClosedTrades", "Show closed trades", "On by default: the result of each closed trade.")}
      <Field className="sm:max-w-64">
        <FieldLabel htmlFor="h-delay">Position delay (hours)</FieldLabel>
        <Input
          id="h-delay"
          type="number"
          min={0}
          max={168}
          value={form.positionDelayHours}
          onChange={(e) => setForm({ ...form, positionDelayHours: Number(e.target.value) })}
        />
        <FieldDescription>How long after HG opens a position before members can see it.</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => void done(await updateHgVisibility(form), "Saved and HG standing refreshed"))
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => void done(await recomputeStanding(), "HG standing refreshed"))}
        >
          <LuRefreshCw />
          Refresh standing now
        </Button>
      </div>
    </FieldGroup>
  )
}

export function HouseSwitch({ uid, connectionId, isHouse }: { uid: string; connectionId: string; isHouse: boolean }) {
  const [value, setValue] = useState(isHouse)
  const [pending, startTransition] = useTransition()
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label="HG house account"
      onCheckedChange={(on) =>
        startTransition(async () => {
          setValue(on)
          if (
            !done(
              await setHouseConnection(uid, connectionId, on),
              on ? "Marked as a house account" : "No longer a house account",
            )
          )
            setValue(!on)
        })
      }
    />
  )
}
