"use client"

import { useState, useTransition } from "react"
import { LuPlus, LuRefreshCw, LuSave, LuTrash2 } from "react-icons/lu"
import { LEVEL_LABELS, type TraderLevel } from "@/core/levels"
import { AUDIENCE_LABELS, CLASS_AUDIENCES, WEEKDAYS, type ClassAudience, type ClassSession } from "@/core/schedule"
import { formatMeetingId, zoomMeetingNumber } from "@/core/zoom"
import {
  recomputeStanding,
  setHouseConnection,
  updateHgVisibility,
  updateClassSchedule,
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

const DAY_ITEMS = WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))
const AUDIENCE_ITEMS = CLASS_AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))
const REMINDER_ITEMS = [
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
]

export function SiteSettingsForm({
  initial,
}: {
  initial: { bookingUrl: string; instagramUrl: string | null; youtubeUrl: string | null; xUrl: string | null }
}) {
  const [form, setForm] = useState({
    bookingUrl: initial.bookingUrl,
    instagramUrl: initial.instagramUrl ?? "",
    youtubeUrl: initial.youtubeUrl ?? "",
    xUrl: initial.xUrl ?? "",
  })
  const [pending, startTransition] = useTransition()
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
      <div>
        <Button
          disabled={pending}
          onClick={() => startTransition(async () => void done(await updateSiteSettings(form), "Site settings saved"))}
        >
          {pending ? <Spinner /> : <LuSave />}
          Save site settings
        </Button>
      </div>
    </FieldGroup>
  )
}

