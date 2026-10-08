import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { LuArrowRight, LuCalendarPlus, LuFileText, LuLink2, LuPresentation, LuVideo } from "react-icons/lu"
import { SiWhatsapp, SiZoom } from "react-icons/si"
import { addDays, daysBetween, todayInMarketZone } from "@/core/dates"
import type { IsoDate } from "@/core/domain/types"
import { formatDate, formatLevel, formatPercent, formatShortDate } from "@/core/format"
import { describePeriodRange, quarterOf } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import { diffTargets } from "@/core/parsers/strike-targets"
import { formatDayIn, formatTimeIn, nextOccurrence, zoneAbbreviation } from "@/core/schedule"
import type { Viewer } from "@/lib/auth/guards"
import { listFeedAlerts, readReceipts } from "@/lib/data/alerts"
import { listPresentations, listResources } from "@/lib/data/content"
import { listTrades } from "@/lib/data/journal"
import { getSiteSettings } from "@/lib/data/public"
import { getMemberSettings } from "@/lib/data/settings"
import {
  getStanding,
  getTargetGroups,
  getTargetUpdate,
  latestTargetUpdate,
  listTickers,
  resolveWeek,
} from "@/lib/data/tools"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"
import { AlertCard, toAlertView } from "../alerts/alert-card"
import { Signed, Stat, ToneBadge, type Tone } from "../display"
import { Sparkline } from "../sparkline"

function ViewAll({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <ButtonLink variant="ghost" size="sm" className="-mr-2 text-muted-foreground" href={href}>
      {children}
      <LuArrowRight />
    </ButtonLink>
  )
}

// ---- Membership -----------------------------------------------------------------------------

const SUMMARY_TONE: Record<ReturnType<typeof membershipSummary>["tone"], Tone> = {
  positive: "positive",
  warning: "warning",
  muted: "muted",
  negative: "negative",
}

