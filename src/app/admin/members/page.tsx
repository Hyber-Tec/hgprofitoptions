import type { Metadata } from "next"
import { LuUpload, LuUserPlus } from "react-icons/lu"
import { addQuarters, quarterLabel, quarterOf } from "@/core/membership/quarters"
import { todayInMarketZone } from "@/core/dates"
import { requireAdmin } from "@/lib/auth/guards"
import { listInvites, listMemberRows } from "@/lib/data/admin"
import { toInviteRow, toMemberListRow } from "@/lib/admin/member-rows"
import { MembersTable } from "@/components/admin/members-table"
import { PendingInvites } from "@/components/admin/pending-invites"
import { PageHeader } from "@/components/portal/page-header"
import { ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Members" }

export default async function AdminMembersPage({ searchParams }: PageProps<"/admin/members">) {
  await requireAdmin({ next: "/admin/members" })
  const { status } = await searchParams
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
            <ButtonLink size="sm" variant="outline" href="/admin/members/import">
              <LuUpload />
              Import CSV
            </ButtonLink>
            <ButtonLink size="sm" href="/admin/members/new">
              <LuUserPlus />
              Add member
            </ButtonLink>
          </>
        }
      />
      <MembersTable
        rows={rows.map(toMemberListRow)}
        quarters={quarters}
        initialStatus={typeof status === "string" ? status : undefined}
      />
      {invites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Pending invitations ({invites.length})</h2>
          <PendingInvites invites={invites.map(toInviteRow)} />
        </section>
      )}
    </>
  )
}
