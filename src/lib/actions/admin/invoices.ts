"use server"

import { Timestamp } from "firebase-admin/firestore"
import { refresh } from "next/cache"
import { after } from "next/server"
import { z } from "zod"
import { isIsoDate, todayInMarketZone } from "@/core/dates"
import type { ActionResult } from "@/core/domain/types"
import { formatCents, invoiceNumber, invoiceText, invoiceTotal, unprintable } from "@/core/invoice"
import { layout, sendEmail } from "@/server/email"
import { writeAudit } from "@/server/members"
import { COLLECTIONS, invoiceSchema, memberSchema, parseDoc, type InvoiceDoc } from "@/server/model"
import { sendToMembers } from "@/server/push"
import { adminForAction, type Viewer } from "@/lib/auth/guards"
import { invalidate } from "@/lib/data/cache"
import { getBillingSettings } from "@/lib/data/invoices"
import { publicEnv } from "@/lib/env.public"
import { emailConfig } from "@/lib/env.server"
import { adminDb, adminMessaging } from "@/lib/firebase/admin"

const forbidden = {
  ok: false,
  code: "forbidden",
  message: "Admins only. If you are an admin, sign in again with two-step verification.",
} as const

function audit(viewer: Viewer, action: string, targetType: string, targetId: string, detail?: Record<string, unknown>) {
  return writeAudit(adminDb(), { actorUid: viewer.uid, actorEmail: viewer.email, action, targetType, targetId, detail })
}

/** Text that ends up on an invoice: tidied, and only what the PDF can print. */
const printed = (max: number) =>
  z
    .string()
    .max(max)
    .transform(invoiceText)
    .superRefine((value, ctx) => {
      const bad = unprintable(value)
      if (bad.length > 0)
        ctx.addIssue({
          code: "custom",
          message: `Invoices print Latin letters only. Replace ${bad.slice(0, 5).join(" ")}.`,
        })
    })
const optionalPrinted = (max: number) => printed(max).transform((v) => (v === "" ? null : v))
const date = z.string().refine(isIsoDate, "Pick a date")

const billingInput = z.object({
  name: printed(80).pipe(z.string().min(2, "Enter the name invoices come from")),
  address: printed(300),
  phone: optionalPrinted(40),
  email: optionalPrinted(120),
  quarterPrice: z.number().int().min(0).max(100_000_000).nullable(),
  program: printed(600),
  notes: z.array(printed(300)).max(10),
  terms: printed(400),
  cashApp: optionalPrinted(60),
  wise: optionalPrinted(120),
  wire: z
    .object({
      bank: printed(120),
      bankAddress: printed(200),
      swift: printed(20),
      routing: printed(20),
      beneficiary: printed(120),
      beneficiaryAddress: printed(200),
      account: printed(40),
    })
    .nullable(),
})

/** Admin > Settings > Billing: what every new invoice says and how members pay. */
export async function saveBillingSettings(input: z.input<typeof billingInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = billingInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const { terms, cashApp, wise, wire, notes, ...rest } = parsed.data
  // Bank details count only once the bank and account are filled in.
  const wireDetails = wire && wire.bank && wire.account ? wire : null
  await adminDb()
    .collection(COLLECTIONS.settings)
    .doc("billing")
    .set({ ...rest, notes: notes.filter(Boolean), payment: { terms, cashApp, wise, wire: wireDetails } })
  await audit(viewer, "settings.billing_updated", "settings", "billing")
  invalidate("settings:")
  refresh()
  return { ok: true, data: undefined }
}

const invoiceInput = z.object({
  issuedOn: date,
  dueOn: date.nullable(),
  billTo: z.object({
    name: printed(120).pipe(z.string().min(2, "Enter the member's name")),
    address: printed(300),
    email: printed(200).pipe(z.email("Enter the member's email")),
    phone: optionalPrinted(60),
  }),
  program: printed(1200),
  lines: z
    .array(
      z.object({
        description: printed(200).pipe(z.string().min(1, "Describe each line")),
        period: optionalPrinted(60),
        amount: z.number().int().min(-100_000_000).max(100_000_000),
      }),
    )
    .min(1, "Add a line")
    .max(30),
  notes: z.array(printed(300)).max(10),
  /** Keep the address on the member's profile for their next invoice. */
  saveAddress: z.boolean(),
})

/**
 * Issues an invoice to a member: the next number of the year, and HG's details and payment
 * instructions as they are today, kept with it. The member is told it is ready.
 */
