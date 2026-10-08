import type { Metadata } from "next"
import Link from "next/link"
import { LuPlus } from "react-icons/lu"
import { formatDateTimeET, formatDateWithWeekday } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listTargetUpdates } from "@/lib/data/tools"
import { listDrafts } from "@/lib/admin/targets-data"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Strike targets" }

export default async function AdminTargetsPage() {
  await requireAdmin({ next: "/admin/targets" })
  const [published, drafts] = await Promise.all([listTargetUpdates(), listDrafts()])
  return (
    <>
      <PageHeader
        title="Strike targets"
        description="Paste the weekly Google Doc, review what the reader flags, and publish. Published updates are never changed silently."
        actions={
          <Button size="sm" render={<Link href="/admin/targets/new" />} nativeButton={false}>
            <LuPlus />
            New update
          </Button>
        }
      />
      {drafts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Drafts</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/targets/${d.id}`}
                  className="flex items-center justify-between gap-3 p-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span>
                    <span className="block font-medium">{formatDateWithWeekday(d.effectiveDate)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {d.entries.length} tickers · saved {formatDateTimeET(d.createdAt)}
                    </span>
                  </span>
                  <ToneBadge tone="muted">Draft</ToneBadge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {published.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>Nothing published yet</EmptyTitle>
            <EmptyDescription>Start with New update and paste this week&apos;s targets.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Update</TableHead>
                <TableHead className="text-right">Tickers</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {published.map((u, i) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link
                      href={`/admin/targets/${u.effectiveDate}`}
                      className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {formatDateWithWeekday(u.effectiveDate)}
                    </Link>
                    {i === 0 && (
                      <ToneBadge tone="positive" className="ml-2">
                        Live
                      </ToneBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.entries.length}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.revision > 1 ? `Corrected (v${u.revision})` : "Original"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.publishedAt ? formatDateTimeET(u.publishedAt) : "-"}
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
