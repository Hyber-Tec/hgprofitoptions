import type { Metadata } from "next"
import { isoDateInZone } from "@/core/dates"
import { formatShortDate, plural } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listSendableMembers } from "@/lib/data/admin"
import { listPresentations } from "@/lib/data/content"
import { integrations } from "@/lib/env.server"
import { PresentationsManager } from "@/components/admin/content-managers"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Presentations" }

export default async function AdminPresentationsPage() {
  await requireAdmin({ next: "/admin/presentations" })
  const [items, members] = await Promise.all([listPresentations({ includeDrafts: true }), listSendableMembers()])
  return (
    <>
      <PageHeader
        title="Presentations"
        description="Slides and recordings from the live classes. Send them to members by email and in the app."
      />
      <PresentationsManager
        members={members}
        emailReady={integrations.email}
        items={items.map((p) => ({
          id: p.id,
          title: p.title,
          sessionDate: p.sessionDate,
          summary: p.summary,
          slidesPath: p.slidesPath,
          videoUrl: p.videoUrl,
          published: p.published,
          sent: p.sentAt
            ? `sent ${formatShortDate(isoDateInZone(p.sentAt))} to ${plural(p.sentTo ?? 0, "member")}`
            : null,
        }))}
      />
    </>
  )
}