/** The weekly classes, and when members are reminded of them. */
export function ClassScheduleForm({
  initial,
}: {
  initial: { classSchedule: ClassSession[]; classReminderMinutes: number | null }
}) {
  const [classes, setClasses] = useState<ClassSession[]>(initial.classSchedule)
  const [reminders, setReminders] = useState(initial.classReminderMinutes !== null)
  const [minutes, setMinutes] = useState(String(initial.classReminderMinutes ?? 60))
  const [pending, startTransition] = useTransition()
  const setClass = (i: number, patch: Partial<ClassSession>) =>
    setClasses((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <FieldGroup>
      <div className="flex flex-col gap-3">
        {classes.map((c, i) => (
          <fieldset
            key={i}
            aria-label={c.title || `Class ${String(i + 1)}`}
            className="grid grid-cols-2 gap-3 rounded-lg border p-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
          >
            <Field>
              <FieldLabel htmlFor={`c-day-${String(i)}`}>Day</FieldLabel>
              <Select
                items={DAY_ITEMS}
                value={String(c.day)}
                onValueChange={(v: string | null) => v && setClass(i, { day: Number(v) })}
              >
                <SelectTrigger id={`c-day-${String(i)}`} className="w-full">
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
            </Field>
            <Field className="max-lg:order-2">
              <FieldLabel htmlFor={`c-start-${String(i)}`}>Starts</FieldLabel>
              <Input
                id={`c-start-${String(i)}`}
                type="time"
                value={c.start}
                onChange={(e) => setClass(i, { start: e.target.value })}
              />
            </Field>
            <Field className="max-lg:order-2">
              <FieldLabel htmlFor={`c-end-${String(i)}`}>Ends</FieldLabel>
              <Input
                id={`c-end-${String(i)}`}
                type="time"
                value={c.end}
                onChange={(e) => setClass(i, { end: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`c-audience-${String(i)}`}>Who it is for</FieldLabel>
              <Select
                items={AUDIENCE_ITEMS}
                value={c.audience}
                onValueChange={(v: string | null) => v && setClass(i, { audience: v as ClassAudience })}
              >
                <SelectTrigger id={`c-audience-${String(i)}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_ITEMS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="col-span-2 flex justify-end max-lg:order-4 lg:col-span-1 lg:pt-6">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${c.title || "this class"}`}
                onClick={() => setClasses((list) => list.filter((_, j) => j !== i))}
              >
                <LuTrash2 />
                <span className="lg:sr-only">Remove</span>
              </Button>
            </div>
            <Field className="col-span-2 max-lg:order-3">
              <FieldLabel htmlFor={`c-title-${String(i)}`}>Title</FieldLabel>
              <Input
                id={`c-title-${String(i)}`}
                value={c.title}
                onChange={(e) => setClass(i, { title: e.target.value })}
                placeholder="Group class"
              />
            </Field>
            <Field className="col-span-2 max-lg:order-3">
              <FieldLabel htmlFor={`c-note-${String(i)}`}>Note for members</FieldLabel>
              <Input
                id={`c-note-${String(i)}`}
                value={c.note}
                onChange={(e) => setClass(i, { note: e.target.value })}
                placeholder="Sets the tone for the trading week ahead"
              />
            </Field>
          </fieldset>
        ))}
        {classes.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No classes yet. Members see &quot;The class schedule will be posted here.&quot;
          </p>
        )}
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={classes.length >= 10}
            onClick={() =>
              setClasses((list) => [
                ...list,
                { day: 0, start: "19:00", end: "20:30", title: "", audience: "everyone", note: "" },
              ])
            }
          >
            <LuPlus />
            Add a class
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Remind members before each class</span>
            <span className="block text-sm text-muted-foreground">
              A notification and an email with the Zoom link, to the members each class is for.
            </span>
          </span>
          <Switch checked={reminders} onCheckedChange={setReminders} aria-label="Remind members before each class" />
        </label>
        {reminders && (
          <Select items={REMINDER_ITEMS} value={minutes} onValueChange={(v: string | null) => v && setMinutes(v)}>
            <SelectTrigger className="w-full sm:w-52" aria-label="When to remind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_ITEMS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <FieldDescription className="-mt-3">
        Times are New York time; members also see them in their own time zone. Classes during market hours skip market
        holidays.
      </FieldDescription>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(
              async () =>
                void done(
                  await updateClassSchedule({
                    classSchedule: classes,
                    classReminderMinutes: reminders ? Number(minutes) : null,
                  }),
                  "Class schedule saved",
                ),
            )
          }
        >
          {pending ? <Spinner /> : <LuSave />}
          Save class schedule
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
    zoomMeetingId: string | null
    zoomPasscode: string | null
    recapsAutoPublish: boolean
    whatsappUrl: string | null
    oneOnOneUrl: string | null
    expiringSoonDays: number
    sessionLimit: number
    setupTags: string[]
  }
}) {
  const [form, setForm] = useState({
    zoomUrl: initial.zoomUrl ?? "",
    zoomMeetingId: initial.zoomMeetingId ? formatMeetingId(initial.zoomMeetingId) : "",
    zoomPasscode: initial.zoomPasscode ?? "",
    whatsappUrl: initial.whatsappUrl ?? "",
    oneOnOneUrl: initial.oneOnOneUrl ?? "",
    expiringSoonDays: String(initial.expiringSoonDays),
    sessionLimit: String(initial.sessionLimit),
    setupTags: initial.setupTags.join(", "),
  })
  const [autoPublish, setAutoPublish] = useState(initial.recapsAutoPublish)
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const linkMeeting = zoomMeetingNumber(form.zoomUrl)
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="m-zoom">Class Zoom link</FieldLabel>
          <Input
            id="m-zoom"
            value={form.zoomUrl}
            onChange={(e) => set("zoomUrl", e.target.value)}
            placeholder="https://zoom.us/j/..."
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="m-zoom-id">Meeting ID</FieldLabel>
          <Input
            id="m-zoom-id"
            inputMode="numeric"
            value={form.zoomMeetingId}
            onChange={(e) => set("zoomMeetingId", e.target.value)}
            placeholder={linkMeeting ? formatMeetingId(linkMeeting) : "812 3456 7890"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="m-zoom-pass">Passcode</FieldLabel>
          <Input
            id="m-zoom-pass"
            value={form.zoomPasscode}
            onChange={(e) => set("zoomPasscode", e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <FieldDescription className="-mt-3">
        From the weekly class&apos;s Zoom invitation. Members join the class inside the site with the meeting ID and
        passcode, and AI recaps are made of this meeting only. The ID in the link is used when the field is empty.
      </FieldDescription>
      <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <span>
          <span className="block text-sm font-medium">Share class recaps as soon as they are written</span>
          <span className="block text-sm text-muted-foreground">
            Off: each recap waits for you to check it and publish it under Class recaps.
          </span>
        </span>
        <Switch checked={autoPublish} onCheckedChange={setAutoPublish} aria-label="Share class recaps right away" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
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
                    zoomMeetingId: form.zoomMeetingId,
                    zoomPasscode: form.zoomPasscode,
                    recapsAutoPublish: autoPublish,
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

const OPEN_FROM_ITEMS = [
  { value: "beginner", label: "Everyone with a membership" },
  { value: "intermediate", label: `${LEVEL_LABELS.intermediate} and ${LEVEL_LABELS.advanced} traders` },
  { value: "advanced", label: `${LEVEL_LABELS.advanced} traders only` },
]

export function HgVisibilityForm({
  initial,
}: {
  initial: {
    showDollars: boolean
    showPositions: boolean
    showClosedTrades: boolean
    positionDelayHours: number
    openFrom: TraderLevel
  }
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
      <Field>
        <FieldLabel htmlFor="h-open">Who sees HG standing</FieldLabel>
        <Select
          items={OPEN_FROM_ITEMS}
          value={form.openFrom}
          onValueChange={(v: string | null) => v && setForm({ ...form, openFrom: v as TraderLevel })}
        >
          <SelectTrigger id="h-open" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPEN_FROM_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          The others see what it takes to unlock it. The alerts&apos; track record stays on the Alerts page for
          everyone.
        </FieldDescription>
      </Field>
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
