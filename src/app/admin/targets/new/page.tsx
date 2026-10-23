import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { editorContext, publishedHistory, today } from "@/lib/admin/targets-data"
import { TargetsEditor } from "@/components/admin/targets-editor"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "New strike target update" }

export default async function NewTargetsPage() {
  await requireAdmin({ next: "/admin/targets/new" })
  const date = today()
  const [{ configGroups, tickers }, history] = await Promise.all([editorContext(), publishedHistory()])
  return (
    <>
      <PageHeader
        title="New strike target update"
        description="Paste this week's Google Doc, check the preview, and publish."
      />
      <TargetsEditor
        initial={{ mode: "new", draftId: null, effectiveDate: date, text: "" }}
        configGroups={configGroups}
        tickers={tickers}
        history={history}
      />
    </>
  )
}
