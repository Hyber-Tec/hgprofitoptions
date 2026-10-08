import type { Metadata } from "next"
import Link from "next/link"
import { LuPlus } from "react-icons/lu"
import { formatDateTimeET, formatPercent } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { alertEngagement, listAllAlerts } from "@/lib/data/alerts"
import { cn } from "@/lib/utils"
import { AlertKindBadge } from "@/components/portal/alerts/alert-kind-badge"
import { Signed, ToneBadge, type Tone } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Alerts" }

const PAGE_SIZE = 50

const STATUSES = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Open" },
  { value: "closed", label: "Closed" },
] as const

const STATUS_TONE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "muted" },
  scheduled: { label: "Scheduled", tone: "warning" },
  published: { label: "Open", tone: "positive" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "muted" },
}

export default async function AdminAlertsPage({ searchParams }: PageProps<"/admin/alerts">) {
  await requireAdmin({ next: "/admin/alerts" })
  const params = await searchParams
  const status = STATUSES.find((s) => s.value === params.status)?.value ?? "all"
  const all = await listAllAlerts()
  const roots = all.filter((a) => a.parentId === null)
  const followUps = new Map<string, number>()
  for (const a of all) if (a.parentId) followUps.set(a.parentId, (followUps.get(a.parentId) ?? 0) + 1)
  const list = roots.filter((a) => status === "all" || a.status === status)
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page)) || 1))
  const visible = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const engagement = await alertEngagement(
    visible.filter((a) => a.status === "published" || a.status === "closed").map((a) => a.id),
  )
  const pageHref = (n: number) => {
    const query = new URLSearchParams({
      ...(status === "all" ? {} : { status }),
      ...(n > 1 ? { page: String(n) } : {}),
    })
    return `/admin/alerts${query.size ? `?${query.toString()}` : ""}` as const
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Buy and sell points for members. Publishing notifies them right away."
        actions={
          <ButtonLink size="sm" href="/admin/alerts/new">
            <LuPlus />
            New alert
          </ButtonLink>
        }
      />
      <nav aria-label="Alert status" className="flex gap-1 overflow-x-auto border-b">
        {STATUSES.map((s) => {
          const count = s.value === "all" ? roots.length : roots.filter((a) => a.status === s.value).length
          return (
            <Link
              key={s.value}
              href={s.value === "all" ? "/admin/alerts" : `/admin/alerts?status=${s.value}`}
              aria-current={status === s.value ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                status === s.value
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label} <span className="text-muted-foreground tabular-nums">{count}</span>
            </Link>
          )
        })}
      </nav>
      {list.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No alerts here</EmptyTitle>
            <EmptyDescription>Post a buy point, a watch or a class note with New alert.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Alert</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Result</TableHead>
                <TableHead className="text-right">Notified</TableHead>
                <TableHead className="text-right">Read</TableHead>
                <TableHead className="text-right">Took it</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => {
                const st = STATUS_TONE[a.status] ?? { label: a.status, tone: "muted" as Tone }
                const when = a.publishedAt ?? a.publishAt ?? a.createdAt
                const audience = a.delivery?.audience ?? 0
                const { reads, took } = engagement.get(a.id) ?? { reads: 0, took: 0 }
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        href={`/admin/alerts/${a.id}`}
                        className="flex flex-col gap-1 rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="flex items-center gap-2">
                          <AlertKindBadge kind={a.kind} />
                          <span className="font-medium">{a.title}</span>
                        </span>
                        {(followUps.get(a.id) ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {followUps.get(a.id) === 1 ? "1 follow-up" : `${followUps.get(a.id)} follow-ups`}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {a.status === "scheduled" ? "Goes out " : ""}
                      {formatDateTimeET(when)}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.resultPct === null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <Signed value={a.resultPct} digits={1} />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {a.delivery ? (
                        <>
                          {a.delivery.sent}
                          {a.delivery.failed > 0 && (
                            <span className="block text-xs text-destructive">{a.delivery.failed} failed</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {audience > 0
                        ? formatPercent(Math.min(1, reads / audience), { signed: false, digits: 0 })
                        : reads > 0
                          ? reads
                          : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{took || "-"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <ButtonLink size="sm" variant="outline" href={pageHref(page - 1)}>
                Newer
              </ButtonLink>
            )}
            {page < pages && (
              <ButtonLink size="sm" variant="outline" href={pageHref(page + 1)}>
                Older
              </ButtonLink>
            )}
          </span>
        </nav>
      )}
    </>
  )
}
