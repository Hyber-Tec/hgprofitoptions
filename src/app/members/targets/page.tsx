import type { Metadata } from "next"
import { requireActiveMember } from "@/lib/auth/guards"
import { getTargetUpdate, latestTargetUpdate } from "@/lib/data/tools"
import { PageHeader } from "@/components/portal/page-header"
import { TargetsView } from "@/components/portal/tools/targets-view"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Strike Price Targets" }

export default async function TargetsPage() {
  const viewer = await requireActiveMember("/members/targets")
  const latest = await latestTargetUpdate()
  if (!latest) {
    return (
      <>
        <PageHeader title="Strike Price Targets" />
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No targets published yet</EmptyTitle>
            <EmptyDescription>HG&apos;s weekly strike price targets will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    )
  }
  const found = await getTargetUpdate(latest.effectiveDate)
  return <TargetsView viewer={viewer} update={latest} previous={found?.previous ?? null} />
}
