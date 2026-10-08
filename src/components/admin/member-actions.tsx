"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition, type SubmitEvent } from "react"
import {
  LuCalendarPlus,
  LuChevronDown,
  LuKeyRound,
  LuLogOut,
  LuSave,
  LuShield,
  LuShieldOff,
  LuTrash2,
  LuUserCheck,
  LuUserX,
} from "react-icons/lu"
import type { IsoDate, Quarter } from "@/core/domain/types"
import { describePeriodRange, periodFromQuarters, quarterRange } from "@/core/membership/quarters"
import {
  addMemberPeriod,
  deleteMember,
  passwordResetLink,
  removeMemberPeriod,
  renewNextQuarter,
  saveAdminNotes,
  setMemberRole,
  setMemberSuspended,
  signOutMember,
  updateMemberProfile,
} from "@/lib/actions/admin/members"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ToneBadge } from "@/components/portal/display"
import { LinkDialog } from "./invite-link-dialog"

type Result = { ok: true } | { ok: false; message: string }
function report(result: Result, success: string): void {
  toast.add(
    result.ok
      ? { title: success, type: "success" }
      : { title: "Not saved", description: result.message, type: "error" },
  )
}

export function MemberActionsMenu({
  uid,
  role,
  suspended,
  isSelf,
}: {
  uid: string
  role: "admin" | "member"
  suspended: boolean
  isSelf: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [link, setLink] = useState<string | null>(null)
  const run = (fn: () => Promise<Result>, success: string) => startTransition(async () => report(await fn(), success))
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
          {pending ? <Spinner /> : null}
          Actions
          <LuChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            {role === "member" && (
              <DropdownMenuItem
                onClick={() =>
                  run(async () => {
                    const r = await renewNextQuarter([uid])
                    return r.ok
                      ? r.data.failed[0]
                        ? { ok: false, message: r.data.failed[0].message }
                        : { ok: true }
                      : r
                  }, "Renewed for the next quarter")
                }
              >
                <LuCalendarPlus />
                Renew next quarter
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                startTransition(async () => {
                  const result = await passwordResetLink(uid)
                  if (!result.ok) return report(result, "")
                  setLink(result.data.link)
                  if (result.data.emailed) toast.add({ title: "Reset email sent", type: "success" })
                })
              }
            >
              <LuKeyRound />
              Password reset link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run(() => signOutMember(uid), "Signed out everywhere")}>
              <LuLogOut />
              Sign out all sessions
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() =>
                    run(
                      () => setMemberRole(uid, role === "admin" ? "member" : "admin"),
                      role === "admin" ? "Admin role removed" : "Promoted to admin",
                    )
                  }
                >
                  {role === "admin" ? <LuShieldOff /> : <LuShield />}
                  {role === "admin" ? "Remove admin role" : "Make admin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    run(() => setMemberSuspended(uid, !suspended), suspended ? "Member reinstated" : "Member suspended")
                  }
                >
                  {suspended ? <LuUserCheck /> : <LuUserX />}
                  {suspended ? "Reinstate" : "Suspend"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <LinkDialog
        link={link}
        onOpenChange={(open) => !open && setLink(null)}
        title="Password reset link"
        description="Send this link to the member. It expires in one hour."
      />
    </>
  )
}

export function AdminProfileForm({
  uid,
  initial,
}: {
  uid: string
  initial: {
    fullName: string
    phone: string | null
    whatsapp: string | null
    location: string | null
    timezone: string
  }
}) {
  const [values, setValues] = useState({
    fullName: initial.fullName,
    phone: initial.phone ?? "",
    whatsapp: initial.whatsapp ?? "",
    location: initial.location ?? "",
    timezone: initial.timezone,
  })
  const [pending, startTransition] = useTransition()
  const zones = useMemo(
    () =>
      (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [initial.timezone]).map(
        (z) => ({ value: z, label: z.replaceAll("_", " ") }),
      ),
    [initial.timezone],
  )
  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }))
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () =>
      report(
        await updateMemberProfile(uid, {
          ...values,
          phone: values.phone || null,
          whatsapp: values.whatsapp || null,
          location: values.location || null,
        }),
        "Profile saved",
      ),
    )
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["fullName", "Full name"],
              ["phone", "Phone"],
              ["whatsapp", "WhatsApp"],
              ["location", "Location"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`a-${key}`}>{label}</FieldLabel>
              <Input
                id={`a-${key}`}
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
                required={key === "fullName"}
              />
            </Field>
          ))}
          <Field>
            <FieldLabel>Time zone</FieldLabel>
            <Select items={zones} value={values.timezone} onValueChange={(v: string | null) => v && set("timezone", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <LuSave />}
          Save profile
        </Button>
      </div>
    </form>
  )
}

