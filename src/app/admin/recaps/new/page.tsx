import type { Metadata } from "next"
import { todayInMarketZone } from "@/core/dates"
import { requireAdmin } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { NewRecapForm } from "@/components/admin/recap-forms"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Add a recap" }

export default async function NewRecapPage() {
  await requireAdmin({ next: "/admin/recaps/new" })
  return (
    <>
      <PageHeader
        title="Add a recap"
        description="Upload the transcript of a class. AI writes the recap: the key points, the tickers discussed and the questions asked."
      />
      <NewRecapForm aiReady={integrations.ai} defaultDate={todayInMarketZone()} />
    </>
  )
}
