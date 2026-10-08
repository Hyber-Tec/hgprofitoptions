import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { listPresentations } from "@/lib/data/content"
import { PresentationsManager } from "@/components/admin/content-managers"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Presentations" }

export default async function AdminPresentationsPage() {
  await requireAdmin({ next: "/admin/presentations" })
  const items = await listPresentations({ includeDrafts: true })
  return (
    <>
      <PageHeader title="Presentations" description="Slides and recordings from the Saturday classes." />
      <PresentationsManager
        items={items.map((p) => ({
          id: p.id,
          title: p.title,
          sessionDate: p.sessionDate,
          summary: p.summary,
          slidesPath: p.slidesPath,
          videoUrl: p.videoUrl,
          published: p.published,
        }))}
      />
    </>
  )
}
