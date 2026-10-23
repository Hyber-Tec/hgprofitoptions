"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LuPlus, LuReceiptText, LuTriangleAlert, LuX } from "react-icons/lu"
import { isIsoDate } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatCents, invoiceTotal, parseCents } from "@/core/invoice"
import { createInvoice } from "@/lib/actions/admin/invoices"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { InvoicePreview, type InvoicePreviewProps } from "./invoice-preview"

interface LineDraft {
  description: string
  period: string
  amount: string
}

export interface InvoiceFormProps {
  uid: string
  nextNumber: string
  today: IsoDate
  defaults: {
    dueOn: IsoDate | null
    billTo: { name: string; address: string; email: string; phone: string | null }
    program: string
    lines: { description: string; period: string | null; amount: number }[]
    notes: string[]
  }
  savedAddress: string | null
  from: InvoicePreviewProps["from"]
  payment: InvoicePreviewProps["payment"]
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

/** An invoice for one member, prefilled from their profile and membership, with the invoice beside it. */
export function InvoiceForm(props: InvoiceFormProps) {
  const router = useRouter()
  const { defaults } = props
  const [issuedOn, setIssuedOn] = useState<string>(props.today)
  const [dueOn, setDueOn] = useState<string>(defaults.dueOn ?? "")
  const [billTo, setBillTo] = useState({ ...defaults.billTo, phone: defaults.billTo.phone ?? "" })
  const [saveAddress, setSaveAddress] = useState(true)
  const [program, setProgram] = useState(defaults.program)
  const [drafts, setDrafts] = useState<LineDraft[]>(
    defaults.lines.map((l) => ({
      description: l.description,
      period: l.period ?? "",
      amount: (l.amount / 100).toFixed(2),
    })),
  )
  const [notes, setNotes] = useState(defaults.notes.join("\n"))
  const [pending, startTransition] = useTransition()

  const parsedLines = drafts.map((d) => ({
    description: d.description.trim(),
    period: d.period.trim() || null,
    amount: parseCents(d.amount),
  }))
  const amountsOk = parsedLines.every((l) => l.amount !== null)
  const total = invoiceTotal(parsedLines.map((l) => ({ amount: l.amount ?? 0 })))
  const noPayment = !props.payment.cashApp && !props.payment.wise && !props.payment.wire
  const addressChanged = billTo.address.trim() !== (props.savedAddress ?? "").trim()
  const setLine = (i: number, key: keyof LineDraft, value: string) =>
    setDrafts((list) => list.map((d, j) => (j === i ? { ...d, [key]: value } : d)))

  const issue = () =>
    startTransition(async () => {
      if (!amountsOk) {
        toast.add({ title: "Not issued", description: "Enter each amount like 1895.00.", type: "error" })
        return
      }
      const result = await createInvoice(props.uid, {
        issuedOn,
        dueOn: dueOn || null,
        billTo,
        program,
        lines: parsedLines.map((l) => ({ description: l.description, period: l.period ?? "", amount: l.amount ?? 0 })),
        notes: lines(notes),
        saveAddress: saveAddress && addressChanged,
      })
      if (!result.ok) {
        toast.add({ title: "Not issued", description: result.message, type: "error" })
        return
      }
      toast.add({ title: `Invoice ${result.data.number} issued`, type: "success" })
      router.push(`/admin/members/${props.uid}?tab=subscription`)
    })

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="flex min-w-0 flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          issue()
        }}
      >
        {noPayment && (
          <Alert>
            <LuTriangleAlert />
            <AlertTitle>The invoice does not say how to pay yet</AlertTitle>
            <AlertDescription>
              Add Cash App, Wise or bank details under{" "}
              <Link href="/admin/settings" className="underline underline-offset-4">
                Settings, Billing
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="i-issued">Issued</FieldLabel>
              <Input id="i-issued" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="i-due">Due</FieldLabel>
              <Input id="i-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
          </div>
        </FieldGroup>

        <FieldSet>
          <FieldLegend>Billed to</FieldLegend>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="i-name">Name</FieldLabel>
                <Input
                  id="i-name"
                  value={billTo.name}
                  onChange={(e) => setBillTo({ ...billTo, name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="i-email">Email</FieldLabel>
                <Input
                  id="i-email"
                  type="email"
                  value={billTo.email}
                  onChange={(e) => setBillTo({ ...billTo, email: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="i-phone">Phone</FieldLabel>
                <Input
                  id="i-phone"
                  value={billTo.phone}
                  onChange={(e) => setBillTo({ ...billTo, phone: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="i-address">Mailing address</FieldLabel>
              <Textarea
                id="i-address"
                value={billTo.address}
                onChange={(e) => setBillTo({ ...billTo, address: e.target.value })}
                placeholder={"Street\nCity, State ZIP\nCountry"}
              />
              {addressChanged && billTo.address.trim() !== "" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={saveAddress} onCheckedChange={setSaveAddress} />
                  Save this address on their profile for the next invoice
                </label>
              )}
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>What it bills</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="i-program">Program</FieldLabel>
              <Textarea id="i-program" value={program} onChange={(e) => setProgram(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-3">
              {drafts.map((d, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3 sm:flex-nowrap">
                  <Field className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                    <FieldLabel htmlFor={`l-desc-${i}`}>Line {i + 1}</FieldLabel>
                    <Input
                      id={`l-desc-${i}`}
                      value={d.description}
                      onChange={(e) => setLine(i, "description", e.target.value)}
                    />
                  </Field>
                  <Field className="min-w-0 flex-1 sm:w-44 sm:flex-none">
                    <FieldLabel htmlFor={`l-period-${i}`}>Period</FieldLabel>
                    <Input
                      id={`l-period-${i}`}
                      value={d.period}
                      onChange={(e) => setLine(i, "period", e.target.value)}
                    />
                  </Field>
                  <Field className="w-28 shrink-0" data-invalid={parseCents(d.amount) === null}>
                    <FieldLabel htmlFor={`l-amount-${i}`}>Amount</FieldLabel>
                    <Input
                      id={`l-amount-${i}`}
                      inputMode="decimal"
                      value={d.amount}
                      onChange={(e) => setLine(i, "amount", e.target.value)}
                      aria-invalid={parseCents(d.amount) === null}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={drafts.length === 1}
                    onClick={() => setDrafts((list) => list.filter((_, j) => j !== i))}
                  >
                    <LuX />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrafts((list) => [...list, { description: "", period: "", amount: "0.00" }])}
                >
                  <LuPlus />
                  Add a line
                </Button>
                <p className="text-sm">
                  Total <span className="font-semibold tabular-nums">{formatCents(total)}</span>
                </p>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor="i-notes">Notes</FieldLabel>
              <Textarea id="i-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <FieldDescription>One per line. How to pay comes from Settings, Billing.</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <div>
          <Button type="submit" disabled={pending || !amountsOk || !isIsoDate(issuedOn)}>
            {pending ? <Spinner /> : <LuReceiptText />}
            Issue invoice
          </Button>
        </div>
      </form>

      <div className="min-w-0 xl:sticky xl:top-20">
        <InvoicePreview
          number={props.nextNumber}
          issuedOn={isIsoDate(issuedOn) ? issuedOn : null}
          dueOn={isIsoDate(dueOn) ? dueOn : null}
          from={props.from}
          billTo={{ ...billTo, phone: billTo.phone || null }}
          program={program}
          lines={parsedLines.map((l) => ({ ...l, amount: l.amount ?? 0 }))}
          notes={lines(notes)}
          total={total}
          payment={props.payment}
        />
      </div>
    </div>
  )
}
