import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { listPresentations, listResources } from "@/lib/data/content"
import { integrations } from "@/lib/env.server"
import { NewQuizForm } from "@/components/admin/quiz-forms"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "New quiz" }

export default async function NewQuizPage() {
  await requireAdmin({ next: "/admin/quizzes/new" })
  const [presentations, resources] = await Promise.all([
    listPresentations({ includeDrafts: true }),
    listResources({ includeDrafts: true }),
  ])
  const documents = [
    ...presentations.flatMap((p) =>
      p.slidesPath ? [{ path: p.slidesPath, name: `${p.title} (slides)`, contentType: "application/pdf" }] : [],
    ),
    ...resources.map((r) => ({ path: r.storagePath, name: r.title, contentType: r.mimeType })),
  ].filter((d) => /\.(pdf|docx|txt|md)$/i.test(d.path) || d.contentType === "application/pdf")
  return (
    <>
      <PageHeader
        title="New quiz"
        description="Pick the class document. AI reads it and writes the questions; you review them before members see anything."
      />
      <NewQuizForm documents={documents} aiReady={integrations.ai} />
    </>
  )
}
