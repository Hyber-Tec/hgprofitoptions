import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { editorContext, previousUpdate, today } from "@/lib/admin/targets-data"
import { TargetsEditor } from "@/components/admin/targets-editor"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "New strike target update" }

export default async function NewTargetsPage() {
  await requireAdmin({ next: "/admin/targets/new" })
  const date = today()
  const [{ configGroups, tickers }, previous] = await Promise.all([editorContext(), previousUpdate(date, false)])
  return (
    <>
      <PageHeader
        title="New strike target update"
        description="Paste the Google Doc, check the flagged lines, fix values inline, then preview and publish."
      />
      <TargetsEditor
        initial={{ mode: "new", draftId: null, effectiveDate: date, text: "", rows: [], groups: [] }}
        configGroups={configGroups}
        tickers={tickers}
        previous={previous}
      />
    </>
  )
}
