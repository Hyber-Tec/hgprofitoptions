import { invoicePdf } from "@/server/invoice-pdf"
import { getViewer } from "@/lib/auth/guards"
import { getInvoice } from "@/lib/data/invoices"

/** An invoice as a PDF, for the member it bills and for admins. Cancelled ones only for admins. */
export async function GET(_request: Request, { params }: RouteContext<"/members/invoices/[id]">) {
  const viewer = await getViewer()
  if (!viewer) return new Response("Not found", { status: 404 })
  const invoice = await getInvoice((await params).id)
  const allowed =
    invoice !== null && (viewer.role === "admin" || (invoice.uid === viewer.uid && invoice.status !== "void"))
  if (!invoice || !allowed) return new Response("Not found", { status: 404 })
  const pdf = await invoicePdf(invoice)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
