import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth/guards"
import { CsvImport } from "@/components/portal/journal/csv-import"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Import trades" }

export default async function ImportTradesPage() {
  const viewer = await requireViewer("/members/journal/import")
  if (!viewer.hasAccess) redirect("/members/journal")
  return (
    <>
      <PageHeader
        title="Import trades"
        description="Bring in your trade history from a CSV. Importing the same file twice does not create duplicates."
      />
      <CsvImport />
    </>
  )
}
