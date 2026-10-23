"use client"

import { useState, useTransition } from "react"
import { LuSave } from "react-icons/lu"
import { parseCents } from "@/core/invoice"
import { saveBillingSettings } from "@/lib/actions/admin/invoices"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

export interface BillingValues {
  name: string
  address: string
  phone: string | null
  email: string | null
  quarterPrice: number | null
  program: string
  notes: string[]
  payment: {
    terms: string
    cashApp: string | null
    wise: string | null
    wire: {
      bank: string
      bankAddress: string
      swift: string
      routing: string
      beneficiary: string
      beneficiaryAddress: string
      account: string
    } | null
  }
}

const NO_WIRE = {
  bank: "",
  bankAddress: "",
  swift: "",
  routing: "",
  beneficiary: "",
  beneficiaryAddress: "",
  account: "",
}

/** Who invoices come from, what every new invoice says and how members pay. */
export function BillingSettingsForm({ initial }: { initial: BillingValues }) {
  const [form, setForm] = useState({
    name: initial.name,
    address: initial.address,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    quarterPrice: initial.quarterPrice === null ? "" : (initial.quarterPrice / 100).toFixed(2),
    program: initial.program,
    notes: initial.notes.join("\n"),
    terms: initial.payment.terms,
    cashApp: initial.payment.cashApp ?? "",
    wise: initial.payment.wise ?? "",
  })
  const [wire, setWire] = useState(initial.payment.wire ?? NO_WIRE)
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const setBank = (key: keyof typeof wire, value: string) => setWire((w) => ({ ...w, [key]: value }))
  const price = form.quarterPrice.trim() === "" ? null : parseCents(form.quarterPrice)

  const save = () =>
    startTransition(async () => {
      if (price !== null && price < 0) {
        toast.add({ title: "Not saved", description: "Enter the price of a quarter, like 1895.", type: "error" })
        return
      }
      const result = await saveBillingSettings({
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        quarterPrice: form.quarterPrice.trim() === "" ? null : price,
        program: form.program,
        notes: form.notes.split("\n"),
        terms: form.terms,
        cashApp: form.cashApp,
        wise: form.wise,
        wire,
      })
      toast.add(
        result.ok
          ? { title: "Billing details saved", type: "success" }
          : { title: "Not saved", description: result.message, type: "error" },
      )
    })

  const input = (key: "name" | "phone" | "email" | "cashApp" | "wise", label: string, placeholder?: string) => (
    <Field>
      <FieldLabel htmlFor={`b-${key}`}>{label}</FieldLabel>
      <Input id={`b-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />
    </Field>
  )
  const bank = (key: keyof typeof wire, label: string, multiline = false) => (
    <Field>
      <FieldLabel htmlFor={`w-${key}`}>{label}</FieldLabel>
      {multiline ? (
        <Textarea id={`w-${key}`} value={wire[key]} onChange={(e) => setBank(key, e.target.value)} />
      ) : (
        <Input id={`w-${key}`} value={wire[key]} onChange={(e) => setBank(key, e.target.value)} autoComplete="off" />
      )}
    </Field>
  )

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <FieldSet>
        <FieldLegend>From</FieldLegend>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            {input("name", "Name")}
            {input("phone", "Phone")}
            {input("email", "Email")}
          </div>
          <Field>
            <FieldLabel htmlFor="b-address">Address</FieldLabel>
            <Textarea id="b-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>On every new invoice</FieldLegend>
        <FieldGroup>
          <Field className="sm:max-w-56" data-invalid={form.quarterPrice.trim() !== "" && price === null}>
            <FieldLabel htmlFor="b-price">Price of a quarter (USD)</FieldLabel>
            <Input
              id="b-price"
              inputMode="decimal"
              value={form.quarterPrice}
              onChange={(e) => set("quarterPrice", e.target.value)}
              placeholder="1895.00"
              aria-invalid={form.quarterPrice.trim() !== "" && price === null}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="b-program">Program</FieldLabel>
            <Textarea id="b-program" value={form.program} onChange={(e) => set("program", e.target.value)} />
            <FieldDescription>Each invoice adds the dates of the membership period it bills.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="b-notes">Notes</FieldLabel>
            <Textarea id="b-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            <FieldDescription>One per line, such as what the enrollment includes.</FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>How to pay</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="b-terms">Payment terms</FieldLabel>
            <Textarea id="b-terms" value={form.terms} onChange={(e) => set("terms", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("cashApp", "Cash App", "$cashtag")}
            {input("wise", "Wise", "Email or account")}
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Wire transfer</FieldLegend>
        <FieldDescription className="-mt-2">
          Printed on invoices for members to pay by wire. Only admins and the member being billed see these.
        </FieldDescription>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            {bank("bank", "Bank")}
            {bank("beneficiary", "Beneficiary")}
            {bank("bankAddress", "Bank address", true)}
            {bank("beneficiaryAddress", "Beneficiary address", true)}
            {bank("swift", "SWIFT / BIC")}
            {bank("routing", "Routing number")}
            {bank("account", "Account number")}
          </div>
        </FieldGroup>
      </FieldSet>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <LuSave />}
          Save billing details
        </Button>
      </div>
    </form>
  )
}
