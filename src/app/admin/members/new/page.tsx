import type { Metadata } from "next"
import { todayInMarketZone } from "@/core/dates"
import { quarterOf } from "@/core/membership/quarters"
import { requireAdmin } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { NewMemberForm } from "@/components/admin/new-member-form"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Add member" }

export default async function NewMemberPage() {
  await requireAdmin({ next: "/admin/members/new" })
  const { year, q } = quarterOf(todayInMarketZone())
  return (
    <>
      <PageHeader
        title="Add member"
        description="Members join by invitation. They create their login from the link, or sign in with Google using this email."
      />
      <NewMemberForm defaultYear={year} defaultQuarter={q} emailAvailable={integrations.email} />
    </>
  )
}
