import type { Metadata } from "next"
import Link from "next/link"
import { LuInfo } from "react-icons/lu"
import { formatDateTimeET, formatLevel, formatMomentET, formatShortDate, formatSigned } from "@/core/format"
import { describePeriodRange } from "@/core/membership/quarters"
import { requireActiveMember } from "@/lib/auth/guards"
import { resolveWeek } from "@/lib/data/tools"
import { marketDataView, type WeekRow } from "@/lib/tools/market-data"
import { Signed } from "@/components/portal/display"
import { AsOf, PageHeader } from "@/components/portal/page-header"
import { Sparkline } from "@/components/portal/sparkline"
import { MarketDataTable } from "@/components/portal/tools/market-data-table"
import { WeekPicker } from "@/components/portal/tools/week-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

export const metadata: Metadata = { title: "Key Market Data" }

function Definitions() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <LuInfo />
        Definitions
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>How the numbers are calculated</PopoverTitle>
        </PopoverHeader>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="font-medium">PFCP</dt>
            <dd className="text-muted-foreground">
              Previous Friday close: the official 4 PM close of the last session before the week started.
            </dd>
          </div>
          <div>
            <dt className="font-medium">High, Low and Close</dt>
            <dd className="text-muted-foreground">
              The week&apos;s highest and lowest prices in regular trading hours (9:30 AM to 4 PM ET), and Friday&apos;s
              official 4 PM close. Pre-market and after-hours trades are left out.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Gap</dt>
            <dd className="text-muted-foreground">
              This Friday&apos;s close minus the PFCP: how much the week gained or lost, as HG posts it for the indexes.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Range</dt>
            <dd className="text-muted-foreground">
              The week&apos;s high minus its low: how far the price travelled, not where it ended. It gets a minus sign
              when the week closed below the PFCP, as in HG&apos;s sheet.
            </dd>
          </div>
          <div>
            <dt className="font-medium">SVI</dt>
            <dd className="text-muted-foreground">
              Range divided by the close: how far the stock travelled this week, relative to its price.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Green and red</dt>
            <dd className="text-muted-foreground">The week closed above (green) or below (red) the PFCP.</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  )
}

function MoverList({ title, rows, value }: { title: string; rows: WeekRow[]; value: (r: WeekRow) => number | null }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={r.symbol} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <Link
                  href={`/members/stocks/${r.symbol}`}
                  className="rounded-sm font-mono font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {r.symbol}
                </Link>
              </span>
              <Signed value={value(r)} digits={1} />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export default async function MarketDataPage({ searchParams }: PageProps<"/members/market-data">) {
  await requireActiveMember("/members/market-data")
  const requested = (await searchParams).week
  const { week, previous, weeks } = await resolveWeek(typeof requested === "string" ? requested : null)
  if (!week) {
    return (
      <>
        <PageHeader title="Key Market Data" />
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No weekly data yet</EmptyTitle>
            <EmptyDescription>Key Market Data is generated after each trading week closes.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    )
  }
  const view = await marketDataView(week, previous)
  const options = weeks.map((w) => ({ value: w.weekStart, label: describePeriodRange(w.weekStart, w.weekEnd) }))
  const up = [...view.rows].sort((a, b) => b.svi - a.svi).slice(0, 5)
  const down = [...view.rows].sort((a, b) => a.svi - b.svi).slice(0, 5)
  const changes = view.rows
    .filter((r) => r.previousSvi !== null)
    .sort((a, b) => Math.abs(b.svi - (b.previousSvi ?? 0)) - Math.abs(a.svi - (a.previousSvi ?? 0)))
    .slice(0, 5)

  return (
    <>
      <PageHeader
        title="Key Market Data"
        description="Weekly high, low, close, range and SVI for every ticker, generated after each trading week."
        meta={
          <>
            <AsOf>Week of {describePeriodRange(view.weekStart, view.weekEnd)}</AsOf>
            <span>
              {week.source === "provider"
                ? "From market data"
                : week.source === "import"
                  ? "From HG's sheet"
                  : "Entered by HG"}{" "}
              · updated {formatDateTimeET(week.computedAt)}
            </span>
          </>
        }
        actions={
          <>
            <WeekPicker options={options} current={view.weekStart} />
            <Definitions />
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {view.indices.map((index) => (
          <Card key={index.symbol} size="sm">
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-2">
                {index.name}
                <span className="font-mono text-xs font-normal text-muted-foreground">{index.symbol}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatLevel(index.close)}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="text-muted-foreground">Gap vs last Friday</span>
                    <Signed value={index.gap} as="number" />
                    <Signed value={index.gapPct} className="text-xs" icon={false} />
                  </span>
                </div>
                <Sparkline values={index.history} label={`${index.name} weekly closes`} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-3 text-sm">
                <dt className="text-muted-foreground">Week high</dt>
                <dd className="tabular-nums">
                  {formatLevel(index.high)}
                  {index.highAt && (
                    <span className="block text-xs text-muted-foreground">{formatMomentET(index.highAt)}</span>
                  )}
                </dd>
                <dt className="text-muted-foreground">Week low</dt>
                <dd className="tabular-nums">
                  {formatLevel(index.low)}
                  {index.lowAt && (
                    <span className="block text-xs text-muted-foreground">{formatMomentET(index.lowAt)}</span>
                  )}
                </dd>
              </dl>
              <p className="text-xs text-muted-foreground tabular-nums">
                Range {formatSigned(index.range)} · SVI <Signed value={index.svi} icon={false} className="text-xs" />
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MoverList title="Top 5 up by SVI" rows={up} value={(r) => r.svi} />
        <MoverList title="Top 5 down by SVI" rows={down} value={(r) => r.svi} />
        {changes.length > 0 ? (
          <MoverList
            title={`Biggest SVI change vs ${previous ? formatShortDate(previous.weekStart) : "last week"}`}
            rows={changes}
            value={(r) => r.svi - (r.previousSvi ?? 0)}
          />
        ) : (
          <Card size="sm">
            <CardHeader>
              <CardTitle>SVI change vs last week</CardTitle>
              <CardDescription>Appears once two weeks of data are available.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
      <MarketDataTable rows={view.rows} groups={view.groups} />
    </>
  )
}
