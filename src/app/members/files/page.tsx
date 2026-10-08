import type { Metadata } from "next"
import { requireActiveMember } from "@/lib/auth/guards"
import { listResources } from "@/lib/data/content"
import { FilesLibrary } from "@/components/portal/files-library"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Files" }

export default async function FilesPage() {
  await requireActiveMember("/members/files")
  const files = await listResources()
  return (
    <>
      <PageHeader
        title="Files"
        description="Guides, checklists and class material. PDFs carry your name when you open or download them."
      />
      <FilesLibrary
        files={files.map((f) => ({
          id: f.id,
          folder: f.folder,
          title: f.title,
          description: f.description,
          sizeBytes: f.sizeBytes,
          isPdf: f.mimeType === "application/pdf" || f.storagePath.toLowerCase().endsWith(".pdf"),
        }))}
      />
    </>
  )
}
