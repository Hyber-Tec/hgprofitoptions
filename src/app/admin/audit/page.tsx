import type { Metadata } from "next"
import Link from "next/link"
import { AUDIT_FILTERS, describeAuditAction, formatAuditDetail } from "@/core/audit"
import { formatDateTimeET } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { listAudit, resolveAuditTargets, type AuditTarget } from "@/lib/data/admin"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/portal/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Audit log" }

function TargetLink({ target }: { target: AuditTarget | undefined }) {
  if (!target) return null
  if (!target.href) return <span className="text-muted-foreground">{target.label}</span>
  return (
    <Link
      href={target.href}
      className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {target.label}
    </Link>
  )
}

const tabClass = (active: boolean) =>
  cn(
    "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active
      ? "border-foreground font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  )

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin({ next: "/admin/audit" })
  const requested = (await searchParams).show
  const filter = AUDIT_FILTERS.find((f) => f.value === requested) ?? null
  const entries = await listAudit({ limit: 300, ...(filter ? { categories: filter.categories } : {}) })
  const targets = await resolveAuditTargets(entries)
  const rows = entries.map((entry) => ({
    entry,
    target: entry.targetId ? targets.get(`${entry.targetType}:${entry.targetId}`) : undefined,
    detail: formatAuditDetail(entry.detail),
  }))
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, and when. Admin views of members' portfolios and journals are recorded too."
      />
      <nav aria-label="Filter" className="flex gap-1 overflow-x-auto border-b">
        <Link
          href="/admin/audit"
          aria-current={filter === null ? "page" : undefined}
          className={tabClass(filter === null)}
        >
          Everything
        </Link>
        {AUDIT_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/audit?show=${f.value}`}
            aria-current={filter?.value === f.value ? "page" : undefined}
            className={tabClass(filter?.value === f.value)}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="rounded-xl border py-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <>
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ entry: e, target, detail }) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTimeET(e.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{e.actorEmail ?? "System"}</TableCell>
                    <TableCell className="text-sm font-medium">{describeAuditAction(e.action)}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">
                      <TargetLink target={target} />
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-muted-foreground">{detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col divide-y rounded-xl border md:hidden">
            {rows.map(({ entry: e, target, detail }) => (
              <li key={e.id} className="flex flex-col gap-0.5 p-4 text-sm">
                <p className="font-medium">{describeAuditAction(e.action)}</p>
                {target && (
                  <p className="truncate">
                    <TargetLink target={target} />
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {e.actorEmail ?? "System"} · {formatDateTimeET(e.createdAt)}
                </p>
                {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
