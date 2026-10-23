import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { formatDate } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getPublishedRecap } from "@/lib/data/recaps"
import { listActiveTickers } from "@/lib/data/tools"
import { RecapSummary } from "@/components/portal/classroom/recap-summary"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = { title: "Class recap" }

export default async function RecapPage({ params }: PageProps<"/members/classroom/recaps/[id]">) {
  const { id } = await params
  await requireActiveMember(`/members/classroom/recaps/${id}`)
  const [recap, tickers] = await Promise.all([getPublishedRecap(id), listActiveTickers()])
  if (!recap?.summary) notFound()
  return (
    <>
      <PageHeader
        title={recap.title}
        description={`${formatDate(recap.date)} · written by AI from the class recording, so check anything that matters against your notes.`}
      />
      <Card className="max-w-3xl">
        <CardContent>
          <RecapSummary summary={recap.summary} followed={new Set(tickers.map((t) => t.symbol))} />
        </CardContent>
      </Card>
    </>
  )
}
