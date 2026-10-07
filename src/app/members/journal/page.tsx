import type { Metadata } from "next"
import Link from "next/link"
import { LuDownload, LuPlus, LuUpload } from "react-icons/lu"
import { alertInstrument } from "@/core/alerts"
import { todayInMarketZone } from "@/core/dates"
import { formatInstrument } from "@/core/format"
import { requireViewer } from "@/lib/auth/guards"
import { listJournalDays, listTrades } from "@/lib/data/journal"
import { DailyNotes } from "@/components/portal/journal/daily-notes"
import { JournalStatsView, PnlHeatmap } from "@/components/portal/journal/journal-stats"
import { TradesTable, type TradeRow } from "@/components/portal/journal/trades-table"
import { PageHeader } from "@/components/portal/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Journal" }

const VIEWS = [
  { value: "trades", label: "Trades" },
  { value: "stats", label: "Stats" },
  { value: "calendar", label: "Calendar" },
  { value: "notes", label: "Daily notes" },
] as const

export default async function JournalPage({ searchParams }: PageProps<"/members/journal">) {
  const viewer = await requireViewer("/members/journal")
  const requested = (await searchParams).view
  const view = VIEWS.find((v) => v.value === requested)?.value ?? "trades"
  const editable = viewer.hasAccess
  const [trades, days] = await Promise.all([
    listTrades(viewer.uid),
    view === "notes" ? listJournalDays(viewer.uid) : Promise.resolve([]),
  ])
  const rows: TradeRow[] = trades.map((t) => {
    const instrument = alertInstrument(t)
    return {
      id: t.id,
      label: instrument ? formatInstrument(instrument) : t.symbol,
      symbol: t.symbol,
      assetType: t.assetType,
      direction: t.direction,
      status: t.status,
      source: t.source,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      quantity: t.quantity,
      avgEntry: t.avgEntry,
      avgExit: t.avgExit,
      realizedPnl: t.realizedPnl,
      returnPct: t.returnPct,
      tags: t.tags,
      setup: t.setup,
      alertId: t.alertId,
    }
  })

  return (
    <>
      <PageHeader
        title="Trading journal"
        description={
          viewer.member.brokerage.linked
            ? "Trades are built from your brokerage fills. Add your setup, thesis and lessons to each one."
            : "Add trades by hand or import a CSV, then journal your setup, thesis and lessons."
        }
        actions={
          <>
            {editable && (
              <>
                <Button size="sm" render={<Link href="/members/journal/new" />} nativeButton={false}>
                  <LuPlus />
                  Add trade
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/members/journal/import" />}
                  nativeButton={false}
                >
                  <LuUpload />
                  Import CSV
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" render={<a href="/members/journal/export.csv" />} nativeButton={false}>
              <LuDownload />
              Export
            </Button>
          </>
        }
      />
      {!editable && (
        <Alert>
          <AlertDescription>
            Your journal is read-only while your membership is not active. You can still export it.
          </AlertDescription>
        </Alert>
      )}
      <nav aria-label="Journal views" className="flex gap-1 overflow-x-auto border-b">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={v.value === "trades" ? "/members/journal" : `/members/journal?view=${v.value}`}
            aria-current={view === v.value ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              view === v.value
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {view === "trades" && <TradesTable rows={rows} />}
      {view === "stats" && <JournalStatsView trades={trades} />}
      {view === "calendar" && <PnlHeatmap trades={trades} />}
      {view === "notes" && (
        <DailyNotes
          notes={days.map((d) => ({ date: d.date, body: d.body, mood: d.mood }))}
          today={todayInMarketZone()}
          editable={editable}
        />
      )}
    </>
  )
}
