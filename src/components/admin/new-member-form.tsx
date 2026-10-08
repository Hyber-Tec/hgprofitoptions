"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition, type SubmitEvent } from "react"
import { LuSend } from "react-icons/lu"
import type { IsoDate, Quarter } from "@/core/domain/types"
import { describePeriodRange, periodFromQuarters, quarterRange } from "@/core/membership/quarters"
import { inviteMember } from "@/lib/actions/admin/members"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LinkDialog } from "./invite-link-dialog"

const COUNTS = [1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: n === 1 ? "1 quarter" : `${n} quarters` }))

export function NewMemberForm({
  defaultYear,
  defaultQuarter,
  emailAvailable,
}: {
  defaultYear: number
  defaultQuarter: Quarter
  emailAvailable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({})
  const [link, setLink] = useState<string | null>(null)
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    whatsapp: "",
    location: "",
    timezone: "America/New_York",
    notes: "",
  })
  const [role, setRole] = useState<"member" | "admin">("member")
  const [year, setYear] = useState(defaultYear)
  const [quarter, setQuarter] = useState<Quarter>(defaultQuarter)
  const [count, setCount] = useState(1)
  const [customStart, setCustomStart] = useState("")
  const [sendEmail, setSendEmail] = useState(emailAvailable)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const years = [defaultYear - 1, defaultYear, defaultYear + 1, defaultYear + 2].map((y) => ({
    value: String(y),
    label: String(y),
  }))
  const zones = useMemo(
    () =>
      (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["America/New_York"]).map(
        (z) => ({ value: z, label: z.replaceAll("_", " ") }),
      ),
    [],
  )
  const firstQuarter = quarterRange(year, quarter)

  const preview = useMemo(() => {
    if (role === "admin") return { text: "Admins have full access without a membership period.", error: null }
    try {
      const p = periodFromQuarters(year, quarter, count, customStart ? (customStart as IsoDate) : undefined)
      return { text: `${p.label} · ${describePeriodRange(p.start, p.end)}`, error: null }
    } catch (error) {
      return { text: null, error: error instanceof Error ? error.message : "Invalid period" }
    }
  }, [role, year, quarter, count, customStart])

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await inviteMember({
        ...form,
        email: form.email,
        role,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        location: form.location || null,
        notes: form.notes || null,
        start: role === "admin" ? null : { year, quarter, count, customStart: customStart || null },
        sendEmail: sendEmail && emailAvailable,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.add({ title: "Not added", description: result.message, type: "error" })
        return
      }
      setErrors({})
      toast.add({
        title: `${form.fullName} was invited`,
        description: result.data.emailed ? "The invitation email is on its way." : "Copy the link and send it to them.",
        type: "success",
      })
      setLink(result.data.link)
    })
  }

  const err = (key: string) => errors[key]?.map((message) => ({ message }))

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Member</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.fullName)}>
                  <FieldLabel htmlFor="m-name">Full name</FieldLabel>
                  <Input
                    id="m-name"
                    value={form.fullName}
                    onChange={(e) => set("fullName", e.target.value)}
                    required
                    autoComplete="off"
                  />
                  <FieldError errors={err("fullName")} />
                </Field>
                <Field data-invalid={Boolean(errors.email)}>
                  <FieldLabel htmlFor="m-email">Email</FieldLabel>
                  <Input
                    id="m-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    required
                    autoComplete="off"
                  />
                  <FieldDescription>
                    They can sign in with Google using this address, or create a password.
                  </FieldDescription>
                  <FieldError errors={err("email")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="m-phone">Phone</FieldLabel>
                  <Input id="m-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="m-whatsapp">WhatsApp</FieldLabel>
                  <Input
                    id="m-whatsapp"
                    type="tel"
                    value={form.whatsapp}
                    onChange={(e) => set("whatsapp", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="m-location">Location</FieldLabel>
                  <Input
                    id="m-location"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="City, State or Country"
                  />
                </Field>
                <Field>
                  <FieldLabel>Time zone</FieldLabel>
                  <Select
                    items={zones}
                    value={form.timezone}
                    onValueChange={(v: string | null) => v && set("timezone", v)}
                  >
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
              <Field>
                <FieldLabel>Role</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[role]}
                  onValueChange={(v: string[]) => v[0] && setRole(v[0] as "member" | "admin")}
                  aria-label="Role"
                >
                  <ToggleGroupItem value="member">Member</ToggleGroupItem>
                  <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notes for HG</CardTitle>
            <CardDescription>Only admins see these. Useful for the first one-on-one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={4}
              placeholder="Experience level, broker, goals..."
              aria-label="Admin notes"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Membership</CardTitle>
            <CardDescription>Pick the start quarter and length. Dates are calculated for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className={role === "admin" ? "pointer-events-none opacity-50" : undefined}>
              <Field>
                <FieldLabel>Start quarter</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[String(quarter)]}
                  onValueChange={(v: string[]) => v[0] && setQuarter(Number(v[0]) as Quarter)}
                  aria-label="Start quarter"
                >
                  {[1, 2, 3, 4].map((q) => (
                    <ToggleGroupItem key={q} value={String(q)} className="w-12">
                      Q{q}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>Year</FieldLabel>
                  <Select
                    items={years}
                    value={String(year)}
                    onValueChange={(v: string | null) => v && setYear(Number(v))}
                  >
                    <SelectTrigger className="w-full">
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
                <Field>
                  <FieldLabel>Length</FieldLabel>
                  <Select
                    items={COUNTS}
                    value={String(count)}
                    onValueChange={(v: string | null) => v && setCount(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="m-custom">Custom start date (optional)</FieldLabel>
                <Input
                  id="m-custom"
                  type="date"
                  min={firstQuarter.start}
                  max={firstQuarter.end}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <FieldDescription>
                  For a join in the middle of a quarter. The end date still snaps to the quarter end.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <div className="mt-5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm" aria-live="polite">
              {preview.error ? (
                <span className="text-destructive">{preview.error}</span>
              ) : (
                <span className="font-medium">{preview.text}</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">Send the invitation email</span>
                <span className="block text-sm text-muted-foreground">
                  {emailAvailable
                    ? "From HG Profit Options, with a link to create their login."
                    : "Email is not set up yet. You will get a link to send yourself."}
                </span>
              </span>
              <Switch checked={sendEmail && emailAvailable} onCheckedChange={setSendEmail} disabled={!emailAvailable} />
            </label>
            <Button type="submit" size="lg" disabled={pending || Boolean(preview.error)}>
              {pending ? <Spinner /> : <LuSend />}
              Add and invite
            </Button>
          </CardContent>
        </Card>
      </div>
      <LinkDialog
        link={link}
        onOpenChange={(open) => {
          if (!open) {
            setLink(null)
            router.push("/admin/members")
          }
        }}
        title="Invitation link"
        description="Send this link to the new member. It works once and expires in 14 days. They can also sign in with Google using the invited email."
      />
    </form>
  )
}
