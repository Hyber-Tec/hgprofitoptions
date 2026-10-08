import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { LuArrowUpRight, LuChartCandlestick, LuCrosshair, LuHistory } from "react-icons/lu"
import { alertInstrument } from "@/core/alerts"
import { alertReturn } from "@/core/calc/standing"
import { formatDate, formatDateTimeET, formatExpiry, formatLevel, formatPercent, formatPrice } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getAlert, listAlertRevisions, listFollowUps, readReceipts } from "@/lib/data/alerts"
import { getTicker, latestTargetUpdate } from "@/lib/data/tools"
import { MarkRead, MuteTickerButton, TookTradeButton } from "@/components/portal/alerts/alert-actions"
import { AlertPlan, AlertStatusBadge, toAlertView } from "@/components/portal/alerts/alert-card"
import { AlertKindBadge } from "@/components/portal/alerts/alert-kind-badge"
import { Signed } from "@/components/portal/display"
import { PageHeader } from "@/components/portal/page-header"
import { RelativeTime } from "@/components/shared/relative-time"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ButtonLink } from "@/components/shared/button-link"

export const metadata: Metadata = { title: "Alert" }

export default async function AlertDetailPage({ params, searchParams }: PageProps<"/members/alerts/[id]">) {
  const { id } = await params
  const viewer = await requireActiveMember(`/members/alerts/${id}`)
  const alert = await getAlert(id)
  const visible = alert && (alert.status === "published" || alert.status === "closed" || viewer.role === "admin")
  if (!alert || !visible) notFound()
  if (alert.parentId) redirect(`/members/alerts/${alert.parentId}?f=${alert.id}`)
  const highlight = (await searchParams).f

  const [followUps, revisions, ticker, targets] = await Promise.all([
    listFollowUps(alert.id),
    listAlertRevisions(alert.id),
    alert.symbol ? getTicker(alert.symbol) : Promise.resolve(null),
    latestTargetUpdate(),
  ])
  const receipts = await readReceipts(viewer.uid, [alert.id])
  const view = toAlertView(alert)
  const instrument = alertInstrument(alert)
  const target = alert.symbol ? targets?.entries.find((e) => e.symbol === alert.symbol) : undefined
  const muted = alert.symbol ? viewer.member.prefs.mutedSymbols.includes(alert.symbol) : false
  const entry =
    alert.buyLow !== null && alert.buyHigh !== null
      ? (alert.buyLow + alert.buyHigh) / 2
      : (alert.buyLow ?? alert.buyHigh)
  const liveResult =
    alert.exits.length > 0 && alert.buyLow !== null && alert.buyHigh !== null
      ? alertReturn(alert.buyLow, alert.buyHigh, alert.exits)
      : null
  const visibleFollowUps = followUps.filter(
    (f) => f.status === "published" || f.status === "closed" || viewer.role === "admin",
  )

  return (
    <>
      <MarkRead alertId={alert.id} />
      <PageHeader
        title={<span className={view.instrumentTitle ? "font-mono" : undefined}>{alert.title}</span>}
        meta={
          <>
            <AlertKindBadge kind={alert.kind} />
            <AlertStatusBadge alert={view} />
            {alert.publishedAt && (
              <span>
                Posted {formatDateTimeET(alert.publishedAt)} · <RelativeTime iso={alert.publishedAt.toISOString()} />
              </span>
            )}
            {alert.edited && <span>Edited</span>}
          </>
        }
        actions={
          <>
            {instrument && alert.kind === "buy" && (
              <TookTradeButton
                alertId={alert.id}
                defaultPrice={entry}
                isOption={instrument.assetType === "option"}
                linked={viewer.member.brokerage.linked}
                alreadyTook={receipts.get(alert.id)?.took ?? false}
              />
            )}
            {alert.symbol && <MuteTickerButton symbol={alert.symbol} muted={muted} />}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>HG&apos;s plan</CardTitle>
              {instrument?.assetType === "option" && (
                <CardDescription>Prices are the option premium per contract.</CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AlertPlan alert={view} />
              {alert.body ? <p className="text-sm leading-relaxed whitespace-pre-line">{alert.body}</p> : null}
              {alert.imagePath && (
                // eslint-disable-next-line @next/next/no-img-element -- served by an authenticated route, not the image optimizer
                <img
                  src={`/members/alerts/${alert.id}/image`}
                  alt={`Chart for ${alert.title}`}
                  className="w-full rounded-lg border"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
              <CardDescription>
                {visibleFollowUps.length === 0
                  ? "HG will post sells and updates for this trade here."
                  : `${visibleFollowUps.length} ${visibleFollowUps.length === 1 ? "update" : "updates"}`}
              </CardDescription>
            </CardHeader>
            {visibleFollowUps.length > 0 && (
              <CardContent>
                <ol className="flex flex-col gap-5 border-l pl-6">
                  {visibleFollowUps.map((f) => (
                    <li key={f.id} id={f.id} className="relative scroll-mt-24">
                      <span
                        className="absolute top-1 -left-[calc(1.5rem+6.5px)] size-3 rounded-full border-2 border-card bg-foreground"
                        aria-hidden="true"
                      />
                      <div className={highlight === f.id ? "-m-2 rounded-lg bg-muted/60 p-2" : undefined}>
                        <div className="flex flex-wrap items-center gap-2">
                          <AlertKindBadge kind={f.kind} />
                          {f.kind === "sell" && f.sellPoints[0] !== undefined && (
                            <span className="text-sm font-medium tabular-nums">at {formatPrice(f.sellPoints[0])}</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {f.publishedAt ? formatDateTimeET(f.publishedAt) : "Not published"}
                          </span>
                        </div>
                        {f.body && <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">{f.body}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            )}
          </Card>

          {revisions.length > 0 && (
            <Card>
              <Collapsible>
                <CardHeader>
                  <CollapsibleTrigger
                    render={
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    }
                  >
                    <LuHistory className="size-4" />
                    Edit history ({revisions.length})
                  </CollapsibleTrigger>
                  <CardDescription>
                    Published alerts are never changed silently. Earlier versions are kept here.
                  </CardDescription>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="flex flex-col gap-4 pt-4">
                    {revisions.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3 text-sm">
                        <p className="text-xs text-muted-foreground">
                          Version {r.revision}
                          {r.replacedAt && ` · replaced ${formatDateTimeET(r.replacedAt)}`}
                          {r.note && ` · ${r.note}`}
                        </p>
                        <p className="mt-1 font-medium">{r.title}</p>
                        <AlertPlan
                          alert={{
                            kind: alert.kind,
                            buyLow: r.buyLow,
                            buyHigh: r.buyHigh,
                            sellPoints: r.sellPoints,
                            stop: r.stop,
                          }}
                          className="mt-2"
                        />
                        {r.body && <p className="mt-2 whitespace-pre-line text-muted-foreground">{r.body}</p>}
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {(alert.status === "closed" || alert.exits.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>{alert.status === "closed" ? "Result" : "Partial exits"}</CardTitle>
                <CardDescription>From HG&apos;s published buy and sell points</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-3xl font-semibold tracking-tight">
                  <Signed value={alert.resultPct ?? liveResult} digits={1} />
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Entry (buy point midpoint)</dt>
                  <dd className="text-right tabular-nums">{formatPrice(entry)}</dd>
                  {alert.exits.map((e, i) => (
                    <div key={i} className="contents">
                      <dt className="text-muted-foreground">
                        Exit {i + 1} ({formatPercent(e.portion, { signed: false, digits: 0 })})
                      </dt>
                      <dd className="text-right tabular-nums">{formatPrice(e.price)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {target && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LuCrosshair className="size-4" />
                  Strike target
                </CardTitle>
                <CardDescription>From the {formatDate(targets?.effectiveDate)} update</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Target</dt>
                  <dd className="text-right tabular-nums">{formatLevel(target.target)}</dd>
                  <dt className="text-muted-foreground">Break of</dt>
                  <dd className="text-right tabular-nums">{formatLevel(target.breakLevel)}</dd>
                  <dt className="text-muted-foreground">Put strike</dt>
                  <dd className="text-right tabular-nums">{formatLevel(target.putStrike)}</dd>
                  <dt className="text-muted-foreground">Expiry</dt>
                  <dd className="text-right tabular-nums">{formatExpiry(target.expiry)}</dd>
                </dl>
              </CardContent>
            </Card>
          )}

          {alert.symbol && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LuChartCandlestick className="size-4" />
                  {alert.symbol}
                </CardTitle>
                <CardDescription>
                  {ticker?.metrics
                    ? `Last close ${formatPrice(ticker.metrics.lastClose)} on ${formatDate(ticker.metrics.asOf)}`
                    : "No market data yet"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ButtonLink variant="outline" className="w-full" href={`/members/stocks/${alert.symbol}`}>
                  Open the stock page
                  <LuArrowUpRight />
                </ButtonLink>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Educational content, not personalized investment advice. Options trading involves risk and is not suitable
            for every investor.
          </p>
        </div>
      </div>
    </>
  )
}
