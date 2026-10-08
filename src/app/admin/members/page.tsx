import type { Metadata } from "next"
import Link from "next/link"
import { LuUpload, LuUserPlus } from "react-icons/lu"
import { addQuarters, quarterLabel, quarterOf } from "@/core/membership/quarters"
import { todayInMarketZone } from "@/core/dates"
import { requireAdmin } from "@/lib/auth/guards"
import { listInvites, listMemberRows } from "@/lib/data/admin"
import { toInviteRow, toMemberListRow } from "@/lib/admin/member-rows"
import { MembersTable } from "@/components/admin/members-table"
import { PendingInvites } from "@/components/admin/pending-invites"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Members" }

export default async function AdminMembersPage() {
  await requireAdmin({ next: "/admin/members" })
  const [rows, invites] = await Promise.all([listMemberRows(), listInvites("pending")])
  const now = quarterOf(todayInMarketZone())
  const quarters = [-1, 0, 1, 2].map((n) => addQuarters(now.year, now.q, n)).map((q) => quarterLabel(q.year, q.q))
  return (
    <>
      <PageHeader
        title="Members"
        description="Add members by quarter, renew them, and see who is linked and how they are doing."
        actions={
          <>
            <Button size="sm" variant="outline" render={<Link href="/admin/members/import" />} nativeButton={false}>
              <LuUpload />
              Import CSV
            </Button>
            <Button size="sm" render={<Link href="/admin/members/new" />} nativeButton={false}>
              <LuUserPlus />
              Add member
            </Button>
          </>
        }
      />
      <MembersTable rows={rows.map(toMemberListRow)} quarters={quarters} />
      {invites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Pending invitations ({invites.length})</h2>
          <PendingInvites invites={invites.map(toInviteRow)} />
        </section>
      )}
    </>
  )
}