export async function createInvoice(
  uid: string,
  input: z.input<typeof invoiceInput>,
): Promise<ActionResult<{ id: string; number: string }>> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = invoiceInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Check the fields." }
  const db = adminDb()
  const memberRef = db.collection(COLLECTIONS.members).doc(typeof uid === "string" && uid ? uid : "-")
  const memberSnap = await memberRef.get()
  const target = memberSnap.exists ? parseDoc(memberSchema, memberSnap.id, memberSnap.data()) : null
  if (!target) return { ok: false, code: "not-found", message: "This member no longer exists." }
  const billing = await getBillingSettings()
  const data = parsed.data
  const year = Number(data.issuedOn.slice(0, 4))
  const counter = db.collection(COLLECTIONS.counters).doc("invoices")
  const ref = db.collection(COLLECTIONS.invoices).doc()
  const now = Timestamp.now()
  const number = await db.runTransaction(async (tx) => {
    const last = ((await tx.get(counter)).get(String(year)) as number | undefined) ?? 0
    const next = invoiceNumber(year, last + 1)
    tx.set(counter, { [String(year)]: last + 1 }, { merge: true })
    tx.create(ref, {
      number: next,
      uid: memberRef.id,
      status: "open",
      issuedOn: data.issuedOn,
      dueOn: data.dueOn,
      from: { name: billing.name, address: billing.address, phone: billing.phone, email: billing.email },
      billTo: data.billTo,
      program: data.program,
      lines: data.lines,
      notes: data.notes.filter(Boolean),
      total: invoiceTotal(data.lines),
      payment: billing.payment,
      paidOn: null,
      createdAt: now,
      createdBy: viewer.uid,
      updatedAt: now,
    })
    return next
  })
  if (data.saveAddress && data.billTo.address !== (target.mailingAddress ?? ""))
    await memberRef.update({ mailingAddress: data.billTo.address || null })
  await audit(viewer, "invoice.created", "member", memberRef.id, {
    number,
    total: formatCents(invoiceTotal(data.lines)),
  })
  after(() => tellMember(memberRef.id, target.email, number, invoiceTotal(data.lines)))
  refresh()
  return { ok: true, data: { id: ref.id, number } }
}

/** A notification and, when email is set up, an email: the invoice is in their settings. */
async function tellMember(uid: string, email: string, number: string, total: number) {
  const href = `${publicEnv.NEXT_PUBLIC_SITE_URL}/members/settings#invoices`
  await sendToMembers(adminDb(), adminMessaging(), [uid], {
    title: "New invoice from HG",
    body: `${number} for ${formatCents(total)} is in your settings.`,
    url: "/members/settings#invoices",
    tag: `invoice-${number}`,
  })
  const config = emailConfig()
  if (!config) return
  const { html, text } = layout({
    heading: `Invoice ${number}`,
    paragraphs: [
      `HG sent you an invoice for ${formatCents(total)}. It is in your settings, with how to pay.`,
      `Please include ${number} with your payment.`,
    ],
    cta: { label: "Open my invoice", href },
  })
  await sendEmail(config, { to: email, subject: `Your HG Profit Options invoice ${number}`, html, text }).catch(
    (error: unknown) => console.error(`Invoice ${number} email failed:`, error),
  )
}

const statusInput = z.object({
  status: z.enum(["open", "paid", "void"]),
  paidOn: date.nullable(),
})

/** Marks an invoice paid (on a date), unpaid again, or cancelled. What it says never changes. */
export async function setInvoiceStatus(id: string, input: z.input<typeof statusInput>): Promise<ActionResult> {
  const viewer = await adminForAction()
  if (!viewer) return forbidden
  const parsed = statusInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: "validation", message: "Choose a status." }
  if (typeof id !== "string" || id.length === 0 || id.length > 128 || id.includes("/"))
    return { ok: false, code: "not-found", message: "This invoice no longer exists." }
  const ref = adminDb().collection(COLLECTIONS.invoices).doc(id)
  const snap = await ref.get()
  const invoice: InvoiceDoc | null = snap.exists ? parseDoc(invoiceSchema, snap.id, snap.data()) : null
  if (!invoice) return { ok: false, code: "not-found", message: "This invoice no longer exists." }
  const { status } = parsed.data
  const paidOn = status === "paid" ? (parsed.data.paidOn ?? todayInMarketZone()) : null
  await ref.update({ status, paidOn, updatedAt: Timestamp.now() })
  const action = status === "paid" ? "invoice.paid" : status === "void" ? "invoice.voided" : "invoice.reopened"
  await audit(viewer, action, "member", invoice.uid, { number: invoice.number })
  refresh()
  return { ok: true, data: undefined }
}
