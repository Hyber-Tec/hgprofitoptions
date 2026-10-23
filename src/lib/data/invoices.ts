import "server-only"
import { invoiceNumber } from "@/core/invoice"
import {
  COLLECTIONS,
  billingSettingsSchema,
  invoiceSchema,
  isDocId,
  parseDoc,
  type BillingSettings,
  type InvoiceDoc,
} from "@/server/model"
import { adminDb } from "@/lib/firebase/admin"
import { memo } from "./cache"

/** Who invoices come from and how to pay. Server only: it holds the bank details. */
export function getBillingSettings(): Promise<BillingSettings> {
  return memo("settings:billing", 60_000, async () => {
    const snap = await adminDb().collection(COLLECTIONS.settings).doc("billing").get()
    const parsed = billingSettingsSchema.safeParse(snap.data() ?? {})
    return parsed.success ? parsed.data : billingSettingsSchema.parse({})
  })
}

/** A member's invoices, newest first. */
export async function listInvoicesFor(uid: string): Promise<InvoiceDoc[]> {
  const snap = await adminDb()
    .collection(COLLECTIONS.invoices)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get()
  return snap.docs.map((d) => parseDoc(invoiceSchema, d.id, d.data())).filter((i): i is InvoiceDoc => i !== null)
}

export async function getInvoice(id: string): Promise<InvoiceDoc | null> {
  if (!isDocId(id)) return null
  const snap = await adminDb().collection(COLLECTIONS.invoices).doc(id).get()
  return snap.exists ? parseDoc(invoiceSchema, snap.id, snap.data()) : null
}

/** The number the next invoice of `year` gets, for the preview; issuing takes it in a transaction. */
export async function nextInvoiceNumber(year: number): Promise<string> {
  const snap = await adminDb().collection(COLLECTIONS.counters).doc("invoices").get()
  return invoiceNumber(year, ((snap.get(String(year)) as number | undefined) ?? 0) + 1)
}
