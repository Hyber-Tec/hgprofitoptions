import type { Metadata } from "next"
import { LuPlugZap } from "react-icons/lu"
import { addDays, isIsoDate, lastCompletedWeek, mondayOf, todayInMarketZone } from "@/core/dates"
import { formatDateTimeET } from "@/core/format"
import { describePeriodRange } from "@/core/membership/quarters"
import { COLLECTIONS, jobRunSchema, parseDoc, type JobRun } from "@/server/model"
import { requireAdmin } from "@/lib/auth/guards"
import { integrations } from "@/lib/env.server"
import { getWeek, listWeeks } from "@/lib/data/tools"
import { adminDb } from "@/lib/firebase/admin"
import { IndexValuesForm } from "@/components/admin/market-forms"
import { ToneBadge } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Market data" }

export default async function AdminMarketDataPage({ searchParams }: PageProps<"/admin/market-data">) {
  await requireAdmin({ next: "/admin/market-data" })
  const requested = (await searchParams).week
  const weekStart =
    typeof requested === "string" && isIsoDate(requested)
      ? mondayOf(requested)
      : lastCompletedWeek(todayInMarketZone()).start
  const weeks = await listWeeks()
  const current = await getWeek(weekStart)
  const docs = await Promise.all(weeks.slice(0, 12).map((w) => getWeek(w.weekStart)))
  const runsSnap = await adminDb().collection(COLLECTIONS.jobRuns).orderBy("startedAt", "desc").limit(25).get()
  const runs = runsSnap.docs.map((d) => parseDoc(jobRunSchema, d.id, d.data())).filter((r): r is JobRun => r !== null)
  return (
    <>
      <PageHeader title="Market data" description="Weekly Key Market Data, index values and the scheduled data jobs." />
      {!integrations.marketData && (
        <Alert>
          <LuPlugZap />
          <AlertTitle>No market data provider is connected</AlertTitle>
          <AlertDescription>
            Prices come from the imported spreadsheets and anything entered here. Once a provider key is added, daily
            prices, medians and each week&apos;s Key Market Data are generated automatically after the close.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Index values</CardTitle>
            <CardDescription>
              Week of {describePeriodRange(weekStart, addDays(weekStart, 4))}.{" "}
              {current && Object.keys(current.indices).length > 0
                ? "Saved values are shown; saving replaces them."
                : "Nothing entered for this week yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IndexValuesForm key={weekStart} weekStart={weekStart} initial={current?.indices ?? {}} />
          </CardContent>
        </Card>
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
                    <TableHead className="text-right">Indices</TableHead>
                    <TableHead className="pr-0 text-right">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((w) =>
                    w ? (
                      <TableRow key={w.weekStart} className="hover:bg-transparent">
                        <TableCell className="px-0">{describePeriodRange(w.weekStart, w.weekEnd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Object.keys(w.rows).length}</TableCell>
                        <TableCell className="text-right tabular-nums">{Object.keys(w.indices).length}/3</TableCell>
                        <TableCell className="pr-0 text-right text-sm text-muted-foreground capitalize">
                          {w.source}
                        </TableCell>
                      </TableRow>
                    ) : null,
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Job runs</CardTitle>
          <CardDescription>The latest 25</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No job has run yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-0">Job</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="px-0">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className="hover:bg-transparent">
                    <TableCell className="px-0 font-mono text-[13px]">{r.job}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTimeET(r.startedAt)}
                    </TableCell>
                    <TableCell>
                      <ToneBadge
                        tone={r.status === "succeeded" ? "positive" : r.status === "failed" ? "negative" : "muted"}
                      >
                        {r.status}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="max-w-96 truncate px-0 text-xs text-muted-foreground">
                      {r.detail ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
