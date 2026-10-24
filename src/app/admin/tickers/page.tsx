import type { Metadata } from "next"
import { requireEditor } from "@/lib/auth/guards"
import { listTickers } from "@/lib/data/tools"
import { integrations } from "@/lib/env.server"
import { TickersManager } from "@/components/admin/tickers-manager"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Tickers" }

export default async function AdminTickersPage() {
  await requireEditor({ next: "/admin/tickers" })
  const tickers = await listTickers()
  return (
    <>
      <PageHeader
        title="Tickers"
        description="The stocks behind every tool. Add one with just its symbol; set its channel, BOC, FS and SS levels, earnings and notes here."
      />
      <TickersManager
        marketData={integrations.marketData}
        rows={tickers.map((t) => ({
          symbol: t.symbol,
          name: t.name,
          kind: t.kind,
          active: t.active,
          channelSize: t.channelSize,
          bocSize: t.bocSize,
          fsLevels: t.fsLevels,
          ssLevels: t.ssLevels,
          earningsStart: t.earningsStart,
          earningsEnd: t.earningsEnd,
          earningsTiming: t.earningsTiming,
          notes: t.notes,
          lastClose: t.metrics?.lastClose ?? null,
          asOf: t.metrics?.asOf ?? null,
        }))}
      />
    </>
  )
}
