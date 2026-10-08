import type { AlertKind, Instrument, IsoDate } from "./domain/types"
import { formatInstrument, formatPrice } from "./format"

export const ALERT_KINDS: readonly AlertKind[] = ["buy", "sell", "update", "watch", "info"]

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  buy: "Buy",
  sell: "Sell",
  update: "Update",
  watch: "Watch",
  info: "Info",
}

export interface AlertFields {
  kind: AlertKind
  symbol: string | null
  assetType: "stock" | "option" | null
  optionRight: "call" | "put" | null
  strike: number | null
  expiry: string | null
  buyLow: number | null
  buyHigh: number | null
  sellPoints: readonly number[]
  stop: number | null
}

/** The traded instrument, or null for alerts that are not about one contract (info, market notes). */
export function alertInstrument(
  alert: Pick<AlertFields, "symbol" | "assetType" | "optionRight" | "strike" | "expiry">,
): Instrument | null {
  if (!alert.symbol || !alert.assetType) return null
  if (alert.assetType === "stock") return { assetType: "stock", symbol: alert.symbol }
  if (!alert.optionRight || alert.strike === null || !alert.expiry) return null
  return {
    assetType: "option",
    symbol: alert.symbol,
    right: alert.optionRight,
    strike: alert.strike,
    expiry: alert.expiry as IsoDate,
  }
}

/** "$3.20 to $3.40", "$3.20", or "At market" when no price was given. */
export function buyPointText(low: number | null, high: number | null): string {
  if (low === null && high === null) return "At market"
  if (low !== null && high !== null && low !== high) return `${formatPrice(low)} to ${formatPrice(high)}`
  return formatPrice(low ?? high)
}

export function sellPointsText(points: readonly number[]): string {
  return points.map((p, i) => `T${i + 1} ${formatPrice(p)}`).join(" · ")
}

/** One-line price plan: "Buy point $3.20 to $3.40 · T1 $5.00 · T2 $6.50 · Stop $2.40". */
export function alertPlanText(alert: Pick<AlertFields, "kind" | "buyLow" | "buyHigh" | "sellPoints" | "stop">): string {
  const parts: string[] = []
  if (alert.kind === "buy" || alert.buyLow !== null || alert.buyHigh !== null)
    parts.push(`Buy point ${buyPointText(alert.buyLow, alert.buyHigh)}`)
  if (alert.sellPoints.length > 0) parts.push(sellPointsText(alert.sellPoints))
  if (alert.stop !== null) parts.push(`Stop ${formatPrice(alert.stop)}`)
  return parts.join(" · ")
}

/** The default title: "TSM $472.50 Call · Exp Oct 23", or the symbol for stock alerts. */
export function defaultAlertTitle(alert: AlertFields): string {
  const instrument = alertInstrument(alert)
  if (instrument) return formatInstrument(instrument)
  return alert.symbol ?? ALERT_KIND_LABEL[alert.kind]
}

/** Notification text for a published alert. */
export function alertNotification(alert: AlertFields & { title: string; body: string }): {
  title: string
  body: string
} {
  const plan = alertPlanText(alert)
  const note = alert.body.replace(/\s+/g, " ").trim()
  const body = [plan, note].filter((s) => s.length > 0).join("\n")
  return {
    title: `${ALERT_KIND_LABEL[alert.kind]} · ${alert.title}`,
    body: body.length > 180 ? `${body.slice(0, 177)}...` : body,
  }
}
