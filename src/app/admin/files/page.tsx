import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { listResources } from "@/lib/data/content"
import { FilesManager } from "@/components/admin/content-managers"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Files" }

export default async function AdminFilesPage() {
  await requireAdmin({ next: "/admin/files" })
  const items = await listResources({ includeDrafts: true })
  return (
    <>
      <PageHeader title="Files" description="Guides, checklists and class material in the member library." />
      <FilesManager
        items={items.map((r) => ({
          id: r.id,
          folder: r.folder,
          title: r.title,
          description: r.description,
          storagePath: r.storagePath,
          mimeType: r.mimeType,
          sizeBytes: r.sizeBytes,
          published: r.published,
        }))}
      />
    </>
  )
}
