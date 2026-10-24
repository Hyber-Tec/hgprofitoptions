import type { Metadata } from "next"
import { todayInMarketZone } from "@/core/dates"
import { formatDateTimeET, plural } from "@/core/format"
import { isTradingDay } from "@/core/holidays"
import { defaultSpikeDate } from "@/core/spikes"
import { requireEditor } from "@/lib/auth/guards"
import { listSpikeLists } from "@/lib/data/spikes"
import { DeleteSpikeListButton, SpikeListComposer, SpikeRowActions } from "@/components/admin/spike-forms"
import { SpikeTable } from "@/components/portal/alerts/spike-table"
import { PageHeader } from "@/components/portal/page-header"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Spikes" }

export default async function AdminSpikesPage() {
  await requireEditor({ next: "/admin/spikes" })
  const lists = await listSpikeLists(15)
  return (
    <>
      <PageHeader
        title="Spikes"
        description="Note the spikes from big institutional orders, without changing the strike targets. Members see the list in Alerts and a line on each stock's chart until the price is reached again."
      />
      <Card>
        <CardHeader>
          <CardTitle>Post spikes</CardTitle>
        </CardHeader>
        <CardContent>
          <SpikeListComposer defaultDate={defaultSpikeDate(todayInMarketZone(), isTradingDay)} />
        </CardContent>
      </Card>
      {lists.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No spikes posted yet.</p>
          </CardContent>
        </Card>
      ) : (
        lists.map((list) => (
          <Card key={list.id}>
            <CardHeader>
              <CardTitle>{list.title}</CardTitle>
              <CardDescription>
                Posted {formatDateTimeET(list.postedAt)} · {plural(list.spikes.length, "stock")}
                {list.notify ? "" : " · members were not notified"}
              </CardDescription>
              <CardAction>
                <DeleteSpikeListButton id={list.id} title={list.title} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <SpikeTable
                spikes={list.spikes}
                listDate={list.date}
                linkStocks={false}
                actions={(spike) => <SpikeRowActions spike={spike} />}
              />
            </CardContent>
          </Card>
        ))
      )}
    </>
  )
}
