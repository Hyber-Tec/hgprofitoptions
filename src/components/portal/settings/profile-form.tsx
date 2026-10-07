"use client"

import { useMemo, useState, useTransition, type ComponentProps, type SubmitEvent } from "react"
import { LuSave } from "react-icons/lu"
import { updateProfile } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

export interface ProfileValues {
  fullName: string
  email: string
  phone: string | null
  whatsapp: string | null
  location: string | null
  timezone: string
}

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({})
  const [pending, startTransition] = useTransition()
  const zones = useMemo(() => {
    const list =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["America/New_York"]
    return (list.includes(initial.timezone) ? list : [initial.timezone, ...list]).map((z) => ({
      value: z,
      label: z.replaceAll("_", " "),
    }))
  }, [initial.timezone])
  const set = (key: keyof ProfileValues, value: string) => setValues((v) => ({ ...v, [key]: value }))

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateProfile({
        fullName: values.fullName,
        phone: values.phone ?? "",
        whatsapp: values.whatsapp ?? "",
        location: values.location ?? "",
        timezone: values.timezone,
      })
      setErrors(result.ok ? {} : (result.fieldErrors ?? {}))
      toast.add(
        result.ok
          ? { title: "Profile saved", type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
    })
  }

  const text = (
    key: "fullName" | "phone" | "whatsapp" | "location",
    label: string,
    props: ComponentProps<typeof Input> = {},
  ) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={`p-${key}`}>{label}</FieldLabel>
      <Input
        id={`p-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key])}
        {...props}
      />
      <FieldError errors={errors[key]?.map((message) => ({ message }))} />
    </Field>
  )

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("fullName", "Full name", { autoComplete: "name", required: true })}
          <Field>
            <FieldLabel htmlFor="p-email">Email</FieldLabel>
            <Input id="p-email" value={values.email} readOnly disabled />
          </Field>
          {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
          {text("whatsapp", "WhatsApp", { type: "tel" })}
          {text("location", "Location", { placeholder: "City, State or Country" })}
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
