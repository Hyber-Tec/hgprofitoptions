import { formatCents } from "@/core/invoice"
import { formatDate } from "@/core/format"
import type { IsoDate } from "@/core/domain/types"
import type { PaymentDetails } from "@/server/model"

export interface InvoicePreviewProps {
  number: string
  issuedOn: IsoDate | null
  dueOn: IsoDate | null
  from: { name: string; address: string; phone: string | null; email: string | null }
  billTo: { name: string; address: string; email: string; phone: string | null }
  program: string
  lines: { description: string; period: string | null; amount: number }[]
  notes: string[]
  total: number
  payment: PaymentDetails
}

function Label({ children }: { children: string }) {
  return <p className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">{children}</p>
}

/** The invoice as the PDF lays it out, on a white sheet in either theme. */
export function InvoicePreview(invoice: InvoicePreviewProps) {
  const wire = invoice.payment.wire
  const rows: [string, string | null][] = [
    ["Cash App", invoice.payment.cashApp],
    ["Wise", invoice.payment.wise],
  ]
  const wireRows: [string, string][] = wire
    ? [
        ["Bank", wire.bank],
        ["Bank address", wire.bankAddress],
        ["SWIFT / BIC", wire.swift],
        ["Routing number", wire.routing],
        ["Beneficiary", wire.beneficiary],
        ["Beneficiary address", wire.beneficiaryAddress],
        ["Account number", wire.account],
      ]
    : []
  return (
    <article
      aria-label="Invoice preview"
      className="flex flex-col gap-6 rounded-lg border bg-white p-6 text-[13px] leading-snug text-neutral-900 shadow-sm sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">INVOICE</h2>
        <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-6 gap-y-1 text-right">
          <dt className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Invoice</dt>
          <dd className="font-semibold">{invoice.number}</dd>
          <dt className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Issued</dt>
          <dd className="font-semibold">{formatDate(invoice.issuedOn)}</dd>
          {invoice.dueOn && (
            <>
              <dt className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Due</dt>
              <dd className="font-semibold">{formatDate(invoice.dueOn)}</dd>
            </>
          )}
        </dl>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {(
          [
            ["From", invoice.from],
            ["Billed to", invoice.billTo],
          ] as const
        ).map(([title, party]) => (
          <div key={title} className="flex min-w-0 flex-col gap-0.5">
            <Label>{title}</Label>
            <p className="mt-1 font-semibold break-words">{party.name || "-"}</p>
            {party.address && <p className="break-words whitespace-pre-line">{party.address}</p>}
            {party.phone && <p className="break-words text-neutral-500">{party.phone}</p>}
            {party.email && <p className="break-words text-neutral-500">{party.email}</p>}
          </div>
        ))}
      </div>

      {invoice.program.trim() && <p className="whitespace-pre-line">{invoice.program}</p>}

      <div className="flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] gap-3 border-b border-neutral-200 pb-2">
          <Label>Description</Label>
          <Label>Period</Label>
          <p className="text-right text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Amount</p>
        </div>
        {invoice.lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] gap-3 py-2">
            <p className="break-words">{line.description || "-"}</p>
            <p>{line.period}</p>
            <p className="text-right tabular-nums">{formatCents(line.amount)}</p>
          </div>
        ))}
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 border-t border-neutral-200 pt-3 sm:ml-auto sm:w-72">
          <p className="font-semibold">Total</p>
          <p className="text-right font-semibold tabular-nums">{formatCents(invoice.total)}</p>
          <p className="text-neutral-500">Balance due</p>
          <p className="text-right text-neutral-500 tabular-nums">{formatCents(invoice.total)}</p>
        </div>
      </div>

      {invoice.notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-neutral-400">
          {invoice.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2" aria-label="How to pay">
        <h3 className="text-sm font-bold">How to pay</h3>
        {invoice.payment.terms && <p className="whitespace-pre-line">{invoice.payment.terms}</p>}
        <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1">
          {rows
            .filter(([, value]) => value)
            .map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-neutral-500">{name}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
        </dl>
        {wireRows.length > 0 && (
          <>
            <h4 className="mt-2 font-bold">Wire transfer</h4>
            <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1">
              {wireRows
                .filter(([, value]) => value)
                .map(([name, value]) => (
                  <div key={name} className="contents">
                    <dt className="text-neutral-500">{name}</dt>
                    <dd className="break-words whitespace-pre-line">{value}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
        <p className="mt-2 text-neutral-500">Please include {invoice.number} with your payment. Thank you.</p>
      </section>
    </article>
  )
}
