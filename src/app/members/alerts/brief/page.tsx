import type { Metadata } from "next"
import { addDays, isoDateInZone, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatTimeET, formatWeekdayDate, plural } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { listPublishedBriefs } from "@/lib/data/briefs"
import { isOpen, postsCutoff } from "@/lib/data/visibility"
import { AlertsTabs } from "@/components/portal/alerts/alerts-tabs"
import { BriefBody } from "@/components/portal/alerts/brief-body"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { HeldBackNotice } from "@/components/portal/trial-notice"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Market brief" }

function dayLabel(day: IsoDate, today: IsoDate): string {
  if (day === today) return "Today"
  if (day === addDays(today, -1)) return "Yesterday"
  return formatWeekdayDate(day)
}

export default async function MarketBriefPage() {
  const viewer = await requireActiveMember("/members/alerts/brief")
  const [all, cutoff] = await Promise.all([listPublishedBriefs(60), postsCutoff(viewer)])
  const briefs = all.filter((b) => isOpen(cutoff, b.publishedAt))
  const held = all.length - briefs.length
  const today = todayInMarketZone()
  const days = new Map<IsoDate, typeof briefs>()
  for (const b of briefs) {
    const day = isoDateInZone(b.publishedAt ?? b.createdAt)
    days.set(day, [...(days.get(day) ?? []), b])
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        description="HG's market brief: the pre-market view, then updates through the first hour of trading."
      />
      <AlertsTabs current="brief" />
      {held > 0 && <HeldBackNotice>{plural(held, "newer brief")} for members</HeldBackNotice>}
      {briefs.length === 0 ? (
        held === 0 && (
          <Empty className="border border-dashed py-16">
            <EmptyHeader>
              <EmptyTitle>No market brief yet</EmptyTitle>
              <EmptyDescription>
                HG&apos;s pre-market view and the updates in the first hour show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <div className="flex max-w-3xl flex-col gap-8">
          {[...days.entries()].map(([day, items]) => (
            <section key={day} className="flex flex-col gap-3" aria-labelledby={`brief-day-${day}`}>
              <h2 id={`brief-day-${day}`} className="text-sm font-medium text-muted-foreground">
                {dayLabel(day, today)}
              </h2>
              {items.map((b) => (
                <Card key={b.id} id={`brief-${b.id}`} className="scroll-mt-20">
                  <CardHeader>
                    <CardTitle>{b.title}</CardTitle>
                    <CardDescription>{b.publishedAt ? formatTimeET(b.publishedAt) : ""}</CardDescription>
                    {b.source === "ai" && (
                      <CardAction>
                        <ToneBadge tone="muted">Written by AI</ToneBadge>
                      </CardAction>
                    )}
                  </CardHeader>
                  <CardContent>
                    <BriefBody body={b.body} />
                  </CardContent>
                </Card>
              ))}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Educational content, not personalized investment advice. Options trading involves risk.
          </p>
        </div>
      )}
    </>
  )
}