export function MembershipCard({ viewer, bookingHref }: { viewer: Viewer; bookingHref: string }) {
  const summary = membershipSummary(viewer.status)
  const status = viewer.status
  let range: string | null = null
  let progress: number | null = null
  if (status.kind === "active") {
    const from = viewer.member.access?.fromDate ?? status.period.start
    range = describePeriodRange(from, status.coverageEnd)
    const total = Math.max(1, daysBetween(from, status.coverageEnd) + 1)
    progress = Math.min(100, Math.max(0, Math.round(((total - status.daysLeft) / total) * 100)))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership</CardTitle>
        <CardAction>
          <ToneBadge tone={SUMMARY_TONE[summary.tone]}>{summary.status}</ToneBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{summary.label}</p>
          <p className="text-sm text-muted-foreground">{range ?? summary.detail}</p>
        </div>
        {progress !== null && <Progress value={progress} aria-label="Time used in your membership" />}
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {viewer.member.memberSince
              ? `Member since ${formatDate(viewer.member.memberSince)}`
              : viewer.role === "admin"
                ? "Admin account"
                : ""}
          </span>
          {status.kind === "active" && <span className="font-medium text-foreground">{summary.detail}</span>}
        </div>
        {status.kind === "active" && status.expiringSoon && (
          <Alert>
            <AlertTitle>Your membership ends {formatDate(status.coverageEnd)}</AlertTitle>
            <AlertDescription>
              Book a quick call with HG to renew for the next quarter.
              <ButtonAnchor size="sm" className="mt-2" href={bookingHref}>
                Book a call
              </ButtonAnchor>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Alerts ---------------------------------------------------------------------------------

export async function LatestAlertsCard({ viewer }: { viewer: Viewer }) {
  const alerts = await listFeedAlerts({ limit: 3, window: 3 })
  const receipts = await readReceipts(
    viewer.uid,
    alerts.map((a) => a.id),
  )
  const since = viewer.member.createdAt.getTime()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest alerts</CardTitle>
        <CardDescription>HG&apos;s buy and sell points</CardDescription>
        <CardAction>
          <ViewAll href="/members/alerts">View all</ViewAll>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {alerts.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>No alerts yet</EmptyTitle>
              <EmptyDescription>New alerts appear here the moment HG posts them.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={toAlertView(a)}
              unread={(a.publishedAt?.getTime() ?? 0) > since && !receipts.has(a.id)}
              compact
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

// ---- My performance -------------------------------------------------------------------------

export async function PerformanceCard({ viewer }: { viewer: Viewer }) {
  const open = await listTrades(viewer.uid, { status: "open" })
  const stats = viewer.member.stats
  const linked = viewer.member.brokerage.linked
  const hasData = linked || (stats !== null && stats.tradesQtd > 0) || open.length > 0
  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My performance</CardTitle>
          <CardDescription>Link your brokerage to see your returns, trades and journal stats here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ButtonLink href="/members/portfolio">
            <LuLink2 />
            Connect your brokerage
          </ButtonLink>
          <ButtonLink variant="outline" href="/members/journal">
            Add trades manually
          </ButtonLink>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>My performance</CardTitle>
        <CardDescription>
          This quarter{stats?.computedAt ? ` · updated ${formatShortDate(todayInMarketZone(stats.computedAt))}` : ""}
        </CardDescription>
        <CardAction>
          <ViewAll href="/members/portfolio">Portfolio</ViewAll>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat
          label="Return (time-weighted)"
          value={<Signed value={stats?.qtdReturn ?? null} />}
          hint={linked ? "Linked accounts" : "Link a brokerage for returns"}
        />
        <Stat
          label="Realized P&L"
          value={<Signed value={stats?.realizedQtd ?? null} as="money" />}
          hint={`${stats?.tradesQtd ?? 0} closed trades`}
        />
        <Stat
          label="Win rate"
          value={stats?.winRateQtd == null ? "-" : formatPercent(stats.winRateQtd, { signed: false, digits: 0 })}
        />
        <Stat
          label="Open positions"
          value={open.length}
          hint={
            open.length > 0
              ? open
                  .slice(0, 3)
                  .map((t) => t.symbol)
                  .join(", ")
              : undefined
          }
        />
      </CardContent>
    </Card>
  )
}

// ---- HG standing ----------------------------------------------------------------------------

export async function StandingCard() {
  const standing = await getStanding()
  const curve = standing?.hgPortfolio?.curve.slice(-90).map((p) => p.index) ?? []
  const record = standing?.alertsTrackRecord
  const { year, q } = quarterOf(todayInMarketZone())
  const quarterMonths = [0, 1, 2].map((i) => `${year}-${String((q - 1) * 3 + 1 + i).padStart(2, "0")}`)
  const closedThisQuarter =
    record?.byMonth.filter((m) => quarterMonths.includes(m.month)).reduce((s, m) => s + m.closed, 0) ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>HG standing</CardTitle>
        <CardDescription>HG&apos;s portfolio and alerts track record</CardDescription>
        <CardAction>
          <ViewAll href="/members/standing">Details</ViewAll>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5">
        <div className="col-span-2 flex items-end justify-between gap-4">
          <Stat
            label="HG portfolio this quarter"
            value={<Signed value={standing?.hgPortfolio?.returns.qtd ?? null} />}
            hint={
              standing?.hgPortfolio
                ? `Year to date ${formatPercent(standing.hgPortfolio.returns.ytd)}`
                : "Not shared yet"
            }
          />
          <Sparkline values={curve} label="HG portfolio growth over the last 90 days" className="h-10 w-32" />
        </div>
        <Stat
          label="Alert win rate"
          value={record?.winRate == null ? "-" : formatPercent(record.winRate, { signed: false, digits: 0 })}
          hint={`${record?.closed ?? 0} closed alerts`}
        />
        <Stat
          label="Average result"
          value={<Signed value={record?.averageReturn ?? null} digits={1} />}
          hint={`${closedThisQuarter} closed this quarter`}
        />
      </CardContent>
    </Card>
  )
}

// ---- Strike Price Targets ---------------------------------------------------------------------

export async function TargetsCard() {
  const [latest, groups] = await Promise.all([latestTargetUpdate(), getTargetGroups()])
  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strike Price Targets</CardTitle>
          <CardDescription>The weekly targets appear here once HG publishes them.</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const withPrevious = await getTargetUpdate(latest.effectiveDate)
  const diff = withPrevious?.previous ? diffTargets(withPrevious.previous.entries, latest.entries) : null
  const changes = diff ? diff.added.length + diff.removed.length + diff.changed.length : null
  const counts = groups
    .map((g) => ({ ...g, count: latest.entries.filter((e) => e.group === g.slug).length }))
    .filter((g) => g.count > 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Strike Price Targets</CardTitle>
        <CardDescription>
          Updated {formatDate(latest.effectiveDate)} · {latest.entries.length} tickers
          {changes !== null && ` · ${changes} ${changes === 1 ? "change" : "changes"} since the last update`}
        </CardDescription>
        <CardAction>
          <ViewAll href="/members/targets">Open</ViewAll>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {counts.map((g) => (
          <Link
            key={g.slug}
            href={`/members/targets?group=${g.slug}`}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {g.shortName}
            <span className="text-muted-foreground tabular-nums">{g.count}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

// ---- Market pulse and movers ------------------------------------------------------------------

const INDEX_NAMES: Record<string, string> = { DJI: "Dow Jones", SPX: "S&P 500", IXIC: "Nasdaq" }

export async function MarketPulseCard() {
  const { week } = await resolveWeek(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market pulse</CardTitle>
        <CardDescription>
          {week
            ? `Week of ${formatShortDate(week.weekStart)} to ${formatShortDate(week.weekEnd)}`
            : "No weekly data yet"}
        </CardDescription>
        <CardAction>
          <ViewAll href="/members/market-data">Data</ViewAll>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {Object.keys(INDEX_NAMES).map((symbol) => {
          const row = week?.indices[symbol]
          const change = row ? (row.close - row.pfcp) / row.pfcp : null
          return (
            <div key={symbol} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{INDEX_NAMES[symbol]}</p>
                <p className="font-mono text-xs text-muted-foreground">{symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">{row ? formatLevel(row.close) : "-"}</p>
                <Signed value={change} className="text-xs" />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function MoverList({ items }: { items: { symbol: string; svi: number }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((m) => (
        <li key={m.symbol} className="flex items-center justify-between gap-2 text-sm">
          <Link
            href={`/members/stocks/${m.symbol}`}
            className="rounded-sm font-mono font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {m.symbol}
          </Link>
          <Signed value={m.svi} digits={1} />
        </li>
      ))}
    </ul>
  )
}

export async function MoversCard() {
  const { week } = await resolveWeek(null)
  const rows = Object.entries(week?.rows ?? {}).map(([symbol, r]) => ({ symbol, svi: r.svi }))
  const up = [...rows].sort((a, b) => b.svi - a.svi).slice(0, 5)
  const down = [...rows].sort((a, b) => a.svi - b.svi).slice(0, 5)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top movers</CardTitle>
        <CardDescription>By SVI, last completed week</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-6">
        {rows.length === 0 ? (
          <p className="col-span-2 text-sm text-muted-foreground">No weekly data yet.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Up</p>
              <MoverList items={up} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Down</p>
              <MoverList items={down} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Earnings ---------------------------------------------------------------------------------

export async function EarningsCard() {
  const today = todayInMarketZone()
  const horizon = addDays(today, 14)
  const upcoming = (await listTickers())
    .filter((t) => t.earningsStart && t.earningsEnd && t.earningsEnd >= today && t.earningsStart <= horizon)
    .sort((a, b) => (a.earningsStart ?? "").localeCompare(b.earningsStart ?? ""))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming earnings</CardTitle>
        <CardDescription>Next 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No earnings windows in the next 14 days.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.slice(0, 8).map((t) => {
              const start = t.earningsStart as IsoDate
              const days = daysBetween(today, start)
              return (
                <li key={t.symbol} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`/members/stocks/${t.symbol}`}
                    className="rounded-sm font-mono font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {t.symbol}
                  </Link>
                  <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                    {formatShortDate(start)}
                    {t.earningsEnd !== t.earningsStart && ` to ${formatShortDate(t.earningsEnd as IsoDate)}`}
                    <ToneBadge tone={days <= 7 ? "warning" : "muted"}>{days <= 0 ? "Now" : `${days} d`}</ToneBadge>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Classroom --------------------------------------------------------------------------------

export async function ClassroomCard({ timezone }: { timezone: string }) {
  const [site, settings] = await Promise.all([getSiteSettings(), getMemberSettings()])
  const sessions = site.classSchedule.map((s) => ({ ...s, next: nextOccurrence(s) }))
  const localDiffers = timezone !== "America/New_York"
  return (
    <Card>
      <CardHeader>
        <CardTitle>Classroom</CardTitle>
        <CardDescription>Live on Zoom every week</CardDescription>
        <CardAction>
          <ViewAll href="/members/classroom">Schedule</ViewAll>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sessions.map((s) => (
          <div key={`${s.day}-${s.start}`} className="flex flex-col gap-0.5 rounded-lg border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{s.title}</p>
              <span className="text-xs text-muted-foreground">{formatDayIn(s.next.start, "America/New_York")}</span>
            </div>
            <p className="text-sm tabular-nums">
              {formatTimeIn(s.next.start, "America/New_York")} to {formatTimeIn(s.next.end, "America/New_York")} ET
            </p>
            {localDiffers && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {formatTimeIn(s.next.start, timezone)} to {formatTimeIn(s.next.end, timezone)}{" "}
                {zoneAbbreviation(s.next.start, timezone)} (your time)
              </p>
            )}
            <p className="text-xs text-muted-foreground">{s.audience}</p>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
        {settings.zoomUrl && (
          <ButtonAnchor size="sm" href={settings.zoomUrl} target="_blank" rel="noopener noreferrer">
            <SiZoom />
            Join Zoom
          </ButtonAnchor>
        )}
        {settings.whatsappUrl && (
          <ButtonAnchor
            size="sm"
            variant="outline"
            href={settings.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <SiWhatsapp />
            WhatsApp group
          </ButtonAnchor>
        )}
        <ButtonAnchor size="sm" variant="outline" href="/members/classroom/calendar.ics">
          <LuCalendarPlus />
          Add to calendar
        </ButtonAnchor>
      </CardFooter>
    </Card>
  )
}

// ---- Recent presentations and files ---------------------------------------------------------

export async function RecentContentCard() {
  const [presentations, files] = await Promise.all([listPresentations({ limit: 2 }), listResources()])
  const recentFiles = [...files].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 2)
  if (presentations.length === 0 && recentFiles.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently added</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {presentations.map((p) => (
          <Link
            key={p.id}
            href="/members/presentations"
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
              {p.videoUrl ? <LuVideo className="size-4" /> : <LuPresentation className="size-4" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{p.title}</span>
              <span className="block text-xs text-muted-foreground">Class of {formatDate(p.sessionDate)}</span>
            </span>
          </Link>
        ))}
        {recentFiles.map((f) => (
          <Link
            key={f.id}
            href="/members/files"
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
              <LuFileText className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{f.title}</span>
              <span className="block text-xs text-muted-foreground">{f.folder}</span>
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
