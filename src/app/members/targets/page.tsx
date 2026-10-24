import type { Metadata } from "next"
import { requireActiveMember } from "@/lib/auth/guards"
import { getTargetUpdate, latestTargetUpdate } from "@/lib/data/tools"
import { postsCutoff } from "@/lib/data/visibility"
import { PageHeader } from "@/components/portal/page-header"
import { HeldBackNotice } from "@/components/portal/trial-notice"
import { TargetsView } from "@/components/portal/tools/targets-view"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Strike Price Targets" }

export default async function TargetsPage() {
  const viewer = await requireActiveMember("/members/targets")
  const cutoff = await postsCutoff(viewer)
  const latest = await latestTargetUpdate(cutoff)
  if (!latest) {
    return (
      <>
        <PageHeader title="Strike Price Targets" />
        {cutoff && (await latestTargetUpdate()) ? (
          <HeldBackNotice>This week&apos;s strike targets are for members</HeldBackNotice>
        ) : (
          <Empty className="border border-dashed py-16">
            <EmptyHeader>
              <EmptyTitle>No targets published yet</EmptyTitle>
              <EmptyDescription>HG&apos;s weekly strike price targets will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </>
    )
  }
  const found = await getTargetUpdate(latest.effectiveDate, cutoff)
  return <TargetsView viewer={viewer} update={latest} previous={found?.previous ?? null} />
}
