import type { Metadata } from "next"
import { LuPlugZap } from "react-icons/lu"
import { addDays, isIsoDate, mondayOf, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatDate, formatDateTimeET } from "@/core/format"
import { lastCompleteWeek, tradingDayOnOrBefore } from "@/core/holidays"
import { describePeriodRange } from "@/core/membership/quarters"
import { MARKET_SYNC_DOC } from "@/server/market/jobs"
import { COLLECTIONS, jobRunSchema, parseDoc, type JobRun } from "@/server/model"
import { requireEditor } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { getWeek, listTickers, listWeeks } from "@/lib/data/tools"
import { adminDb } from "@/lib/firebase/admin"
import { IndexValuesForm, MarketSyncButton } from "@/components/admin/market-forms"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { RelativeTime } from "@/components/shared/relative-time"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Market data" }

interface SyncState {
  status: "pending" | "running" | "done" | "failed"
  message: string | null
  requestedAt: Date | null
  finishedAt: Date | null
}

async function syncState(): Promise<SyncState | null> {
  const snap = await adminDb().collection(COLLECTIONS.config).doc(MARKET_SYNC_DOC).get()
  if (!snap.exists) return null
  const at = (field: string) => (snap.get(field) as { toDate(): Date } | null | undefined)?.toDate() ?? null
  return {
    status: snap.get("status") as SyncState["status"],
    message: (snap.get("message") as string | null | undefined) ?? null,
    requestedAt: at("requestedAt"),
    finishedAt: at("finishedAt"),
  }
}

export default async function AdminMarketDataPage({ searchParams }: PageProps<"/admin/market-data">) {
  await requireEditor({ next: "/admin/market-data" })
  const requested = (await searchParams).week
  const today = todayInMarketZone()
  const weekStart =
    typeof requested === "string" && isIsoDate(requested)
      ? mondayOf(requested)
      : lastCompleteWeek(tradingDayOnOrBefore(today)).start
  const [weeks, current, tickers, sync, runsSnap] = await Promise.all([
    listWeeks(),
    getWeek(weekStart),
    listTickers(),
    syncState(),
    adminDb().collection(COLLECTIONS.jobRuns).orderBy("startedAt", "desc").limit(15).get(),
  ])
  const docs = await Promise.all(weeks.slice(0, 12).map((w) => getWeek(w.weekStart)))
  const runs = runsSnap.docs.map((d) => parseDoc(jobRunSchema, d.id, d.data())).filter((r): r is JobRun => r !== null)
  const pricesThrough = tickers
    .filter((t) => t.active && t.kind === "stock")
    .map((t) => t.metrics?.asOf)
    .filter((d): d is IsoDate => d !== undefined)
    .sort()
    .at(-1)
  const newestWeek = docs.find((w) => w && Object.keys(w.rows).length > 0)
  const running = sync?.status === "pending" || sync?.status === "running"
  const connected = integrations.marketData

  return (
    <>
      <PageHeader
        title="Market data"
        description="Prices, medians, channel lines and Key Market Data, updated after every close."
      />
      {!connected && (
        <Alert>
          <LuPlugZap />
          <AlertTitle>No market data provider is connected</AlertTitle>
          <AlertDescription>
            Prices stay at the last close they have, and the weekly index values are typed in below. Once the market
            data key is added, everything updates by itself after each close, and missed days and weeks are filled in.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Up to date?</CardTitle>
          <CardDescription>
            {connected ? "Updates by itself at 6:30 PM ET on market days." : "Updates stop until a key is added."}
          </CardDescription>
          <CardAction>
            <ToneBadge tone={connected ? "positive" : "muted"}>{connected ? "Connected" : "Not connected"}</ToneBadge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-muted-foreground">Prices, medians and channel lines</dt>
              <dd className="text-sm font-medium">
                {pricesThrough ? `From the ${formatDate(pricesThrough)} close` : "No prices yet"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-muted-foreground">Key Market Data</dt>
              <dd className="text-sm font-medium">
                {newestWeek
                  ? `Week of ${describePeriodRange(newestWeek.weekStart, newestWeek.weekEnd)}`
                  : "No weeks yet"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col items-start gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" role="status">
              {sync === null ? (
                "Not updated by hand yet."
              ) : running ? (
                "Updating now. This page refreshes when it is done."
              ) : sync.status === "failed" ? (
                <span className="text-destructive">Last update failed: {sync.message}</span>
              ) : (
                <>
                  Updated {sync.finishedAt && <RelativeTime iso={sync.finishedAt.toISOString()} />}
                  {sync.message ? `. ${sync.message}` : ""}
                </>
              )}
            </p>
            <MarketSyncButton running={running} connected={connected} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Weekly index close</CardTitle>
          <CardDescription>
            Week of {describePeriodRange(weekStart, addDays(weekStart, 4))}. Members see these on Key Market Data and
            the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IndexValuesForm
            key={weekStart}
            weekStart={weekStart}
            initial={current?.indices ?? {}}
            connected={connected}
          />
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weeks on file</CardTitle>
          </CardHeader>
          <CardContent>
            {weeks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weeks yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-0">Week</TableHead>
                    <TableHead className="text-right">Stocks</TableHead>
                    <TableHead className="text-right">Indexes</TableHead>
                    <TableHead className="pr-0 text-right">From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((w) =>
                    w ? (
                      <TableRow key={w.weekStart} className="hover:bg-transparent">
                        <TableCell className="px-0">{describePeriodRange(w.weekStart, w.weekEnd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Object.keys(w.rows).length}</TableCell>
                        <TableCell className="text-right tabular-nums">{Object.keys(w.indices).length}/3</TableCell>
                        <TableCell className="pr-0 text-right text-sm text-muted-foreground">
                          {w.source === "provider" ? "Market data" : w.source === "import" ? "HG's sheet" : "Typed in"}
                        </TableCell>
                      </TableRow>
                    ) : null,
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Job runs</CardTitle>
            <CardDescription>The latest 15</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No job has run yet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[13px]">{r.job}</span>
                      <ToneBadge
                        tone={r.status === "succeeded" ? "positive" : r.status === "failed" ? "negative" : "muted"}
                      >
                        {r.status}
                      </ToneBadge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeET(r.startedAt)}
                      {r.detail ? ` · ${r.detail}` : ""}
                    </span>
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
