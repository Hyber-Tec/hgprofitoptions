import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { MemberImport } from "@/components/admin/member-import"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Import members" }

export default async function ImportMembersPage() {
  await requireAdmin({ next: "/admin/members/import" })
  return (
    <>
      <PageHeader
        title="Import members"
        description="Move members over from the old site. Each row becomes an invitation with its membership period."
      />
      <MemberImport />
    </>
  )
}
