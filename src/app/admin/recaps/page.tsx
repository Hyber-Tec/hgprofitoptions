import type { Metadata } from "next"
import Link from "next/link"
import { LuPlus } from "react-icons/lu"
import { formatDate, formatDateTimeET } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listRecaps } from "@/lib/data/recaps"
import { integrations } from "@/lib/env.server"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { ButtonLink } from "@/components/shared/button-link"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ClassRecapDoc } from "@/server/model"

export const metadata: Metadata = { title: "Class recaps" }

function Status({ recap }: { recap: ClassRecapDoc }) {
  const { status } = recap.transcript
  if (status === "pending" || status === "running") return <ToneBadge tone="warning">AI writing</ToneBadge>
  if (status === "failed") return <ToneBadge tone="negative">Not written</ToneBadge>
  return recap.published ? <ToneBadge tone="positive">Published</ToneBadge> : <ToneBadge tone="muted">Hidden</ToneBadge>
}

export default async function AdminRecapsPage() {
  await requireAdmin({ next: "/admin/recaps" })
  const recaps = await listRecaps()
  return (
    <>
      <PageHeader
        title="Class recaps"
        description={
          integrations.zoomRecaps
            ? "AI writes a recap of each recorded class from Zoom's transcript. Members read them under Classroom."
            : "AI writes a recap of a class from its transcript. Members read them under Classroom. Connect Zoom to have them made after every class."
        }
        actions={
          <ButtonLink size="sm" href="/admin/recaps/new">
            <LuPlus />
            Add a recap
          </ButtonLink>
        }
      />
      {recaps.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No recaps yet</EmptyTitle>
            <EmptyDescription>
              {integrations.zoomRecaps
                ? "The next recorded class appears here once Zoom has its transcript."
                : "Add one with a class transcript."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Class</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">From</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recaps.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/admin/recaps/${r.id}`}
                      className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {r.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground tabular-nums">{formatDate(r.date)}</span>
                  </TableCell>
                  <TableCell>
                    <Status recap={r} />
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {r.transcript.source === "zoom" ? "Zoom" : "Upload"}
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground md:table-cell">
                    {formatDateTimeET(r.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
