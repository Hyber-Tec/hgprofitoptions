import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { formatDate } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { getRecap } from "@/lib/data/recaps"
import { listActiveTickers } from "@/lib/data/tools"
import { integrations } from "@/lib/env.server"
import { RecapActions, RecapCard, RecapStatus, UploadTranscript } from "@/components/admin/recap-forms"
import { RecapSummary } from "@/components/portal/classroom/recap-summary"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Class recap" }

export default async function AdminRecapPage({ params }: PageProps<"/admin/recaps/[id]">) {
  const { id } = await params
  await requireAdmin({ next: `/admin/recaps/${id}` })
  const [recap, tickers] = await Promise.all([getRecap(id), listActiveTickers()])
  if (!recap) notFound()
  const { transcript, summary } = recap
  const working = transcript.status === "pending" || transcript.status === "running"
  const hasTranscript = transcript.path !== null || transcript.downloadUrls.length > 0
  const from =
    transcript.source === "zoom" ? "from Zoom's transcript" : `from ${transcript.name ?? "an uploaded transcript"}`

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={recap.title}
        description={`${formatDate(recap.date)}, ${from}`}
        meta={
          summary && (
            <ToneBadge tone={recap.published ? "positive" : "muted"}>
              {recap.published ? "Members can read it" : "Hidden from members"}
            </ToneBadge>
          )
        }
        actions={
          <RecapActions
            recapId={recap.id}
            published={recap.published}
            written={summary !== null}
            working={working}
            canRewrite={integrations.ai && hasTranscript}
            transcriptHref={transcript.path ? `/admin/recaps/${recap.id}/transcript` : null}
          />
        }
      />
      <RecapStatus
        recapId={recap.id}
        status={transcript.status}
        message={transcript.message}
        canRetry={integrations.ai && hasTranscript}
      />
      {transcript.status === "failed" && integrations.ai && <UploadTranscript recapId={recap.id} />}
      {summary && (
        <RecapCard recapId={recap.id} editable={!working} initial={{ title: recap.title, date: recap.date, summary }}>
          <RecapSummary summary={summary} followed={new Set(tickers.map((t) => t.symbol))} />
        </RecapCard>
      )}
    </div>
  )
}
