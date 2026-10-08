import Link from "next/link"
import { buyPointText, defaultAlertTitle } from "@/core/alerts"
import { formatPercent, formatPrice } from "@/core/format"
import type { AlertDoc } from "@/server/model"
import { cn } from "@/lib/utils"
import { RelativeTime } from "@/components/shared/relative-time"
import { Signed, ToneBadge } from "../display"
import { AlertKindBadge } from "./alert-kind-badge"

export type AlertView = Pick<
  AlertDoc,
  | "id"
  | "kind"
  | "title"
  | "body"
  | "symbol"
  | "assetType"
  | "buyLow"
  | "buyHigh"
  | "sellPoints"
  | "stop"
  | "status"
  | "resultPct"
  | "parentId"
  | "edited"
> & {
  publishedAt: string | null
  /** True when the title is the contract line ("TSM $472.50 Call · Exp Oct 23"), shown in the mono font. */
  instrumentTitle: boolean
}

export function toAlertView(a: AlertDoc): AlertView {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    body: a.body,
    symbol: a.symbol,
    assetType: a.assetType,
    buyLow: a.buyLow,
    buyHigh: a.buyHigh,
    sellPoints: a.sellPoints,
    stop: a.stop,
    status: a.status,
    resultPct: a.resultPct,
    parentId: a.parentId,
    edited: a.edited,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    instrumentTitle: a.symbol !== null && a.title === defaultAlertTitle(a),
  }
}

export function AlertStatusBadge({ alert }: { alert: Pick<AlertView, "status" | "resultPct" | "kind" | "parentId"> }) {
  if (alert.parentId !== null || (alert.kind !== "buy" && alert.status !== "closed")) return null
  if (alert.status === "closed") {
    return (
      <ToneBadge tone="muted">
        Closed
        {alert.resultPct !== null && <Signed value={alert.resultPct} digits={1} icon={false} className="font-medium" />}
      </ToneBadge>
    )
  }
  return <ToneBadge tone="neutral">Open</ToneBadge>
}

/** The price plan as a compact three-column grid: buy point, targets, stop. */
export function AlertPlan({
  alert,
  className,
}: {
  alert: Pick<AlertView, "kind" | "buyLow" | "buyHigh" | "sellPoints" | "stop">
  className?: string
}) {
  const showBuy = alert.kind === "buy" || alert.buyLow !== null || alert.buyHigh !== null
  if (!showBuy && alert.sellPoints.length === 0 && alert.stop === null) return null
  const cells = [
    showBuy ? { label: "Buy point", value: buyPointText(alert.buyLow, alert.buyHigh) } : null,
    alert.sellPoints.length > 0
      ? {
          label: alert.kind === "sell" ? "Sold at" : "Targets",
          value: alert.sellPoints
            .map((p, i) => (alert.kind === "sell" ? formatPrice(p) : `T${i + 1} ${formatPrice(p)}`))
            .join(" · "),
        }
      : null,
    alert.stop !== null ? { label: "Stop", value: formatPrice(alert.stop) } : null,
  ].filter((c) => c !== null)
  return (
    <dl className={cn("grid gap-2 sm:grid-cols-3", className)}>
      {cells.map((c) => (
        <div key={c.label} className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{c.label}</dt>
          <dd className="text-sm font-medium tabular-nums">{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One alert in a feed. Unread alerts carry a dot; the whole card links to the detail page. */
export function AlertCard({
  alert,
  unread,
  lastClose,
  compact = false,
}: {
  alert: AlertView
  unread?: boolean
  lastClose?: number | null
  compact?: boolean
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30",
        unread && "border-foreground/20",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {unread && (
          <span className="size-2 shrink-0 rounded-full bg-foreground" aria-hidden="true">
            <span className="sr-only">Unread</span>
          </span>
        )}
        <AlertKindBadge kind={alert.kind} />
        <AlertStatusBadge alert={alert} />
        {alert.parentId !== null && <span className="text-xs text-muted-foreground">Follow-up</span>}
        {alert.edited && <span className="text-xs text-muted-foreground">Edited</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {alert.publishedAt && <RelativeTime iso={alert.publishedAt} />}
        </span>
      </header>
      <h3 className={cn("leading-snug font-medium", alert.instrumentTitle ? "font-mono text-[15px]" : "text-base")}>
        <Link
          href={`/members/alerts/${alert.id}`}
          className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {alert.title}
        </Link>
      </h3>
      {!compact && <AlertPlan alert={alert} />}
      {alert.body && (
        <p className={cn("text-sm text-muted-foreground", compact ? "line-clamp-1" : "line-clamp-3")}>{alert.body}</p>
      )}
      {!compact && (lastClose ?? null) !== null && alert.symbol && (
        <p className="text-xs text-muted-foreground">
          {alert.symbol} last close{" "}
          <span className="font-medium text-foreground tabular-nums">{formatPrice(lastClose)}</span>
          {alert.assetType === "stock" && alert.buyHigh !== null && lastClose !== null && lastClose !== undefined && (
            <> · {formatPercent((alert.buyHigh - lastClose) / lastClose)} to the buy point</>
          )}
        </p>
      )}
    </article>
  )
}
