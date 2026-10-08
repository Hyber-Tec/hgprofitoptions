import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { LuArrowUpRight, LuCalendarClock } from "react-icons/lu"
import { formatDateTimeET, formatPercent, formatPrice } from "@/core/format"
import { requireAdmin } from "@/lib/auth/guards"
import { alertEngagement, getAlert, listAlertRevisions, listFollowUps } from "@/lib/data/alerts"
import { integrations } from "@/lib/env.server"
import { composerInitial, composerOptions } from "@/lib/admin/alert-form"
import { AlertComposer } from "@/components/admin/alert-composer"
import { CloseAlertForm, DiscardAlertButton, FollowUpForm, ReviseAlertForm } from "@/components/admin/alert-manager"
import { AlertCard, toAlertView } from "@/components/portal/alerts/alert-card"
import { AlertKindBadge } from "@/components/portal/alerts/alert-kind-badge"
import { Signed, Stat } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Alert" }

export default async function AdminAlertPage({ params }: PageProps<"/admin/alerts/[id]">) {
  const { id } = await params
  await requireAdmin({ next: `/admin/alerts/${id}` })
  const alert = await getAlert(id)
  if (!alert) notFound()
  if (alert.parentId) redirect(`/admin/alerts/${alert.parentId}`)

  if (alert.status === "draft" || alert.status === "scheduled") {
    const { symbols, targets } = await composerOptions()
    return (
      <>
        <PageHeader
          title={alert.status === "draft" ? "Draft alert" : "Scheduled alert"}
          description="Edit, then publish now or schedule it."
          actions={<DiscardAlertButton alertId={alert.id} scheduled={alert.status === "scheduled"} />}
        />
        {alert.status === "scheduled" && alert.publishAt && (
          <Alert>
            <LuCalendarClock />
            <AlertTitle>Goes out {formatDateTimeET(alert.publishAt)}</AlertTitle>
            <AlertDescription>Saving changes keeps the schedule. Publish now to send it immediately.</AlertDescription>
          </Alert>
        )}
        <AlertComposer
          initial={composerInitial(alert)}
          symbols={symbols}
          targets={targets}
          emailAvailable={integrations.email}
        />
      </>
    )
  }

  const [followUps, revisions, engagement] = await Promise.all([
    listFollowUps(alert.id),
    listAlertRevisions(alert.id),
    alertEngagement([alert.id]),
  ])
  const { reads, took } = engagement.get(alert.id) ?? { reads: 0, took: 0 }
  const remaining = Math.max(0, 1 - alert.exits.reduce((s, e) => s + e.portion, 0))
  const audience = alert.delivery?.audience ?? 0

  return (
    <>
      <PageHeader
        title={alert.title}
        meta={
          <>
            <AlertKindBadge kind={alert.kind} />
            <span>{alert.status === "closed" ? "Closed" : "Open"}</span>
            {alert.publishedAt && <span>Published {formatDateTimeET(alert.publishedAt)}</span>}
            {alert.edited && <span>Edited</span>}
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/members/alerts/${alert.id}`} />}
            nativeButton={false}
          >
            View as a member
            <LuArrowUpRight />
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <Stat
              label="Push and email sent"
              value={alert.delivery?.sent ?? "-"}
              hint={
                alert.delivery
                  ? `${alert.delivery.failed > 0 ? `${alert.delivery.failed} failed · ` : ""}${audience} members have access`
                  : "Sending now"
              }
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Read"
              value={audience > 0 ? formatPercent(Math.min(1, reads / audience), { signed: false, digits: 0 }) : reads}
              hint={`${reads} ${reads === 1 ? "member" : "members"} opened it`}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat label="Took the trade" value={took} hint="Marked in their journal" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Stat
              label="Result"
              value={alert.resultPct === null ? "-" : <Signed value={alert.resultPct} digits={1} />}
              hint={alert.exits.length > 0 ? `${Math.round((1 - remaining) * 100)}% exited` : "Open"}
            />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <AlertCard alert={toAlertView(alert)} />
          {alert.exits.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Exits</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {alert.exits.map((e, i) => (
                  <p key={i} className="flex justify-between gap-3 tabular-nums">
                    <span>
                      {formatPercent(e.portion, { signed: false, digits: 0 })} at {formatPrice(e.price)}
                    </span>
                    <span className="text-muted-foreground">{formatDateTimeET(e.at)}</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
              <CardDescription>{followUps.length === 0 ? "None yet." : `${followUps.length} posted`}</CardDescription>
            </CardHeader>
            {followUps.length > 0 && (
              <CardContent className="flex flex-col gap-3">
                {followUps.map((f) => (
                  <div key={f.id} className="flex flex-col gap-1 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <AlertKindBadge kind={f.kind} />
                      {f.sellPoints[0] !== undefined && (
                        <span className="font-medium tabular-nums">at {formatPrice(f.sellPoints[0])}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {f.publishedAt ? formatDateTimeET(f.publishedAt) : ""}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {f.delivery ? `${f.delivery.sent} delivered` : ""}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{f.body}</p>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
          {revisions.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Earlier versions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {revisions.map((r) => (
                  <p key={r.id}>
                    Version {r.revision}: {r.title}
                    <span className="block text-xs text-muted-foreground">
                      {r.replacedAt ? `Replaced ${formatDateTimeET(r.replacedAt)}` : ""}
                      {r.note && ` · ${r.note}`}
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {alert.symbol && (
            <FollowUpForm
              alertId={alert.id}
              remaining={alert.status === "published" ? remaining : 0}
              isOption={alert.assetType === "option"}
            />
          )}
          {alert.status === "published" && alert.kind === "buy" && remaining > 0 && (
            <CloseAlertForm alertId={alert.id} remaining={remaining} />
          )}
          <ReviseAlertForm
            alertId={alert.id}
            initial={{
              title: alert.title,
              body: alert.body,
              buyLow: alert.buyLow,
              buyHigh: alert.buyHigh,
              sellPoints: alert.sellPoints,
              stop: alert.stop,
            }}
          />
        </div>
      </div>
    </>
  )
}
