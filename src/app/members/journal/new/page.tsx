import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth/guards"
import { ManualTradeForm } from "@/components/portal/journal/manual-trade-form"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Add a trade" }

export default async function NewTradePage() {
  const viewer = await requireViewer("/members/journal/new")
  if (!viewer.hasAccess) redirect("/members/journal")
  return (
    <>
      <PageHeader
        title="Add a trade"
        description="For trades outside a linked brokerage. You can journal it right after saving."
      />
      <ManualTradeForm />
    </>
  )
}
