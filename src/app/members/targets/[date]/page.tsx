import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { IsoDate } from "@/core/domain/types"
import { formatDate } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getTargetUpdate } from "@/lib/data/tools"
import { TargetsView } from "@/components/portal/tools/targets-view"

export async function generateMetadata({ params }: PageProps<"/members/targets/[date]">): Promise<Metadata> {
  const { date } = await params
  return { title: `Strike Price Targets ${formatDate(date as IsoDate)}` }
}

export default async function TargetsArchivePage({ params }: PageProps<"/members/targets/[date]">) {
  const { date } = await params
  const viewer = await requireActiveMember(`/members/targets/${date}`)
  const found = await getTargetUpdate(date)
  if (!found) notFound()
  return <TargetsView viewer={viewer} update={found.update} previous={found.previous} />
}