export interface PeriodRow {
  id: string
  label: string
  start: string
  end: string
  note: string | null
  state: "Current" | "Upcoming" | "Ended"
}

export function PeriodManager({
  uid,
  periods,
  defaultYear,
  defaultQuarter,
}: {
  uid: string
  periods: PeriodRow[]
  defaultYear: number
  defaultQuarter: Quarter
}) {
  const [pending, startTransition] = useTransition()
  const [year, setYear] = useState(defaultYear)
  const [quarter, setQuarter] = useState<Quarter>(defaultQuarter)
  const [count, setCount] = useState(1)
  const [customStart, setCustomStart] = useState("")
  const [note, setNote] = useState("")
  const years = [defaultYear - 1, defaultYear, defaultYear + 1, defaultYear + 2].map((y) => ({
    value: String(y),
    label: String(y),
  }))
  const counts = [1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? "1 quarter" : `${n} quarters` }))
  const first = quarterRange(year, quarter)
  const preview = useMemo(() => {
    try {
      const p = periodFromQuarters(year, quarter, count, customStart ? (customStart as IsoDate) : undefined)
      return `${p.label} · ${describePeriodRange(p.start, p.end)}`
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid period"
    }
  }, [year, quarter, count, customStart])

  const add = () =>
    startTransition(async () => {
      const result = await addMemberPeriod(uid, {
        year,
        quarter,
        count,
        customStart: customStart || null,
        note: note || null,
      })
      report(result, "Period added")
      if (result.ok) {
        setCustomStart("")
        setNote("")
      }
    })

  return (
    <div className="flex flex-col gap-6">
      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No membership periods yet.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l pl-6">
          {[...periods].reverse().map((p) => (
            <li key={p.id} className="relative">
              <span
                className="absolute top-1.5 -left-[calc(1.5rem+6.5px)] size-3 rounded-full border-2 border-card bg-foreground"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {p.label}
                    <ToneBadge tone={p.state === "Current" ? "positive" : "muted"}>{p.state}</ToneBadge>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {describePeriodRange(p.start as IsoDate, p.end as IsoDate)}
                    {p.note && ` · ${p.note}`}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                    <LuTrash2 />
                    Remove
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {p.label}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Access for these dates is removed right away. Use this to fix a mistake, not to end a membership
                        early.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() =>
                          startTransition(async () => report(await removeMemberPeriod(uid, p.id), "Period removed"))
                        }
                      >
                        Remove period
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <p className="text-sm font-medium">Add a period</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel>Quarter</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[String(quarter)]}
              onValueChange={(v: string[]) => v[0] && setQuarter(Number(v[0]) as Quarter)}
              aria-label="Quarter"
            >
              {[1, 2, 3, 4].map((q) => (
                <ToggleGroupItem key={q} value={String(q)} className="w-11">
                  Q{q}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field className="w-28">
            <FieldLabel>Year</FieldLabel>
            <Select items={years} value={String(year)} onValueChange={(v: string | null) => v && setYear(Number(v))}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.value} value={y.value}>
                    {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-36">
            <FieldLabel>Length</FieldLabel>
            <Select items={counts} value={String(count)} onValueChange={(v: string | null) => v && setCount(Number(v))}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {counts.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-44">
            <FieldLabel htmlFor="p-custom">Custom start</FieldLabel>
            <Input
              id="p-custom"
              type="date"
              className="h-8"
              min={first.start}
              max={first.end}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </Field>
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="p-note">Note</FieldLabel>
            <Input
              id="p-note"
              className="h-8"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional, for example paid by Zelle"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{preview}</span>
          <Button size="sm" onClick={add} disabled={pending}>
            {pending ? <Spinner /> : <LuCalendarPlus />}
            Add period
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AdminNotesEditor({ uid, initial }: { uid: string; initial: string }) {
  const [body, setBody] = useState(initial)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        placeholder="Goals, broker, what to cover at the next one-on-one..."
        aria-label="Admin notes"
      />
      <div>
        <Button
          onClick={() => startTransition(async () => report(await saveAdminNotes(uid, body), "Notes saved"))}
          disabled={pending}
        >
          {pending ? <Spinner /> : <LuSave />}
          Save notes
        </Button>
      </div>
    </div>
  )
}

export function DeleteMemberButton({ uid, email, name }: { uid: string; email: string; name: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" className="text-destructive" />}>
        <LuTrash2 />
        Delete permanently
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes their login, profile, membership history, journal, brokerage data and files. It cannot be
            undone. The audit log keeps a minimal record.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="confirm-email">
            Type <span className="font-mono">{email}</span> to confirm
          </FieldLabel>
          <Input id="confirm-email" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteMember(uid, confirm)
                if (!result.ok) return report(result, "")
                toast.add({ title: `${name} was deleted`, type: "success" })
                router.replace("/admin/members")
              })
            }
          >
            {pending && <Spinner />}
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
