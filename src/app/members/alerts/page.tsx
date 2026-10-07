import type { Metadata } from "next"
import { isoDateInZone, todayInMarketZone, addDays } from "@/core/dates"
import type { AlertKind, IsoDate } from "@/core/domain/types"
import { formatDateWithWeekday } from "@/core/format"
import { ALERT_KINDS } from "@/core/alerts"
import { requireActiveMember } from "@/lib/auth/guards"
import { listFeedAlerts, readReceipts } from "@/lib/data/alerts"
import { getStanding, tickerMap } from "@/lib/data/tools"
import { AlertCard, toAlertView } from "@/components/portal/alerts/alert-card"
import { AlertFilters } from "@/components/portal/alerts/alert-filters"
import { AlertsSidePanel } from "@/components/portal/alerts/alerts-side-panel"
import { PageHeader } from "@/components/portal/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Alerts" }

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null)

function dayLabel(day: IsoDate, today: IsoDate): string {
  if (day === today) return "Today"
  if (day === addDays(today, -1)) return "Yesterday"
  return formatDateWithWeekday(day)
}

export default async function AlertsPage({ searchParams }: PageProps<"/members/alerts">) {
  const viewer = await requireActiveMember("/members/alerts")
  const params = await searchParams
  const kind = one(params.kind)
  const status = one(params.status)
  const symbol = one(params.symbol)?.toUpperCase() ?? null
  const unreadOnly = one(params.unread) === "1"

  const [all, tickers, standing] = await Promise.all([listFeedAlerts({ window: 200 }), tickerMap(), getStanding()])
  const receipts = await readReceipts(
    viewer.uid,
    all.map((a) => a.id),
  )
  const since = viewer.member.createdAt.getTime()
  const isUnread = (a: (typeof all)[number]) => (a.publishedAt?.getTime() ?? 0) > since && !receipts.has(a.id)
  const unreadCount = all.filter(isUnread).length

  const filtered = all.filter((a) => {
    if (kind && ALERT_KINDS.includes(kind as AlertKind) && a.kind !== kind) return false
    if (status === "open" && a.status !== "published") return false
    if (status === "closed" && a.status !== "closed") return false
    if (symbol && a.symbol !== symbol) return false
    if (unreadOnly && !isUnread(a)) return false
    return true
  })

  const today = todayInMarketZone()
  const groups = new Map<IsoDate, typeof filtered>()
  for (const a of filtered) {
    const day = isoDateInZone(a.publishedAt ?? a.createdAt)
    groups.set(day, [...(groups.get(day) ?? []), a])
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        description="HG's buy and sell points, with every follow-up. New alerts appear here instantly."
        meta={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
      />
      <AlertFilters unreadCount={unreadCount} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          {filtered.length === 0 ? (
            <Empty className="border border-dashed py-16">
              <EmptyHeader>
                <EmptyTitle>{all.length === 0 ? "No alerts yet" : "No alerts match these filters"}</EmptyTitle>
                <EmptyDescription>
                  {all.length === 0
                    ? "HG's alerts will appear here as soon as they are posted."
                    : "Try another kind or ticker, or clear the filters."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            [...groups.entries()].map(([day, items]) => (
              <section key={day} className="flex flex-col gap-3" aria-labelledby={`day-${day}`}>
                <h2 id={`day-${day}`} className="text-sm font-medium text-muted-foreground">
                  {dayLabel(day, today)}
                </h2>
                {items.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={toAlertView(a)}
                    unread={isUnread(a)}
                    lastClose={a.symbol ? (tickers.get(a.symbol)?.metrics?.lastClose ?? null) : null}
                  />
                ))}
              </section>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Educational content, not personalized investment advice. Options trading involves risk.
          </p>
        </div>
        <AlertsSidePanel
          open={all.filter((a) => a.status === "published" && a.parentId === null && a.kind === "buy")}
          standing={standing}
          tickers={tickers}
        />
      </div>
    </>
  )
}
