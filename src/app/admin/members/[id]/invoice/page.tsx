import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { todayInMarketZone } from "@/core/dates"
import { billingPeriod, periodLine, periodSchedule } from "@/core/invoice"
import { requireAdmin } from "@/lib/auth/guards"
import { getMemberRow } from "@/lib/data/admin"
import { getBillingSettings, nextInvoiceNumber } from "@/lib/data/invoices"
import { InvoiceForm } from "@/components/admin/invoice-form"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "New invoice" }

export default async function NewInvoicePage({ params }: PageProps<"/admin/members/[id]/invoice">) {
  const { id } = await params
  await requireAdmin({ next: `/admin/members/${id}/invoice` })
  const today = todayInMarketZone()
  const [row, billing, nextNumber] = await Promise.all([
    getMemberRow(id),
    getBillingSettings(),
    nextInvoiceNumber(Number(today.slice(0, 4))),
  ])
  if (!row) notFound()
  const { member, periods } = row
  const period = billingPeriod(periods, today)
  const line = period
    ? periodLine(period, billing.quarterPrice)
    : { description: "13-week group session", period: null, amount: billing.quarterPrice ?? 0 }

  return (
    <>
      <PageHeader
        title={`New invoice for ${member.fullName}`}
        description={
          period
            ? `Prefilled for their ${period.label} membership. Change anything before you issue it.`
            : "They have no membership period yet, so check the line before you issue it."
        }
      />
      <InvoiceForm
        uid={id}
        nextNumber={nextNumber}
        today={today}
        savedAddress={member.mailingAddress}
        from={{ name: billing.name, address: billing.address, phone: billing.phone, email: billing.email }}
        payment={billing.payment}
        defaults={{
          dueOn: period && period.start > today ? period.start : null,
          billTo: {
            name: member.fullName,
            address: member.mailingAddress ?? "",
            email: member.email,
            phone: member.whatsapp ?? member.phone,
          },
          program: [billing.program, period ? periodSchedule(period) : ""].filter(Boolean).join("\n"),
          lines: [line],
          notes: billing.notes,
        }}
      />
    </>
  )
}
