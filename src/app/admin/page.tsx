import type { Metadata } from "next"
import Link from "next/link"
import { LuArrowRight } from "react-icons/lu"
import { median } from "@/core/calc/standing"
import { addDays, todayInMarketZone } from "@/core/dates"
import { formatDate, formatDateTimeET, formatPercent } from "@/core/format"
import { quarterOf, quarterRange } from "@/core/membership/quarters"
import { requireAdmin } from "@/lib/auth/guards"
import { latestJobRuns, listInvites, listMemberRows } from "@/lib/data/admin"
import { listAllAlerts } from "@/lib/data/alerts"
import { RenewButton } from "@/components/admin/renew-button"
import { AlertKindBadge } from "@/components/portal/alerts/alert-kind-badge"
import { Signed, Stat, ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Admin overview" }

export default async function AdminOverviewPage() {
  const viewer = await requireAdmin({ next: "/admin" })
  const [rows, invites, alerts, jobs] = await Promise.all([
    listMemberRows(),
    listInvites("pending"),
    listAllAlerts(100),
    latestJobRuns(),
  ])
  const today = todayInMarketZone()
  const quarter = quarterRange(quarterOf(today).year, quarterOf(today).q)
  const members = rows.filter((r) => r.member.role === "member")
  const active = members.filter((r) => r.status.kind === "active")
  const endingThisQuarter = active.filter((r) => r.status.kind === "active" && r.status.coverageEnd <= quarter.end)
  const expiredRecently = members.filter((r) => r.status.kind === "expired" && r.status.last.end >= addDays(today, -30))
  const upcoming = members.filter((r) => r.status.kind === "upcoming")
  const renewals = active
    .filter((r) => r.status.kind === "active" && r.status.daysLeft <= 21)
    .sort((a, b) =>
      a.status.kind === "active" && b.status.kind === "active" ? a.status.daysLeft - b.status.daysLeft : 0,
    )
  const linked = active.filter((r) => r.member.brokerage.linked)
  const qtd = linked.flatMap((r) => (r.member.stats?.qtdReturn == null ? [] : [r.member.stats.qtdReturn]))
  const errors = members.filter((r) => r.member.brokerage.status === "needs_reauth")
  const deletion = rows.filter((r) => r.member.deletionRequestedAt !== null)
  const roots = alerts.filter((a) => a.parentId === null)
  const open = roots.filter((a) => a.status === "published")
  const recent = alerts.filter((a) => a.status === "published" || a.status === "closed").slice(0, 5)

  return (
    <>
      <PageHeader
        title={`Good to see you, ${viewer.firstName}`}
        description={`${formatDate(today)} · quarter ends ${formatDate(quarter.end)}`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <Stat
              label="Active members"
              value={active.length}
              hint={`${upcoming.length} upcoming · ${invites.length} invited`}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Ending this quarter"
              value={endingThisQuarter.length}
              hint={`${renewals.length} within 21 days`}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Expired in the last 30 days"
              value={expiredRecently.length}
              hint={expiredRecently.length > 0 ? "Worth a call to renew" : "None"}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Open alerts"
              value={open.length}
              hint={`${roots.filter((a) => a.status === "scheduled").length} scheduled · ${roots.filter((a) => a.status === "draft").length} drafts`}
            />
          </CardContent>
        </Card>
      </div>

      {deletion.length > 0 && (
        <Card size="sm" className="border-destructive/30">
          <CardHeader>
            <CardTitle>Deletion requests</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {deletion.map((r) => (
              <Button
                key={r.member.uid}
                size="sm"
                variant="outline"
                render={<Link href={`/admin/members/${r.member.uid}`} />}
                nativeButton={false}
              >
                {r.member.fullName}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Renewals due</CardTitle>
            <CardDescription>Active members whose membership ends within 21 days</CardDescription>
          </CardHeader>
          <CardContent>
            {renewals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is due in the next three weeks.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {renewals.map((r) => (
                  <li key={r.member.uid} className="flex items-center justify-between gap-3 py-2.5">
                    <Link
                      href={`/admin/members/${r.member.uid}`}
                      className="min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="block truncate font-medium">{r.member.fullName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.status.kind === "active"
                          ? `Ends ${formatDate(r.status.coverageEnd)} · ${r.status.daysLeft} days left`
                          : ""}
                      </span>
                    </Link>
                    <RenewButton uid={r.member.uid} name={r.member.fullName} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Community this quarter</CardTitle>
            <CardDescription>Active members with a linked brokerage</CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin/performance" />}
                nativeButton={false}
                className="-mr-2 text-muted-foreground"
              >
                Performance
                <LuArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Stat
              label="Median return"
              value={<Signed value={median(qtd)} digits={1} />}
              hint={`${qtd.length} members with returns`}
            />
            <Stat
              label="In the green"
              value={
                qtd.length > 0
                  ? formatPercent(qtd.filter((x) => x > 0).length / qtd.length, { signed: false, digits: 0 })
                  : "-"
              }
            />
            <Stat label="Not linked yet" value={active.length - linked.length} hint="Encourage them to connect" />
            <Stat
              label="Need reconnecting"
              value={errors.length}
              hint={errors.map((r) => r.member.fullName.split(" ")[0]).join(", ") || "None"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent alerts</CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin/alerts" />}
                nativeButton={false}
                className="-mr-2 text-muted-foreground"
              >
                All alerts
                <LuArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts published yet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recent.map((a) => {
                  const audience = a.delivery?.audience ?? 0
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/admin/alerts/${a.parentId ?? a.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <AlertKindBadge kind={a.kind} />
                          <span className="truncate text-sm">{a.title}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {a.delivery ? `${a.delivery.sent} sent` : "Sending"}
                          {audience > 0 &&
                            ` · ${formatPercent(Math.min(1, a.readCount / audience), { signed: false, digits: 0 })} read`}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data jobs</CardTitle>
            <CardDescription>The latest run of each scheduled job</CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin/market-data" />}
                nativeButton={false}
                className="-mr-2 text-muted-foreground"
              >
                Market data
                <LuArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No job has run yet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-mono text-[13px]">{j.job}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {j.detail ?? formatDateTimeET(j.startedAt)}
                      </span>
                    </span>
                    <ToneBadge
                      tone={j.status === "succeeded" ? "positive" : j.status === "failed" ? "negative" : "muted"}
                    >
                      {j.status === "succeeded"
                        ? "OK"
                        : j.status === "failed"
                          ? "Failed"
                          : j.status === "running"
                            ? "Running"
                            : "Skipped"}
                    </ToneBadge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
