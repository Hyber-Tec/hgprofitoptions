import type { Metadata } from "next"
import { formatMomentET, formatWeekdayDate, plural } from "@/core/format"
import { defaultSpikeTitle } from "@/core/spikes"
import { requireActiveMember } from "@/lib/auth/guards"
import { listSpikeLists } from "@/lib/data/spikes"
import { isOpen, postsCutoff } from "@/lib/data/visibility"
import { AlertsTabs } from "@/components/portal/alerts/alerts-tabs"
import { SPIKE_STUDY_STEPS, SpikeTable } from "@/components/portal/alerts/spike-table"
import { PageHeader } from "@/components/portal/page-header"
import { HeldBackNotice } from "@/components/portal/trial-notice"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Spikes" }

export default async function SpikesPage() {
  const viewer = await requireActiveMember("/members/alerts/spikes")
  const [all, cutoff] = await Promise.all([listSpikeLists(20), postsCutoff(viewer)])
  const lists = all.filter((l) => isOpen(cutoff, l.postedAt))
  const held = all.length - lists.length

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Spikes: sudden candles from big institutional orders, often on the open or the close. The stock often trades back to the spike price within a few days."
      />
      <AlertsTabs current="spikes" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {held > 0 && <HeldBackNotice>{plural(held, "newer spike list")} for members</HeldBackNotice>}
          {lists.length === 0
            ? held === 0 && (
                <Empty className="border border-dashed py-16">
                  <EmptyHeader>
                    <EmptyTitle>No spikes yet</EmptyTitle>
                    <EmptyDescription>When HG posts a spike list, it shows up here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            : lists.map((list) => (
                <section key={list.id} id={`spikes-${list.id}`} className="flex scroll-mt-20 flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-medium">{formatWeekdayDate(list.date)}</h2>
                    <p className="text-sm text-muted-foreground">
                      {list.title === defaultSpikeTitle(list.date) ? "Posted" : `${list.title} · posted`}{" "}
                      {formatMomentET(list.postedAt)} ET
                    </p>
                  </div>
                  <SpikeTable spikes={list.spikes} listDate={list.date} />
                </section>
              ))}
        </div>
        <Card className="xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle>How to study a spike</CardTitle>
            <CardDescription>
              Tap a stock for its 5-day chart in 5-minute candles with VWAP and the EMA, then work through HG&apos;s
              steps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm marker:text-muted-foreground">
              {SPIKE_STUDY_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">
              A spike does not change the strike targets. HG notes it so you can see the price action.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
