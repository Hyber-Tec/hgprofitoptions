import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth/guards"
import { listTickers } from "@/lib/data/tools"
import { TickersManager } from "@/components/admin/tickers-manager"
import { PageHeader } from "@/components/portal/page-header"

export const metadata: Metadata = { title: "Tickers" }

export default async function AdminTickersPage() {
  await requireAdmin({ next: "/admin/tickers" })
  const tickers = await listTickers()
  return (
    <>
      <PageHeader
        title="Tickers"
        description="The ticker universe behind every tool: channel sizes, BOC, FS and SS levels, earnings windows and notes."
      />
      <TickersManager
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
          notes: t.notes,
          lastClose: t.metrics?.lastClose ?? null,
          asOf: t.metrics?.asOf ?? null,
        }))}
      />
    </>
  )
}
